import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import type { ChangeEvent, ReactNode } from "react"
import Form from "@rjsf/core"
import type { IChangeEvent } from "@rjsf/core"
import validator from "@rjsf/validator-ajv8"
import { CopilotKit, useCopilotAction, useCopilotReadable } from "@copilotkit/react-core"
import { CopilotSidebar } from "@copilotkit/react-ui"
import { COPILOT_CLOUD_CHAT_URL } from "@copilotkit/shared"
import "@copilotkit/react-ui/styles.css"
import "./copilot-overrides.css"

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
import {
  ProjectPersistenceError,
  saveProjectSnapshot,
  submitDecisionPayload,
  evaluatePreScreeningData,
  loadProjectPortalState,
  loadProcessInformation,
  PRE_SCREENING_PROCESS_MODEL_ID,
  type LoadedPermittingChecklistItem,
  type ProcessInformation,
  type LoadedPermittingChecklistItem,
  type PortalProgressState
} from "./utils/projectPersistence"
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
import type { GeometrySource, ProjectGisUpload, UploadedGisFile } from "./types/gis"

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
type LocationFieldUpdates =
  Partial<Pick<ProjectFormData, LocationFieldKey>> & {
    arcgisJson?: string
    geometrySource?: GeometrySource
    uploadedFile?: UploadedGisFile | null
  }
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
  action?: "save" | "submit"
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

function createInitialGeospatialResults(): GeospatialResultsState {
  return { nepassist: { status: "idle" }, ipac: { status: "idle" }, messages: [] }
}

function createInitialPortalProgress(): PortalProgressState {
  return {
    projectSnapshot: {},
    preScreening: {
      hasDecisionPayloads: false
    }
  }
}

type PersistedProjectFormState = {
  formData: ProjectFormData
  lastSaved?: string
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
  hasSavedSnapshot: boolean
  gisUpload: ProjectGisUpload
  portalProgress: PortalProgressState
}

let persistedProjectFormState: PersistedProjectFormState | undefined

type ProcessInformationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; info: ProcessInformation }
  | { status: "error"; message: string }
type ProgressStatus = "not-started" | "in-progress" | "complete"

const PROGRESS_STATUS_LABELS: Record<ProgressStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  complete: "Complete"
}

function formatProgressDate(iso?: string): string | undefined {
  if (!iso) {
    return undefined
  }
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) {
    return undefined
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  })
}

type PortalProgressIndicatorProps = {
  progress: PortalProgressState
  hasSavedSnapshot: boolean
}

function PortalProgressIndicator({ progress, hasSavedSnapshot }: PortalProgressIndicatorProps) {
  const projectSnapshotComplete = hasSavedSnapshot || !!progress.projectSnapshot.initiatedAt
  const projectSnapshotStatus: ProgressStatus = projectSnapshotComplete ? "complete" : "not-started"
  const projectSnapshotDate = formatProgressDate(progress.projectSnapshot.initiatedAt)
  const projectSnapshotDetail = projectSnapshotComplete
    ? "Project initiation case event recorded."
    : "Save the project snapshot to start the process."
  const projectSnapshotTimestamp = projectSnapshotDate
    ? `Initiated ${projectSnapshotDate}`
    : undefined

  const preScreening = progress.preScreening
  let preScreeningStatus: ProgressStatus = "not-started"
  if (preScreening.completedAt) {
    preScreeningStatus = "complete"
  } else if (preScreening.initiatedAt) {
    preScreeningStatus = "in-progress"
  }

  const hasPreScreeningActivity =
    preScreening.hasDecisionPayloads ||
    typeof preScreening.initiatedAt === "string" ||
    typeof preScreening.completedAt === "string"

  const lastActivityTimestamp =
    preScreening.lastActivityAt ?? preScreening.completedAt ?? preScreening.initiatedAt
  const lastActivityDate = formatProgressDate(lastActivityTimestamp)

  const preScreeningDetail = (() => {
    if (preScreeningStatus === "complete") {
      return lastActivityDate
        ? `Decision payload submitted ${lastActivityDate}.`
        : "Decision payload submitted."
    }
    if (preScreeningStatus === "in-progress") {
      return lastActivityDate
        ? `Pre-screening in progress. Last activity ${lastActivityDate}.`
        : "Pre-screening in progress."
    }
    return "Pre-screening has not started."
  })()

  let showCaution = false
  let cautionMessage: string | undefined
  if (preScreeningStatus !== "complete" && hasPreScreeningActivity && lastActivityTimestamp) {
    const parsedTimestamp = Date.parse(lastActivityTimestamp)
    if (!Number.isNaN(parsedTimestamp)) {
      const oneWeekInMs = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - parsedTimestamp > oneWeekInMs) {
        showCaution = true
        cautionMessage = lastActivityDate
          ? `No activity since ${lastActivityDate}.`
          : "No pre-screening activity recorded in the last week."
      }
    }
  }

  return (
    <section className="portal-progress" aria-label="Project progress">
      <ProgressPanel
        name="Project snapshot"
        status={projectSnapshotStatus}
        detail={projectSnapshotDetail}
        timestampLabel={projectSnapshotTimestamp}
      />
      <ProgressPanel
        name="Pre-screening"
        status={preScreeningStatus}
        detail={preScreeningDetail}
        caution={showCaution}
        cautionMessage={cautionMessage}
      />
    </section>
  )
}

