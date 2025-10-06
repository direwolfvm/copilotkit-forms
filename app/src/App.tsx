import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ChangeEvent } from "react"
import Form from "@rjsf/core"
import type { IChangeEvent } from "@rjsf/core"
import validator from "@rjsf/validator-ajv8"
import { CopilotKit, useCopilotAction, useCopilotReadable } from "@copilotkit/react-core"
import { CopilotSidebar } from "@copilotkit/react-ui"
import { COPILOT_CLOUD_CHAT_URL } from "@copilotkit/shared"
import "@copilotkit/react-ui/styles.css"

import type { ProjectFormData, ProjectContact, SimpleProjectField } from "./schema/projectSchema"
import {
  createEmptyProjectData,
  formatProjectSummary,
  isNumericProjectField,
  projectFieldDetails,
  projectSchema,
  projectUiSchema
} from "./schema/projectSchema"
import { ProjectSummary } from "./components/ProjectSummary"
import {
  PermittingChecklistSection,
  type PermittingChecklistItem
} from "./components/PermittingChecklistSection"
import "./App.css"
import { getPublicApiKey, getRuntimeUrl } from "./runtimeConfig"
import { ProjectPersistenceError, saveProjectSnapshot, submitDecisionPayload } from "./utils/projectPersistence"
import { LocationSection } from "./components/LocationSection"
import { NepaReviewSection } from "./components/NepaReviewSection"
import type { GeospatialResultsState } from "./types/geospatial"
import {
  DEFAULT_BUFFER_MILES,
  prepareGeospatialPayload,
  summarizeIpac,
  summarizeNepassist,
  formatGeospatialResultsSummary
} from "./utils/geospatial"
import { majorPermits } from "./utils/majorPermits"

const CUSTOM_ADK_PROXY_URL = "/api/custom-adk/agent"

type CopilotRuntimeMode = "default" | "custom"

type CopilotRuntimeContextValue = {
  runtimeMode: CopilotRuntimeMode
  setRuntimeMode: (mode: CopilotRuntimeMode) => void
}

const CopilotRuntimeContext = createContext<CopilotRuntimeContextValue | undefined>(undefined)

function useCopilotRuntimeSelection() {
  const context = useContext(CopilotRuntimeContext)
  if (!context) {
    throw new Error("useCopilotRuntimeSelection must be used within a CopilotRuntimeContext provider")
  }
  return context
}

const MAJOR_PERMIT_SUMMARIES = majorPermits.map(
  (permit) => `${permit.title}: ${permit.description}`
)

type UpdatesPayload = Record<string, unknown>

type LocationFieldKey = "location_text" | "location_lat" | "location_lon" | "location_object"
type NepaFieldKey =
  | "nepa_categorical_exclusion_code"
  | "nepa_conformance_conditions"
  | "nepa_extraordinary_circumstances"

function generateChecklistItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `item-${Math.random().toString(36).slice(2, 11)}`
}

function normalizeChecklistLabel(label: string) {
  return label.trim().replace(/\s+/g, " ")
}

function toChecklistKey(label: string) {
  return normalizeChecklistLabel(label).toLowerCase()
}

type ChecklistUpsertInput = {
  label: string
  completed?: boolean
  notes?: string
  source?: PermittingChecklistItem["source"]
}

type DecisionSubmitState = {
  status: "idle" | "saving" | "success" | "error"
  message?: string
}

const MIN_PROJECT_IDENTIFIER = 10_000_000
const MAX_PROJECT_IDENTIFIER = 99_999_999

function generateRandomProjectIdentifier() {
  const cryptoObject = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  const range = MAX_PROJECT_IDENTIFIER - MIN_PROJECT_IDENTIFIER + 1
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    const values = cryptoObject.getRandomValues(new Uint32Array(1))
    const randomNumber = values[0] % range
    return (MIN_PROJECT_IDENTIFIER + randomNumber).toString()
  }
  const randomNumber = Math.floor(Math.random() * range)
  return (MIN_PROJECT_IDENTIFIER + randomNumber).toString()
}

