import { useCallback, useMemo, useState } from "react"
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
import "./App.css"
import { getPublicApiKey, getRuntimeUrl } from "./runtimeConfig"
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

type UpdatesPayload = Record<string, unknown>

type LocationFieldKey = "location_text" | "location_lat" | "location_lon" | "location_object"
type NepaFieldKey =
  | "nepa_categorical_exclusion_code"
  | "nepa_conformance_conditions"
  | "nepa_extraordinary_circumstances"

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function generateRandomToken(length: number) {
  const cryptoObject = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    const values = cryptoObject.getRandomValues(new Uint8Array(length))
    return Array.from(values, (value) => BASE64_ALPHABET[value % BASE64_ALPHABET.length]).join("")
  }
  return Array.from({ length }, () => BASE64_ALPHABET[Math.floor(Math.random() * BASE64_ALPHABET.length)])
    .join("")
}

function computeAgencyCode(leadAgency?: string) {
  if (!leadAgency) {
    return undefined
  }
  const trimmed = leadAgency.trim()
  if (!trimmed) {
    return undefined
  }
  const parts = trimmed.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const acronym = parts.map((part) => part[0] ?? "").join("")
  const sanitizedSource = (acronym.length >= 2 ? acronym : trimmed.replace(/[^A-Za-z0-9]/g, "")).toUpperCase()
  return sanitizedSource.slice(0, 6) || undefined
}

function normalizeFiscalYear(value?: string | number) {
  if (value === undefined || value === null) {
    return undefined
  }
  const digits = value.toString().match(/\d+/g)
  if (!digits) {
    return undefined
  }
  const numericString = digits.join("")
  if (numericString.length === 2) {
    return `20${numericString}`
  }
  if (numericString.length >= 4) {
    return numericString.slice(-4)
  }
  return numericString.padStart(4, "0")
}

function parseProjectId(id?: string) {
  if (!id) {
    return undefined
  }
  const match = /^([A-Z0-9]+)-FY(\d{4})-([A-Za-z0-9+/]{4})$/.exec(id)
  if (!match) {
    return undefined
  }
  return {
    agency: match[1] as string,
    fiscalYear: match[2] as string,
    random: match[3] as string
  }
}

function buildProjectIdentifier(
  leadAgency?: string,
  fiscalYear?: string | number,
  existingId?: string
) {
  const agencyCode = computeAgencyCode(leadAgency)
  const normalizedFiscalYear = normalizeFiscalYear(fiscalYear)
  if (!agencyCode || !normalizedFiscalYear) {
    return undefined
  }

  const existingParts = parseProjectId(existingId)
  const randomComponent =
    existingParts &&
    existingParts.agency === agencyCode &&
    existingParts.fiscalYear === normalizedFiscalYear
      ? existingParts.random
      : generateRandomToken(4)

  return `${agencyCode}-FY${normalizedFiscalYear}-${randomComponent}`
}

function applyGeneratedProjectId(base: ProjectFormData, previousId?: string): ProjectFormData {
  const next: ProjectFormData = { ...base }
  const generatedId = buildProjectIdentifier(next.lead_agency, next.fiscal_year, previousId ?? next.id)
  if (generatedId) {
    next.id = generatedId
  } else {
    delete next.id
  }
  return next
}

type ProjectFormWithCopilotProps = {
  showApiKeyWarning: boolean
}

function ProjectFormWithCopilot({ showApiKeyWarning }: ProjectFormWithCopilotProps) {
  const [formData, setFormData] = useState<ProjectFormData>(() => createEmptyProjectData())
  const [lastSaved, setLastSaved] = useState<string>()
  const [geospatialResults, setGeospatialResults] = useState<GeospatialResultsState>(() => ({
    nepassist: { status: "idle" },
    ipac: { status: "idle" },
    messages: []
  }))

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

  const instructions = useMemo(
    () =>
      [
        "You are a permitting domain expert helping complete the CEQ Project entity form.",
        "Use the updateProjectForm action whenever you can fill in or revise structured fields.",
        "Important fields include:",
        ...projectFieldDetails.map((field) => `- ${field.title}: ${field.description}`),
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
      }
    ],
    []
  )

  const handleChange = (event: IChangeEvent<ProjectFormData>) => {
    setFormData((previous) =>
      applyGeneratedProjectId(event.formData ?? createEmptyProjectData(), previous?.id)
    )
  }

  const handleSubmit = (event: IChangeEvent<ProjectFormData>) => {
    setFormData((previous) =>
      applyGeneratedProjectId(event.formData ?? createEmptyProjectData(), previous?.id)
    )
    setLastSaved(new Date().toLocaleString())
  }

  const handleReset = () => {
    setFormData(createEmptyProjectData())
    setLastSaved(undefined)
    setGeospatialResults({ nepassist: { status: "idle" }, ipac: { status: "idle" }, messages: [] })
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
    [updateLocationFields, setGeospatialResults]
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
      <main className="app">
        <header className="app-header">
          <div>
            <h1>Project Portal</h1>
            <p>
              Start your project by filling out the forms below. The Copilot can translate unstructured notes into the schema or suggest
              corrections as you work.
            </p>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={handleReset}>
              Reset form
            </button>
            {lastSaved ? <span className="status">Last saved {lastSaved}</span> : null}
          </div>
        </header>

        {showApiKeyWarning ? (
          <div className="callout warning" role="note">
            <strong>No Copilot Cloud key detected.</strong>
            <p>
              Set <code>VITE_COPILOTKIT_PUBLIC_API_KEY</code> in a <code>.env</code> file to enable live
              Copilot responses. The form will continue to work without it.
            </p>
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
              <button type="submit" className="primary">
                Save project snapshot
              </button>
            </Form>
          </div>
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
const runtimeUrl = getRuntimeUrl() || COPILOT_CLOUD_CHAT_URL

function App() {
  return (
    <CopilotKit
      publicApiKey={publicApiKey || undefined}
      runtimeUrl={runtimeUrl || undefined}
    >
      <ProjectFormWithCopilot showApiKeyWarning={!publicApiKey} />
    </CopilotKit>
  )
}

export default App