type ProgressPanelProps = {
  name: string
  status: ProgressStatus
  detail: string
  timestampLabel?: string
  caution?: boolean
  cautionMessage?: string
}

function ProgressPanel({
  name,
  status,
  detail,
  timestampLabel,
  caution,
  cautionMessage
}: ProgressPanelProps) {
  return (
    <div className={`portal-progress__panel portal-progress__panel--${status}`}>
      <div className="portal-progress__panel-header">
        <h2 className="portal-progress__name">{name}</h2>
      </div>
      <div className={`portal-progress__status portal-progress__status--${status}`}>
        <span className="portal-progress__indicator" aria-hidden="true" />
        <span>{PROGRESS_STATUS_LABELS[status]}</span>
      </div>
      {timestampLabel ? <div className="portal-progress__timestamp">{timestampLabel}</div> : null}
      <p className="portal-progress__detail">{detail}</p>
      {caution && cautionMessage ? (
        <div className="portal-progress__notice" role="note">
          <span className="portal-progress__notice-icon" aria-hidden="true">
            !
          </span>
          <span>{cautionMessage}</span>
        </div>
      ) : null}
    </div>
  )
}

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

function formatDisplayDate(timestamp?: string | null) {
  if (!timestamp) {
    return undefined
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toLocaleString()
}

function formatDisplayDateOnly(dateString?: string | null) {
  if (!dateString) {
    return undefined
  }

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toLocaleDateString()
}

type DefinitionField = {
  label: string
  value?: ReactNode
}

function DefinitionList({ fields }: { fields: DefinitionField[] }) {
  const items = fields.filter((field) => {
    const value = field.value
    if (value === undefined || value === null) {
      return false
    }

    if (typeof value === "string") {
      return value.trim().length > 0
    }

    return true
  })

  if (!items.length) {
    return <p className="process-info-section__empty">No additional metadata is available.</p>
  }

  return (
    <dl className="process-info-definition-list">
      {items.map((field) => (
        <div key={field.label} className="process-info-definition">
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ProcessInformationDetails({ info }: { info: ProcessInformation }) {
  const { processModel, legalStructure, decisionElements } = info

  const processTitle =
    processModel.title && processModel.title.trim().length > 0
      ? processModel.title.trim()
      : `Process model ${processModel.id}`

  const processDescription =
    processModel.description && processModel.description.trim().length > 0
      ? processModel.description
      : "No description has been provided for this process model."

  const processFields: DefinitionField[] = [
    { label: "Model identifier", value: processModel.id.toString() }
  ]

  const addProcessField = (label: string, value?: string | null) => {
    if (!value) {
      return
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return
    }
    processFields.push({ label, value: trimmed })
  }

  addProcessField("Agency", processModel.agency)
  addProcessField("Screening guidance", processModel.screeningDescription)
  addProcessField("Legal reference", processModel.legalStructureText)
  addProcessField("Notes", processModel.notes)

  const formattedProcessUpdated = formatDisplayDate(processModel.lastUpdated)
  if (formattedProcessUpdated) {
    processFields.push({ label: "Last updated", value: formattedProcessUpdated })
  }

  let legalStructureSection: ReactNode
  if (legalStructure) {
    const legalTitle =
      legalStructure.title && legalStructure.title.trim().length > 0
        ? legalStructure.title.trim()
        : `Legal structure ${legalStructure.id}`

    const legalDescription =
      legalStructure.description && legalStructure.description.trim().length > 0
        ? legalStructure.description
        : undefined

    const legalFields: DefinitionField[] = [
      { label: "Record identifier", value: legalStructure.id.toString() }
    ]

    const addLegalField = (label: string, value?: string | null) => {
      if (!value) {
        return
      }
      const trimmed = value.trim()
      if (!trimmed) {
        return
      }
      legalFields.push({ label, value: trimmed })
    }

    addLegalField("Citation", legalStructure.citation)
    addLegalField("Issuing authority", legalStructure.issuingAuthority)

    const formattedEffectiveDate = formatDisplayDateOnly(legalStructure.effectiveDate)
    if (formattedEffectiveDate) {
      legalFields.push({ label: "Effective date", value: formattedEffectiveDate })
    }

    if (legalStructure.url && legalStructure.url.trim().length > 0) {
      const href = legalStructure.url.trim()
      legalFields.push({
        label: "Reference URL",
        value: (
          <a href={href} target="_blank" rel="noreferrer">
            {href}
          </a>
        )
      })
    }

    legalStructureSection = (
      <section className="process-info-section">
        <h3>{legalTitle}</h3>
        {legalDescription ? (
          <p className="process-info-section__description">{legalDescription}</p>
        ) : null}
        <DefinitionList fields={legalFields} />
      </section>
    )
  } else {
    const legalReferenceText =
      processModel.legalStructureText && processModel.legalStructureText.trim().length > 0
        ? processModel.legalStructureText.trim()
        : undefined

    legalStructureSection = (
      <section className="process-info-section">
        <h3>Legal framework</h3>
        <p className="process-info-section__empty">
          Detailed legal structure information is not available.
          {legalReferenceText ? ` Reference: ${legalReferenceText}` : ""}
        </p>
      </section>
    )
  }

  const decisionItems = decisionElements.map((element) => {
    const elementTitle =
      element.title && element.title.trim().length > 0
        ? element.title.trim()
        : `Decision element ${element.id}`
    const elementDescription =
      element.description && element.description.trim().length > 0
        ? element.description
        : undefined

    const elementFields: DefinitionField[] = [
      { label: "Element identifier", value: element.id.toString() }
    ]

    const addElementField = (label: string, value?: string | null) => {
      if (!value) {
        return
      }
      const trimmed = value.trim()
      if (!trimmed) {
        return
      }
      elementFields.push({ label, value: trimmed })
    }

    addElementField("Category", element.category)
    addElementField("Measure", element.measure)

    if (typeof element.threshold === "number" && Number.isFinite(element.threshold)) {
      elementFields.push({ label: "Threshold", value: element.threshold.toString() })
    }

    if (typeof element.spatial === "boolean") {
      elementFields.push({ label: "Spatial", value: element.spatial ? "Yes" : "No" })
    }

    if (typeof element.intersect === "boolean") {
      elementFields.push({
        label: "Requires intersection",
        value: element.intersect ? "Yes" : "No"
      })
    }

    addElementField("Form prompt", element.formText)
    addElementField("Response guidance", element.formResponseDescription)
    addElementField("Evaluation method", element.evaluationMethod)

    const formattedElementUpdated = formatDisplayDate(element.lastUpdated)
    if (formattedElementUpdated) {
      elementFields.push({ label: "Last updated", value: formattedElementUpdated })
    }

    return (
      <li key={element.id} className="process-info-decision">
        <h4>{elementTitle}</h4>
        {elementDescription ? (
          <p className="process-info-decision__description">{elementDescription}</p>
        ) : null}
        <DefinitionList fields={elementFields} />
      </li>
    )
  })

  const decisionDescription = decisionElements.length
    ? `This process model includes ${
        decisionElements.length === 1
          ? "one decision element"
          : `${decisionElements.length} decision elements`
      } that guide the pre-screening review.`
    : null

  return (
    <>
      <section className="process-info-section">
        <h3>{processTitle}</h3>
        <p className="process-info-section__description">{processDescription}</p>
        <DefinitionList fields={processFields} />
      </section>
      {legalStructureSection}
      <section className="process-info-section">
        <h3>Decision elements</h3>
        {decisionDescription ? (
          <p className="process-info-section__description">{decisionDescription}</p>
        ) : (
          <p className="process-info-section__empty">
            No decision elements are linked to this process model.
          </p>
        )}
        {decisionElements.length ? (
          <ul className="process-info-decision-list">{decisionItems}</ul>
        ) : null}
      </section>
    </>
  )
}

interface ProcessInformationModalProps {
  isOpen: boolean
  state: ProcessInformationState
  onDismiss: () => void
  onRetry: () => void
}

function ProcessInformationModal({
  isOpen,
  state,
  onDismiss,
  onRetry
}: ProcessInformationModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onDismiss()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onDismiss])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const { body } = document
    if (!body) {
      return
    }

    const previousOverflow = body.style.overflow
    body.style.overflow = "hidden"

    return () => {
      body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  let content: ReactNode
  if (state.status === "loading" || state.status === "idle") {
    content = (
      <p className="process-info-modal__status" role="status" aria-live="polite">
        Loading process information…
      </p>
    )
  } else if (state.status === "error") {
    content = (
      <div className="process-info-modal__error" role="alert">
        <p>{state.message}</p>
        <div className="process-info-modal__actions">
          <button
            type="button"
            className="usa-button usa-button--outline secondary"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      </div>
    )
  } else if (state.status === "success") {
    content = <ProcessInformationDetails info={state.info} />
  } else {
    content = null
  }

  return (
    <div className="process-info-modal__backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="process-info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-info-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="process-info-modal__header">
          <div>
            <p className="process-info-modal__eyebrow">Pre-screening process</p>
            <h2 id="process-info-modal-title">Process information</h2>
          </div>
          <button
            type="button"
            className="process-info-modal__close"
            onClick={onDismiss}
            aria-label="Close process information dialog"
          >
            ×
          </button>
        </header>
        <div className="process-info-modal__body">{content}</div>
      </div>
    </div>
  )
}

function ProjectFormWithCopilot({ showApiKeyWarning }: ProjectFormWithCopilotProps) {
  const { projectId } = useParams<{ projectId?: string }>()
  const isMountedRef = useRef(true)
  const [formData, setFormData] = useState<ProjectFormData>(() => {
    if (!projectId) {
      return createEmptyProjectData()
    }
    return persistedProjectFormState
      ? cloneValue(persistedProjectFormState.formData)
      : createEmptyProjectData()
  })
  const [lastSaved, setLastSaved] = useState<string | undefined>(() =>
    projectId && persistedProjectFormState ? persistedProjectFormState.lastSaved : undefined
  )
  const [geospatialResults, setGeospatialResults] = useState<GeospatialResultsState>(() =>
    projectId && persistedProjectFormState
      ? cloneValue(persistedProjectFormState.geospatialResults)
      : createInitialGeospatialResults()
  )
  const [projectGisUpload, setProjectGisUpload] = useState<ProjectGisUpload>(() =>
    projectId && persistedProjectFormState ? cloneValue(persistedProjectFormState.gisUpload) : {}
  )
  const [permittingChecklist, setPermittingChecklist] = useState<PermittingChecklistItem[]>(() =>
    projectId && persistedProjectFormState ? cloneValue(persistedProjectFormState.permittingChecklist) : []
  )
  const [processInformationState, setProcessInformationState] = useState<ProcessInformationState>({
    status: "idle"
  })
  const [isProcessModalOpen, setProcessModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  const [decisionSubmitState, setDecisionSubmitState] = useState<DecisionSubmitState>({ status: "idle" })
  const [hasSavedSnapshot, setHasSavedSnapshot] = useState<boolean>(() =>
    projectId && persistedProjectFormState ? persistedProjectFormState.hasSavedSnapshot : false
  )
  const [portalProgress, setPortalProgress] = useState<PortalProgressState>(() =>
    projectId && persistedProjectFormState
      ? cloneValue(persistedProjectFormState.portalProgress)
      : createInitialPortalProgress()
  )
  const previousProjectIdRef = useRef<string | undefined>(projectId)
  const [projectLoadState, setProjectLoadState] = useState<{
    status: "idle" | "loading" | "error"
    message?: string
  }>({ status: "idle" })

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const resetPortalState = useCallback(() => {
    persistedProjectFormState = undefined
    setFormData(createEmptyProjectData())
    setLastSaved(undefined)
    setGeospatialResults(createInitialGeospatialResults())
    setPermittingChecklist([])
    setSaveError(undefined)
    setIsSaving(false)
    setDecisionSubmitState({ status: "idle" })
    setHasSavedSnapshot(false)
    setProjectGisUpload({})
    setPortalProgress(createInitialPortalProgress())
  }, [
    setFormData,
    setLastSaved,
    setGeospatialResults,
    setPermittingChecklist,
    setSaveError,
    setIsSaving,
    setDecisionSubmitState,
    setHasSavedSnapshot,
    setProjectGisUpload,
    setPortalProgress
  ])

  useEffect(() => {
    if (!projectId) {
      if (previousProjectIdRef.current !== projectId) {
        resetPortalState()
      }
      previousProjectIdRef.current = projectId
      setProjectLoadState((previous) => (previous.status === "idle" ? previous : { status: "idle" }))
      return
    }

    previousProjectIdRef.current = projectId

    const trimmed = projectId.trim()
    const parsedId = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsedId)) {
      setProjectLoadState({ status: "error", message: "Invalid project identifier." })
      return
    }

    let isCancelled = false
    setProjectLoadState({ status: "loading" })
    setHasSavedSnapshot(false)
    setPortalProgress(createInitialPortalProgress())

    loadProjectPortalState(parsedId)
      .then((loaded) => {
        if (isCancelled) {
          return
        }

        const nextFormData = applyGeneratedProjectId(cloneValue(loaded.formData), loaded.formData.id)
        setFormData(nextFormData)
        setGeospatialResults(cloneValue(loaded.geospatialResults))

        const checklistWithIds: PermittingChecklistItem[] = loaded.permittingChecklist.map(
          (item: LoadedPermittingChecklistItem) => ({
            ...item,
            id: generateChecklistItemId()
          })
        )
        setPermittingChecklist(checklistWithIds)
        setProjectGisUpload(cloneValue(loaded.gisUpload ?? {}))
        setPortalProgress(cloneValue(loaded.portalProgress))

        const formattedTimestamp = (() => {
          if (loaded.lastUpdated) {
            const parsedTimestamp = Date.parse(loaded.lastUpdated)
            if (!Number.isNaN(parsedTimestamp)) {
              return new Date(parsedTimestamp).toLocaleString()
            }
            return loaded.lastUpdated
          }
          return undefined
        })()

        setLastSaved(formattedTimestamp)
        setSaveError(undefined)
        setIsSaving(false)
        setDecisionSubmitState({ status: "idle" })
        setHasSavedSnapshot(true)
        setProjectLoadState({ status: "idle" })
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }
        console.error("Failed to load project data", error)
        const message =
          error instanceof ProjectPersistenceError
            ? error.message
            : error instanceof Error
            ? error.message
            : "Unable to load project data."
        setProjectLoadState({ status: "error", message })
        setHasSavedSnapshot(false)
        setPortalProgress(createInitialPortalProgress())
      })

    return () => {
      isCancelled = true
    }
  }, [
    projectId,
    resetPortalState,
    setFormData,
    setGeospatialResults,
    setPermittingChecklist,
    setLastSaved,
    setSaveError,
    setIsSaving,
    setDecisionSubmitState,
    setHasSavedSnapshot,
    setProjectLoadState,
    setProjectGisUpload
  ])

  useEffect(() => {
    persistedProjectFormState = {
      formData: cloneValue(formData),
      lastSaved,
      geospatialResults: cloneValue(geospatialResults),
      permittingChecklist: cloneValue(permittingChecklist),
      hasSavedSnapshot,
      gisUpload: cloneValue(projectGisUpload),
      portalProgress: cloneValue(portalProgress)
    }
  }, [
    formData,
    geospatialResults,
    lastSaved,
    permittingChecklist,
    hasSavedSnapshot,
    projectGisUpload,
    portalProgress
  ])

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

  const ensureProjectIdentifier = useCallback((): ProjectFormData => {
    let preparedFormData = formData
    const candidateId = formData.id ? Number.parseInt(formData.id, 10) : Number.NaN
    if (!formData.id || Number.isNaN(candidateId) || !Number.isFinite(candidateId)) {
      const generated = applyGeneratedProjectId(formData, formData.id)
      preparedFormData = generated
      if (generated.id !== formData.id) {
        setFormData(generated)
      }
    }
    return preparedFormData
  }, [formData, setFormData])

  const ensureProcessInformation = useCallback(async () => {
    let shouldFetch = false

    setProcessInformationState((current) => {
      if (current.status === "success" || current.status === "loading") {
        return current
      }
      shouldFetch = true
      return { status: "loading" }
    })

    if (!shouldFetch) {
      return
    }

    try {
      const info = await loadProcessInformation(PRE_SCREENING_PROCESS_MODEL_ID)
      if (!isMountedRef.current) {
        return
      }
      setProcessInformationState({ status: "success", info })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : "Unable to load process information."
      setProcessInformationState({ status: "error", message })
    }
  }, [loadProcessInformation])

  const handleShowProcessInformation = useCallback(() => {
    setProcessModalOpen(true)
    void ensureProcessInformation()
  }, [ensureProcessInformation])

  const handleRetryProcessInformation = useCallback(() => {
    void ensureProcessInformation()
  }, [ensureProcessInformation])

  const handleCloseProcessModal = useCallback(() => {
    setProcessModalOpen(false)
  }, [])

  const handleSavePreScreeningData = useCallback(async () => {
    if (!hasSavedSnapshot) {
      setDecisionSubmitState({
        status: "error",
        action: "save",
        message: "Save the project snapshot before saving pre-screening data."
      })
      return
    }

    setDecisionSubmitState({
      status: "saving",
      action: "save",
      message: "Saving pre-screening data…"
    })

    const preparedFormData = ensureProjectIdentifier()

    try {
      const evaluation = await submitDecisionPayload({
        formData: preparedFormData,
        geospatialResults,
        permittingChecklist,
        createCompletionEvent: false
      })
      setDecisionSubmitState({
        status: "success",
        action: "save",
        message: evaluation.isComplete
          ? "Pre-screening data saved. Ready to submit."
          : "Pre-screening data saved."
      })
      const nowIso = new Date().toISOString()
      setPortalProgress((previous) => ({
        projectSnapshot: { ...previous.projectSnapshot },
        preScreening: {
          hasDecisionPayloads: true,
          initiatedAt: previous.preScreening.initiatedAt ?? nowIso,
          completedAt: previous.preScreening.completedAt,
          lastActivityAt: nowIso
        }
      }))
    } catch (error) {
      console.error("Failed to save pre-screening data", error)
      let message = "Unable to save pre-screening data."
      if (error instanceof ProjectPersistenceError) {
        message = error.message
      } else if (error instanceof Error) {
        message = error.message
      }
      setDecisionSubmitState({ status: "error", action: "save", message })
    }
  }, [
    ensureProjectIdentifier,
    geospatialResults,
    permittingChecklist,
    hasSavedSnapshot,
    setPortalProgress
  ])

  const handleSubmitPreScreeningData = useCallback(async () => {
    if (!hasSavedSnapshot) {
      setDecisionSubmitState({
        status: "error",
        action: "submit",
        message: "Save the project snapshot before submitting pre-screening data."
      })
      return
    }

    const preparedFormData = ensureProjectIdentifier()

    let evaluation
    try {
      evaluation = evaluatePreScreeningData({
        formData: preparedFormData,
        geospatialResults,
        permittingChecklist
      })
    } catch (error) {
      console.error("Failed to evaluate pre-screening data", error)
      let message = "Unable to submit pre-screening data."
      if (error instanceof ProjectPersistenceError) {
        message = error.message
      } else if (error instanceof Error) {
        message = error.message
      }
      setDecisionSubmitState({ status: "error", action: "submit", message })
      return
    }

    if (!evaluation.isComplete) {
      setDecisionSubmitState({
        status: "error",
        action: "submit",
        message: "Complete all pre-screening data before submitting."
      })
      return
    }

    setDecisionSubmitState({
      status: "saving",
      action: "submit",
      message: "Submitting pre-screening data…"
    })

    try {
      await submitDecisionPayload({
        formData: preparedFormData,
        geospatialResults,
        permittingChecklist
      })
      setDecisionSubmitState({
        status: "success",
        action: "submit",
        message: "Pre-screening data submitted."
      })
      const nowIso = new Date().toISOString()
      setPortalProgress((previous) => ({
        projectSnapshot: { ...previous.projectSnapshot },
        preScreening: {
          hasDecisionPayloads: true,
          initiatedAt: previous.preScreening.initiatedAt ?? nowIso,
          completedAt: nowIso,
          lastActivityAt: nowIso
        }
      }))
    } catch (error) {
      console.error("Failed to submit pre-screening data", error)
      let message = "Unable to submit pre-screening data."
      if (error instanceof ProjectPersistenceError) {
        message = error.message
      } else if (error instanceof Error) {
        message = error.message
      }
      setDecisionSubmitState({ status: "error", action: "submit", message })
    }
  }, [
    ensureProjectIdentifier,
    geospatialResults,
    permittingChecklist,
    hasSavedSnapshot,
    setPortalProgress
  ])

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
        geospatialResults,
        gisUpload: {
          arcgisJson: projectGisUpload.arcgisJson,
          geoJson: next.location_object ?? undefined,
          source: projectGisUpload.source,
          uploadedFile: projectGisUpload.uploadedFile ?? null
        }
      })
      const now = new Date()
      setLastSaved(now.toLocaleString())
      setHasSavedSnapshot(true)
      setPortalProgress((previous) => {
        const initiatedAt = previous.projectSnapshot.initiatedAt ?? now.toISOString()
        return {
          projectSnapshot: { initiatedAt },
          preScreening: { ...previous.preScreening }
        }
      })
    } catch (error) {
      console.error("Failed to save project snapshot", error)
      setLastSaved(undefined)
      setHasSavedSnapshot(false)
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
    resetPortalState()
  }

  const updateLocationFields = useCallback(
    (updates: LocationFieldUpdates) => {
      setFormData((previous) => {
        const base = previous ?? createEmptyProjectData()
        const next: ProjectFormData = { ...base }
        const mutableNext = next as Record<LocationFieldKey, ProjectFormData[LocationFieldKey]>
        let changed = false

        const applyUpdate = <K extends LocationFieldKey>(key: K, value: ProjectFormData[K] | undefined) => {
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

      setProjectGisUpload((previous) => {
        const next: ProjectGisUpload = { ...previous }
        let changed = false

        if (Object.prototype.hasOwnProperty.call(updates, "arcgisJson")) {
          const value = updates.arcgisJson
          if (value === undefined) {
            if ("arcgisJson" in next) {
              delete next.arcgisJson
              changed = true
            }
          } else if (next.arcgisJson !== value) {
            next.arcgisJson = value
            changed = true
          }
        }

        if (Object.prototype.hasOwnProperty.call(updates, "geometrySource")) {
          const value = updates.geometrySource
          if (value === undefined) {
            if ("source" in next) {
              delete next.source
              changed = true
            }
          } else if (next.source !== value) {
            next.source = value
            changed = true
          }
        }

        if (Object.prototype.hasOwnProperty.call(updates, "uploadedFile")) {
          const value = updates.uploadedFile ?? null
          if (value === null) {
            if (next.uploadedFile !== null || next.uploadedFile === undefined) {
              next.uploadedFile = null
              changed = true
            }
          } else if (
            !next.uploadedFile ||
            next.uploadedFile.base64Data !== value.base64Data ||
            next.uploadedFile.fileName !== value.fileName
          ) {
            next.uploadedFile = value
            changed = true
          }
        }

        if (Object.prototype.hasOwnProperty.call(updates, "location_object")) {
          const value = updates.location_object ?? undefined
          if (value === undefined) {
            if ("geoJson" in next) {
              delete next.geoJson
              changed = true
            }
          } else if (next.geoJson !== value) {
            next.geoJson = value
            changed = true
          }
        }

        return changed ? next : previous
      })
    },
    [setFormData, setProjectGisUpload]
  )

  const handleLocationTextChange = useCallback(
    (value: string) => {
      updateLocationFields({ location_text: value })
    },
    [updateLocationFields]
  )

  const handleLocationGeometryChange = useCallback(
    (updates: LocationFieldUpdates) => {
      const nextUpdates: LocationFieldUpdates = { ...updates }
      if (Object.prototype.hasOwnProperty.call(nextUpdates, "location_object") && !nextUpdates.location_object) {
        setGeospatialResults({ nepassist: { status: "idle" }, ipac: { status: "idle" }, messages: [] })
        nextUpdates.location_lat = undefined
        nextUpdates.location_lon = undefined
      }
      updateLocationFields(nextUpdates)
    },
    [setGeospatialResults, updateLocationFields]
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
              } catch {
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
              } catch {
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
      clickOutsideToClose={false}
      labels={{ title: "Permitting Copilot" }}
    >
      <main className="app">
        <div className="app__inner">
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

          <PortalProgressIndicator progress={portalProgress} hasSavedSnapshot={hasSavedSnapshot} />

          {projectLoadState.status === "loading" ? (
            <div className="usa-alert usa-alert--info usa-alert--slim" role="status" aria-live="polite">
              <div className="usa-alert__body">
                <p className="usa-alert__text">Loading project data…</p>
              </div>
            </div>
          ) : null}

          {projectLoadState.status === "error" ? (
            <div className="usa-alert usa-alert--error" role="alert">
              <div className="usa-alert__body">
                <h3 className="usa-alert__heading">Unable to load project data.</h3>
                <p className="usa-alert__text">{projectLoadState.message ?? "Please try again."}</p>
              </div>
            </div>
          ) : null}

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
              activeUploadFileName={projectGisUpload.uploadedFile?.fileName}
              enableFileUpload
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
              </div>
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
              onSavePreScreeningData={handleSavePreScreeningData}
              onSubmitPreScreeningData={handleSubmitPreScreeningData}
              preScreeningSubmitState={decisionSubmitState}
              isProjectSaving={isSaving}
              canSubmitPreScreening={hasSavedSnapshot}
              onShowProcessInformation={handleShowProcessInformation}
              isProcessInformationLoading={processInformationState.status === "loading"}
            />
          </section>
        </div>
      </main>
      <ProcessInformationModal
        isOpen={isProcessModalOpen}
        state={processInformationState}
        onDismiss={handleCloseProcessModal}
        onRetry={handleRetryProcessInformation}
      />
    </CopilotSidebar>
  )
}

const publicApiKey = getPublicApiKey()
const defaultRuntimeUrl = getRuntimeUrl() || COPILOT_CLOUD_CHAT_URL

function PortalPage() {
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

export default PortalPage