function normalizeProjectIdentifier(id?: string) {
  if (id && /^\d{8}$/.test(id)) {
    return id
  }
  return generateRandomProjectIdentifier()
}

function applyGeneratedProjectId(base: ProjectFormData, previousId?: string): ProjectFormData {
  const next: ProjectFormData = { ...base }
  next.id = normalizeProjectIdentifier(next.id ?? previousId)
  return next
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

type PersistedProjectFormState = {
  formData: ProjectFormData
  lastSaved?: string
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
}

let persistedProjectFormState: PersistedProjectFormState | undefined

type ProjectFormWithCopilotProps = {
  showApiKeyWarning: boolean
}

function RuntimeSelectionControl() {
  const { runtimeMode, setRuntimeMode } = useCopilotRuntimeSelection()

  const handleModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value === "custom" ? "custom" : "default"
    setRuntimeMode(value)
  }

  return (
    <label className="runtime-toggle">
      <span className="runtime-toggle__label">Copilot runtime</span>
      <select
        className="runtime-toggle__select"
        value={runtimeMode}
        onChange={handleModeChange}
        aria-label="Select Copilot runtime"
      >
        <option value="default">Copilot Cloud</option>
        <option value="custom">Permitting ADK</option>
      </select>
    </label>
  )
}

function ProjectFormWithCopilot({ showApiKeyWarning }: ProjectFormWithCopilotProps) {
  const [formData, setFormData] = useState<ProjectFormData>(() =>
    persistedProjectFormState ? cloneValue(persistedProjectFormState.formData) : createEmptyProjectData()
  )
  const [lastSaved, setLastSaved] = useState<string | undefined>(() => persistedProjectFormState?.lastSaved)
  const [geospatialResults, setGeospatialResults] = useState<GeospatialResultsState>(() =>
    persistedProjectFormState
      ? cloneValue(persistedProjectFormState.geospatialResults)
      : { nepassist: { status: "idle" }, ipac: { status: "idle" }, messages: [] }
  )
  const [permittingChecklist, setPermittingChecklist] = useState<PermittingChecklistItem[]>(() =>
    persistedProjectFormState ? cloneValue(persistedProjectFormState.permittingChecklist) : []
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  const [decisionSubmitState, setDecisionSubmitState] = useState<DecisionSubmitState>({ status: "idle" })

  useEffect(() => {
    persistedProjectFormState = {
      formData: cloneValue(formData),
      lastSaved,
      geospatialResults: cloneValue(geospatialResults),
      permittingChecklist: cloneValue(permittingChecklist)
    }
  }, [formData, geospatialResults, lastSaved, permittingChecklist])

  const locationFieldDetail = useMemo(
    () => projectFieldDetails.find((field) => field.key === "location_text"),
    []
  )

  const nepaFieldConfigs = useMemo(() => {
    const keys: NepaFieldKey[] = [
      "nepa_categorical_exclusion_code",
      "nepa_conformance_conditions",
      "nepa_extraordinary_circumstances"
    ]
    return keys.reduce(
      (accumulator, key) => {
        const detail = projectFieldDetails.find((field) => field.key === key)
        if (detail) {
          accumulator[key] = {
            title: detail.title,
            description: detail.description,
            placeholder: detail.placeholder,
            rows: detail.rows
          }
        }
        return accumulator
      },
      {} as Partial<Record<NepaFieldKey, { title?: string; description?: string; placeholder?: string; rows?: number }>>
    )
  }, [])

  const assignProjectField = (
    target: ProjectFormData,
    field: SimpleProjectField,
    value: ProjectFormData[SimpleProjectField] | undefined
  ) => {
    if (value === undefined) {
      delete target[field]
    } else {
      ;(target as Record<SimpleProjectField, ProjectFormData[SimpleProjectField]>)[field] = value
    }
  }

  useCopilotReadable(
    {
      description: "Current CEQ project form data as formatted JSON",
      value: formData,
      convert: (_, value) => JSON.stringify(value, null, 2)
    },
    [formData]
  )

  useCopilotReadable(
    {
      description: "Human-readable project summary",
      value: formatProjectSummary(formData)
    },
    [formData]
  )

  useCopilotReadable(
    {
      description: "Latest geospatial screening results including NEPA Assist and IPaC findings",
      value: geospatialResults,
      convert: (_, value) => formatGeospatialResultsSummary(value)
    },
    [geospatialResults]
  )

  useCopilotReadable(
    {
      description: "Reference list of major federal permits and authorizations",
      value: MAJOR_PERMIT_SUMMARIES,
      convert: (_, value) => value.join("\n")
    },
    []
  )

  useCopilotReadable(
    {
      description: "Current permitting checklist items with completion status",
      value: permittingChecklist,
      convert: (_, value) =>
          value.length
            ? value
                .map(
                  (item: PermittingChecklistItem) =>
                    `- [${item.completed ? "x" : " "}] ${item.label}${item.notes ? ` — ${item.notes}` : ""}`
                )
              .join("\n")
          : "No permitting checklist items yet."
    },
    [permittingChecklist]
  )

  const upsertPermittingChecklistItems = useCallback((entries: ChecklistUpsertInput[]) => {
    setPermittingChecklist((previous) => {
      if (!entries.length) {
        return previous
      }

        const normalized = entries
          .map((entry): ChecklistUpsertInput | null => {
            const label = typeof entry.label === "string" ? normalizeChecklistLabel(entry.label) : ""
            if (!label) {
              return null
            }
            const notes = entry.notes?.trim()
            return {
              label,
              completed: typeof entry.completed === "boolean" ? entry.completed : undefined,
              notes: notes && notes.length ? notes : undefined,
              source: entry.source
            }
          })
        .filter((entry): entry is ChecklistUpsertInput => entry !== null)

      if (!normalized.length) {
        return previous
      }

      const next = [...previous]
      const indexByKey = new Map(next.map((item, index) => [toChecklistKey(item.label), index]))
      let changed = false

      for (const entry of normalized) {
        const key = toChecklistKey(entry.label)
        const existingIndex = indexByKey.get(key)
        if (existingIndex !== undefined) {
          const existing = next[existingIndex]
          let updated = false
          const completedValue = entry.completed
          if (typeof completedValue === "boolean" && existing.completed !== completedValue) {
            updated = true
          }
          const notesValue = entry.notes
          if (notesValue !== undefined && existing.notes !== notesValue) {
            updated = true
          }
          const sourceValue = entry.source
          if (sourceValue && existing.source !== sourceValue) {
            updated = true
          }
          if (updated) {
            next[existingIndex] = {
              ...existing,
              completed:
                typeof completedValue === "boolean" ? completedValue : existing.completed,
              notes: notesValue !== undefined ? notesValue : existing.notes,
              source: sourceValue ?? existing.source
            }
            changed = true
          }
        } else {
          const newItem: PermittingChecklistItem = {
            id: generateChecklistItemId(),
            label: entry.label,
            completed: typeof entry.completed === "boolean" ? entry.completed : false,
            notes: entry.notes,
            source: entry.source ?? "manual"
          }
          next.push(newItem)
          indexByKey.set(key, next.length - 1)
          changed = true
        }
      }

      return changed ? next : previous
    })
  }, [])

  const handleAddChecklistItem = useCallback(
    (label: string) => {
      upsertPermittingChecklistItems([{ label, completed: false, source: "manual" }])
    },
    [upsertPermittingChecklistItems]
  )

  const handleBulkAddFromSeed = useCallback(
    (labels: string[], source: PermittingChecklistItem["source"] = "seed") => {
      const entries = labels.map((label) => ({ label, source, completed: false }))
      upsertPermittingChecklistItems(entries)
    },
    [upsertPermittingChecklistItems]
  )

  const handleToggleChecklistItem = useCallback((id: string) => {
    setPermittingChecklist((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    )
  }, [])

  const handleRemoveChecklistItem = useCallback((id: string) => {
    setPermittingChecklist((previous) => previous.filter((item) => item.id !== id))
  }, [])

  const handleSubmitDecisionPayload = useCallback(async () => {
    setDecisionSubmitState({ status: "saving" })

    let preparedFormData = formData
    const candidateId = formData.id ? Number.parseInt(formData.id, 10) : Number.NaN
    if (!formData.id || Number.isNaN(candidateId) || !Number.isFinite(candidateId)) {
      const generated = applyGeneratedProjectId(formData, formData.id)
      preparedFormData = generated
      if (generated.id !== formData.id) {
        setFormData(generated)
      }
    }

    try {
      await submitDecisionPayload({
        formData: preparedFormData,
        geospatialResults,
        permittingChecklist
      })
      setDecisionSubmitState({ status: "success", message: "Decision payload submitted." })
    } catch (error) {
      console.error("Failed to submit decision payload", error)
      let message = "Unable to submit decision payloads."
      if (error instanceof ProjectPersistenceError) {
        message = error.message
      } else if (error instanceof Error) {
        message = error.message
      }
      setDecisionSubmitState({ status: "error", message })
    }
  }, [formData, geospatialResults, permittingChecklist, setFormData])

  useCopilotAction(
    {
      name: "updateProjectForm",
      description:
        "Update one or more fields on the CEQ Project form. Provide only the fields that should change.",
      parameters: [
        {
          name: "updates",
          type: "object",
          description:
            "Project field values to merge into the form. Strings should align with CEQ data standard semantics.",
          attributes: projectFieldDetails.map((field) => ({
            name: field.key,
            type: "string",
            description: field.description,
            required: false
          }))
        },
        {
          name: "sponsor_contact",
          type: "object",
          description:
            "Sponsor point of contact information. Provide any subset of name, organization, email, and phone.",
          required: false,
          attributes: [
            { name: "name", type: "string", description: "Contact name" },
            { name: "organization", type: "string", description: "Contact organization" },
            { name: "email", type: "string", description: "Contact email address" },
            { name: "phone", type: "string", description: "Contact phone number" }
          ]
        }
      ],
      handler: async ({ updates, sponsor_contact }: { updates?: UpdatesPayload; sponsor_contact?: ProjectContact }) => {
        setFormData((previous) => {
          const next: ProjectFormData = { ...previous }
          if (updates && typeof updates === "object") {
            for (const [rawKey, rawValue] of Object.entries(updates)) {
              const key = rawKey as SimpleProjectField
              if (!projectFieldDetails.some((field) => field.key === key)) {
                continue
              }

              const shouldDelete = rawValue === null || rawValue === "" || rawValue === undefined
              if (isNumericProjectField(key)) {
                if (shouldDelete) {
                  assignProjectField(next, key, undefined)
                } else if (typeof rawValue === "number") {
                  assignProjectField(next, key, rawValue as ProjectFormData[SimpleProjectField])
                } else {
                  const parsed = Number(
                    typeof rawValue === "string" ? rawValue : String(rawValue)
                  )
                  if (!Number.isNaN(parsed)) {
                    assignProjectField(next, key, parsed as ProjectFormData[SimpleProjectField])
                  }
                }
              } else {
                if (shouldDelete) {
                  assignProjectField(next, key, undefined)
                } else {
                  const stringValue =
                    typeof rawValue === "string"
                      ? rawValue
                      : rawValue !== undefined && rawValue !== null
                        ? String(rawValue)
                        : undefined
                  if (stringValue !== undefined) {
                    assignProjectField(next, key, stringValue as ProjectFormData[SimpleProjectField])
                  }
                }
              }
            }
          }

          if (sponsor_contact && typeof sponsor_contact === "object") {
            const mergedContact: ProjectContact = { ...(previous.sponsor_contact ?? {}) }
            for (const [contactKey, value] of Object.entries(sponsor_contact)) {
              if (value === undefined || value === null || value === "") {
                delete mergedContact[contactKey as keyof ProjectContact]
              } else {
                mergedContact[contactKey as keyof ProjectContact] = value as string
              }
            }
            if (Object.keys(mergedContact).length > 0) {
              next.sponsor_contact = mergedContact
            } else {
              delete next.sponsor_contact
            }
          }

          return applyGeneratedProjectId(next, previous.id)
        })
      }
    },
    [setFormData]
  )

  useCopilotAction(
    {
      name: "resetProjectForm",
      description: "Clear the CEQ Project form back to its initial state.",
      handler: async () => {
        setFormData(createEmptyProjectData())
        setLastSaved(undefined)
      }
    },
    [setFormData]
  )

  useCopilotAction(
    {
      name: "addPermittingChecklistItems",
      description:
        "Add or update permitting checklist entries. Use this to track likely permits, approvals, or consultations the project will require.",
      parameters: [
        {
          name: "items",
          type: "object[]",
          description: "Checklist items to merge into the permitting tracker.",
          attributes: [
            {
              name: "label",
              type: "string",
              description: "Name of the permit or authorization.",
              required: true
            },
            {
              name: "status",
              type: "string",
              description: "Use 'pending' or 'completed' to set status.",
              enum: ["pending", "completed"],
              required: false
            },
            {
              name: "notes",
              type: "string",
              description: "Optional short note or reference for the item.",
              required: false
            }
          ]
        }
      ],
      handler: async ({ items }) => {
        if (!Array.isArray(items)) {
          return
        }
        const entries: ChecklistUpsertInput[] = items.map((item) => {
          const label = typeof item?.label === "string" ? item.label : ""
          const status = typeof item?.status === "string" ? item.status.toLowerCase() : undefined
          return {
            label,
            source: "copilot",
            notes: typeof item?.notes === "string" ? item.notes : undefined,
            completed:
              status === "completed" ? true : status === "pending" ? false : undefined
          }
        })
        upsertPermittingChecklistItems(entries)
      }
    },
    [upsertPermittingChecklistItems]
  )

  const instructions = useMemo(
    () =>
      [
        "You are a permitting domain expert helping complete the CEQ Project entity form.",
        "Use the updateProjectForm action whenever you can fill in or revise structured fields.",
        "Important fields include:",
        ...projectFieldDetails.map((field) => `- ${field.title}: ${field.description}`),
        "Use addPermittingChecklistItems to maintain the permitting checklist. Suggest permits from the major federal inventory when relevant.",
        "Use resetProjectForm when the user asks to start over."
      ].join("\n"),
    []
  )

  const sidebarSuggestions = useMemo(
    () => [
      {
        title: "Check for missing details",
        message:
          "Review the project form and let me know what information is still missing or inconsistent."
      },
      {
        title: "Write a public summary",
        message: "Draft a public-friendly project summary using the structured fields we have so far."
      },
      {
        title: "Validate location data",
        message:
          "Confirm that the location description, coordinates, and GeoJSON tell a consistent story."
      },
      {
        title: "Draft permitting roadmap",
        message:
          "Review the project details and populate the permitting checklist with likely federal, state, and local approvals."
      }
    ],
    []
  )

  const handleChange = (event: IChangeEvent<ProjectFormData>) => {
    setFormData((previous) =>
      applyGeneratedProjectId(event.formData ?? createEmptyProjectData(), previous?.id)
    )
  }

  const handleSubmit = async (event: IChangeEvent<ProjectFormData>) => {
    const next = applyGeneratedProjectId(event.formData ?? createEmptyProjectData(), formData?.id)
    setFormData(next)
    setIsSaving(true)
    setSaveError(undefined)
    setDecisionSubmitState((previous) => (previous.status === "idle" ? previous : { status: "idle" }))

    try {
      await saveProjectSnapshot({
        formData: next,
        geospatialResults
      })
      setLastSaved(new Date().toLocaleString())
    } catch (error) {
      console.error("Failed to save project snapshot", error)
      setLastSaved(undefined)
      if (error instanceof ProjectPersistenceError) {
        setSaveError(error.message)
      } else if (error instanceof Error) {
        setSaveError(error.message)
      } else {
        setSaveError("Unable to save project snapshot.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setFormData(createEmptyProjectData())
    setLastSaved(undefined)
    setGeospatialResults({ nepassist: { status: "idle" }, ipac: { status: "idle" }, messages: [] })
    setPermittingChecklist([])
    setSaveError(undefined)
    setIsSaving(false)
    setDecisionSubmitState({ status: "idle" })
  }

  const updateLocationFields = useCallback(
    (
      updates: Partial<Pick<ProjectFormData, "location_text" | "location_lat" | "location_lon" | "location_object">>
    ) => {
      setFormData((previous) => {
        const base = previous ?? createEmptyProjectData()
        const next: ProjectFormData = { ...base }
        const mutableNext = next as Record<LocationFieldKey, ProjectFormData[LocationFieldKey]>
        let changed = false

        const applyUpdate = <K extends LocationFieldKey>(
          key: K,
          value: ProjectFormData[K] | undefined
        ) => {
          if (!Object.prototype.hasOwnProperty.call(updates, key)) {
            return
          }
          if (value === undefined) {
            if (key in next) {
              delete mutableNext[key]
              changed = true
            }
            return
          }
          if (mutableNext[key] !== value) {
            mutableNext[key] = value as ProjectFormData[LocationFieldKey]
            changed = true
          }
        }

        applyUpdate("location_text", updates.location_text)
        applyUpdate("location_lat", updates.location_lat)
        applyUpdate("location_lon", updates.location_lon)
        applyUpdate("location_object", updates.location_object)

        if (!changed) {
          return base
        }
        return applyGeneratedProjectId(next, base.id)
      })
    },
    [setFormData]
  )

  const handleLocationTextChange = useCallback(
    (value: string) => {
      updateLocationFields({ location_text: value })
    },
    [updateLocationFields]
  )

  const handleLocationGeometryChange = useCallback(
    (
      updates: Partial<Pick<ProjectFormData, "location_lat" | "location_lon" | "location_object">>
    ) => {
      if (Object.prototype.hasOwnProperty.call(updates, "location_object") && !updates.location_object) {
        setGeospatialResults({ nepassist: { status: "idle" }, ipac: { status: "idle" }, messages: [] })
      }
      updateLocationFields(updates)
    },
    [updateLocationFields]
  )

  const handleNepaFieldChange = useCallback(
    (key: NepaFieldKey, value: string | undefined) => {
      setFormData((previous) => {
        const base = previous ?? createEmptyProjectData()
        const next: ProjectFormData = { ...base }
        const mutableNext = next as Record<NepaFieldKey, ProjectFormData[NepaFieldKey]>
        const hasExistingValue = Object.prototype.hasOwnProperty.call(next, key)

        if (!value) {
          if (hasExistingValue) {
            delete mutableNext[key]
            return applyGeneratedProjectId(next, base.id)
          }
          return base
        }

        if (!hasExistingValue || mutableNext[key] !== value) {
          mutableNext[key] = value
          return applyGeneratedProjectId(next, base.id)
        }

        return base
      })
    },
    [setFormData]
  )

  const handleRunGeospatialScreen = useCallback(async () => {
    const prepared = prepareGeospatialPayload(formData.location_object ?? null)
    const messages = prepared.errors
    const ipacNotice = messages.find((message) => message.toLowerCase().includes("ipac"))
    const generalMessages = ipacNotice ? messages.filter((message) => message !== ipacNotice) : messages

    setGeospatialResults({
      nepassist: prepared.nepassist
        ? { status: "loading" }
        : { status: "error", error: generalMessages[0] ?? "Unable to prepare NEPA Assist request." },
      ipac: prepared.ipac
        ? { status: "loading" }
        : {
            status: "error",
            error: ipacNotice ?? generalMessages[0] ?? "IPaC is not available for this geometry."
          },
      lastRunAt: new Date().toISOString(),
      messages: generalMessages.length ? generalMessages : undefined
    })

    const tasks: Promise<void>[] = []

    if (prepared.nepassist) {
      const nepaBody = {
        coords: prepared.nepassist.coords,
        type: prepared.nepassist.type,
        bufferMiles: DEFAULT_BUFFER_MILES
      }

      tasks.push(
        (async () => {
          try {
            const response = await fetch("/api/geospatial/nepassist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(nepaBody)
            })
            const text = await response.text()
            let payload: any = null
            if (text) {
              try {
                payload = JSON.parse(text)
              } catch (error) {
                payload = { data: text }
              }
            }
            if (!response.ok) {
              const errorMessage =
                (payload && typeof payload === "object" && typeof payload.error === "string"
                  ? payload.error
                  : text) || `NEPA Assist request failed (${response.status})`
              throw new Error(errorMessage)
            }
            const data = payload && typeof payload === "object" && "data" in payload ? payload.data : payload
            setGeospatialResults((previous) => ({
              ...previous,
              nepassist: {
                status: "success",
                summary: summarizeNepassist(data),
                raw: data,
                meta: payload?.meta
              }
            }))
          } catch (error) {
            const message = error instanceof Error ? error.message : "NEPA Assist request failed."
            setGeospatialResults((previous) => ({
              ...previous,
              nepassist: { status: "error", error: message }
            }))
          }
        })()
      )
    }

    if (prepared.ipac) {
      const ipacBody = {
        projectLocationWKT: prepared.ipac.wkt,
        includeOtherFwsResources: true,
        includeCrithabGeometry: false,
        saveLocationForProjectCreation: false,
        timeout: 5
      }

      tasks.push(
        (async () => {
          try {
            const response = await fetch("/api/geospatial/ipac", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(ipacBody)
            })
            const text = await response.text()
            let payload: any = null
            if (text) {
              try {
                payload = JSON.parse(text)
              } catch (error) {
                payload = { data: text }
              }
            }
            if (!response.ok) {
              const errorMessage =
                (payload && typeof payload === "object" && typeof payload.error === "string"
                  ? payload.error
                  : text) || `IPaC request failed (${response.status})`
              throw new Error(errorMessage)
            }
            const data = payload && typeof payload === "object" && "data" in payload ? payload.data : payload
            setGeospatialResults((previous) => ({
              ...previous,
              ipac: {
                status: "success",
                summary: summarizeIpac(data),
                raw: data,
                meta: payload?.meta
              }
            }))
          } catch (error) {
            const message = error instanceof Error ? error.message : "IPaC request failed."
            setGeospatialResults((previous) => ({
              ...previous,
              ipac: { status: "error", error: message }
            }))
          }
        })()
      )
    }

    if (tasks.length === 0) {
      return
    }

    await Promise.allSettled(tasks)
  }, [formData.location_object])

  const isGeospatialRunning =
    geospatialResults.nepassist.status === "loading" || geospatialResults.ipac.status === "loading"

  const hasGeometry = Boolean(formData.location_object)

  return (
    <CopilotSidebar
      instructions={instructions}
      defaultOpen
      suggestions={sidebarSuggestions}
      clickOutsideToClose={false}
    >
      <main className="app usa-prose">
        <header className="app-header">
          <div>
            <h1>Project Portal</h1>
            <p>
              Start your project by filling out the forms below. The Copilot can translate unstructured notes into the schema or suggest
              corrections as you work.
            </p>
          </div>
          <div className="actions">
            <RuntimeSelectionControl />
            <button type="button" className="usa-button usa-button--outline secondary" onClick={handleReset}>
              Reset form
            </button>
            {isSaving ? (
              <span className="status" aria-live="polite">Saving…</span>
            ) : saveError ? (
              <span className="status status--error" role="alert">{saveError}</span>
            ) : lastSaved ? (
              <span className="status">Last saved {lastSaved}</span>
            ) : null}
          </div>
        </header>

        {showApiKeyWarning ? (
          <div className="usa-alert usa-alert--warning usa-alert--slim" role="alert">
            <div className="usa-alert__body">
              <h3 className="usa-alert__heading">No Copilot Cloud key detected.</h3>
              <p className="usa-alert__text">
                Set <code>VITE_COPILOTKIT_PUBLIC_API_KEY</code> in a <code>.env</code> file to enable live Copilot
                responses. The form will continue to work without it.
              </p>
            </div>
          </div>
        ) : null}

        <section className="content">
          <ProjectSummary data={formData} />
          {locationFieldDetail ? (
            <LocationSection
              title={locationFieldDetail.title}
              description={locationFieldDetail.description}
              placeholder={locationFieldDetail.placeholder}
              rows={locationFieldDetail.rows}
              locationText={formData.location_text}
              geometry={formData.location_object}
              onLocationTextChange={handleLocationTextChange}
              onLocationGeometryChange={handleLocationGeometryChange}
            />
          ) : null}
          <div className="form-panel">
            <Form<ProjectFormData>
              schema={projectSchema}
              uiSchema={projectUiSchema}
              validator={validator}
              formData={formData}
              onChange={handleChange}
              onSubmit={handleSubmit}
              liveValidate
            >
              <div className="form-panel__actions">
                <button type="submit" className="usa-button primary" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save project snapshot"}
                </button>
                <button
                  type="button"
                  className="usa-button usa-button--outline secondary"
                  onClick={handleSubmitDecisionPayload}
                  disabled={isSaving || decisionSubmitState.status === "saving"}
                >
                  {decisionSubmitState.status === "saving" ? "Submitting…" : "Submit decision payload"}
                </button>
              </div>
              {decisionSubmitState.status === "saving" ? (
                <div className="form-panel__status">
                  <span className="status" role="status">Submitting decision payload…</span>
                </div>
              ) : decisionSubmitState.status === "error" ? (
                <div className="form-panel__status">
                  <span className="status status--error" role="alert">{decisionSubmitState.message}</span>
                </div>
              ) : decisionSubmitState.status === "success" ? (
                <div className="form-panel__status">
                  <span className="status" role="status">
                    {decisionSubmitState.message ?? "Decision payload submitted."}
                  </span>
                </div>
              ) : null}
            </Form>
          </div>
          <PermittingChecklistSection
            items={permittingChecklist}
            onAddItem={handleAddChecklistItem}
            onToggleItem={handleToggleChecklistItem}
            onRemoveItem={handleRemoveChecklistItem}
            onBulkAddFromSeed={handleBulkAddFromSeed}
          />
          <NepaReviewSection
            values={{
              nepa_categorical_exclusion_code: formData.nepa_categorical_exclusion_code,
              nepa_conformance_conditions: formData.nepa_conformance_conditions,
              nepa_extraordinary_circumstances: formData.nepa_extraordinary_circumstances
            }}
            fieldConfigs={nepaFieldConfigs}
            onFieldChange={handleNepaFieldChange}
            geospatialResults={geospatialResults}
            onRunGeospatialScreen={handleRunGeospatialScreen}
            isRunningGeospatial={isGeospatialRunning}
            hasGeometry={hasGeometry}
            bufferMiles={DEFAULT_BUFFER_MILES}
          />
        </section>
      </main>
    </CopilotSidebar>
  )
}

const publicApiKey = getPublicApiKey()
const defaultRuntimeUrl = getRuntimeUrl() || COPILOT_CLOUD_CHAT_URL

function App() {
  const [runtimeMode, setRuntimeMode] = useState<CopilotRuntimeMode>("default")

  const runtimeContextValue = useMemo(
    () => ({ runtimeMode, setRuntimeMode }),
    [runtimeMode, setRuntimeMode]
  )

  const effectiveRuntimeUrl = runtimeMode === "custom" ? CUSTOM_ADK_PROXY_URL : defaultRuntimeUrl
  const showApiKeyWarning = runtimeMode === "default" && !publicApiKey

  return (
    <CopilotRuntimeContext.Provider value={runtimeContextValue}>
      <CopilotKit
        key={runtimeMode}
        publicApiKey={publicApiKey || undefined}
        runtimeUrl={effectiveRuntimeUrl || undefined}
      >
        <ProjectFormWithCopilot showApiKeyWarning={showApiKeyWarning} />
      </CopilotKit>
    </CopilotRuntimeContext.Provider>
  )
}

export default App
