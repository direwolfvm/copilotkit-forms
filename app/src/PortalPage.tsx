import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import type { ChangeEvent, FormEvent, ReactNode } from "react"
import Form from "@rjsf/core"
import type { IChangeEvent } from "@rjsf/core"
import validator from "@rjsf/validator-ajv8"
import introJs from "intro.js"
import "intro.js/introjs.css"
import {
  CopilotKit,
  type SuggestionItem,
  useCopilotAction,
  useCopilotReadable
} from "@copilotkit/react-core"
import {
  CopilotSidebar,
  RenderSuggestion,
  type RenderSuggestionsListProps
} from "@copilotkit/react-ui"
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
import { ProcessInformationDetails } from "./components/ProcessInformationDetails"
import { CollapsibleCard, type CollapsibleCardStatus } from "./components/CollapsibleCard"
import "./App.css"
import { getPublicApiKey, getRuntimeUrl } from "./runtimeConfig"
import { useCopilotRuntimeSelection } from "./copilotRuntimeContext"
import { findPermitByLabel, getPermitInfoUrl, getPermitById, getPermitOptions } from "./utils/permitInventory"
import {
  ProjectPersistenceError,
  saveProjectSnapshot,
  submitDecisionPayload,
  evaluatePreScreeningData,
  loadProjectPortalState,
  loadSupportingDocumentsForProcess,
  loadProcessInformation,
  PRE_SCREENING_PROCESS_MODEL_ID,
  type ProcessInformation,
  type LoadedPermittingChecklistItem,
  type PortalProgressState,
  type ProjectReportSummary,
  type SupportingDocumentSummary,
  uploadSupportingDocument,
  saveProjectReportDocument
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
import { createProjectReportPdf } from "./utils/projectReportPdf"

const CUSTOM_ADK_PROXY_URL = "/api/custom-adk/agent"

const MAJOR_PERMIT_SUMMARIES = majorPermits.map(
  (permit) => `${permit.title}: ${permit.description}`
)

const BASIC_PERMIT_LABEL = "Basic Permit"
const BASIC_PERMIT_LINK = { href: "/permits/basic", label: "Start this permit." }
const BASIC_PERMIT_PROJECT_PARAM = "projectId"
const BASIC_PERMIT_CHECKLIST_KEY = toChecklistKey(BASIC_PERMIT_LABEL)

const COMPLEX_REVIEW_LABEL = "Complex Review"
const COMPLEX_REVIEW_LINK = { href: "/reviews/complex", label: "Start this review." }
const COMPLEX_REVIEW_PROJECT_PARAM = "projectId"
const COMPLEX_REVIEW_CHECKLIST_KEY = toChecklistKey(COMPLEX_REVIEW_LABEL)

type UpdatesPayload = Record<string, unknown>

const SUPPORTED_DOCUMENT_EXTENSIONS = ["pdf", "docx", "jpg", "jpeg", "png"] as const
const SUPPORTED_DOCUMENT_ACCEPT = [
  "application/pdf",
  ".pdf",
  ".docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  ".jpg",
  ".jpeg",
  "image/png",
  ".png"
].join(",")

const SUPPORTED_DOCUMENT_EXTENSION_SET = new Set<SupportedDocumentExtension>(
  SUPPORTED_DOCUMENT_EXTENSIONS
)

const PORTAL_TOUR_STORAGE_KEY = "portalSiteTourComplete"

type SupportedDocumentExtension = (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number]
type DocumentUploadStatus = { type: "success" | "error"; message: string }
type DocumentUploadInput = { title: string; file: File }

function extractFileExtension(fileName: string): SupportedDocumentExtension | undefined {
  if (typeof fileName !== "string") {
    return undefined
  }
  const trimmed = fileName.trim()
  const match = /\.([a-z0-9]+)$/i.exec(trimmed)
  if (!match) {
    return undefined
  }
  const extension = match[1].toLowerCase()
  return SUPPORTED_DOCUMENT_EXTENSION_SET.has(extension as SupportedDocumentExtension)
    ? (extension as SupportedDocumentExtension)
    : undefined
}

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

function createBasicPermitChecklistItem(): PermittingChecklistItem {
  return {
    id: generateChecklistItemId(),
    label: BASIC_PERMIT_LABEL,
    completed: false,
    source: "seed",
    link: BASIC_PERMIT_LINK
  }
}

function createComplexReviewChecklistItem(): PermittingChecklistItem {
  return {
    id: generateChecklistItemId(),
    label: COMPLEX_REVIEW_LABEL,
    completed: false,
    source: "seed",
    link: COMPLEX_REVIEW_LINK
  }
}

function appendProjectIdToPermitLink(link: PermittingChecklistItem["link"], projectId?: string) {
  if (!link || !projectId) {
    return link
  }
  // Handle Basic Permit links
  if (link.href.startsWith(BASIC_PERMIT_LINK.href)) {
    if (link.href.includes(`${BASIC_PERMIT_PROJECT_PARAM}=`)) {
      return link
    }
    const separator = link.href.includes("?") ? "&" : "?"
    return {
      ...link,
      href: `${link.href}${separator}${BASIC_PERMIT_PROJECT_PARAM}=${encodeURIComponent(
        projectId
      )}`
    }
  }
  // Handle Complex Review links
  if (link.href.startsWith(COMPLEX_REVIEW_LINK.href)) {
    if (link.href.includes(`${COMPLEX_REVIEW_PROJECT_PARAM}=`)) {
      return link
    }
    const separator = link.href.includes("?") ? "&" : "?"
    return {
      ...link,
      href: `${link.href}${separator}${COMPLEX_REVIEW_PROJECT_PARAM}=${encodeURIComponent(
        projectId
      )}`
    }
  }
  return link
}

function createDefaultPermittingChecklist(): PermittingChecklistItem[] {
  return [createBasicPermitChecklistItem(), createComplexReviewChecklistItem()]
}

function toChecklistKey(label: string) {
  return normalizeChecklistLabel(label).toLowerCase()
}

function ensureDefaultChecklistItems(items: PermittingChecklistItem[]): PermittingChecklistItem[] {
  let hasBasicPermit = false
  let hasComplexReview = false
  let updated = false

  const next = items.map((item) => {
    const key = toChecklistKey(item.label)
    if (key === BASIC_PERMIT_CHECKLIST_KEY) {
      hasBasicPermit = true
      if (!item.link) {
        updated = true
        return { ...item, link: BASIC_PERMIT_LINK }
      }
    }
    if (key === COMPLEX_REVIEW_CHECKLIST_KEY) {
      hasComplexReview = true
      if (!item.link) {
        updated = true
        return { ...item, link: COMPLEX_REVIEW_LINK }
      }
    }
    return item
  })

  const toAdd: PermittingChecklistItem[] = []
  if (!hasBasicPermit) {
    toAdd.push(createBasicPermitChecklistItem())
  }
  if (!hasComplexReview) {
    toAdd.push(createComplexReviewChecklistItem())
  }

  if (toAdd.length > 0) {
    return [...next, ...toAdd]
  }

  return updated ? next : items
}

// Alias for backward compatibility
function ensureBasicPermitChecklistItem(items: PermittingChecklistItem[]): PermittingChecklistItem[] {
  return ensureDefaultChecklistItems(items)
}

type ChecklistUpsertInput = {
  label: string
  completed?: boolean
  notes?: string
  source?: PermittingChecklistItem["source"]
  permitId?: string
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
  preScreeningProcessId?: number
  projectReport?: ProjectReportSummary
  supportingDocuments: SupportingDocumentSummary[]
}

let persistedProjectFormState: PersistedProjectFormState | undefined

type ProcessInformationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; info: ProcessInformation }
  | { status: "error"; message: string }
type ProgressStatus = "not-started" | "in-progress" | "complete"

type IntroStep = { element: HTMLElement; title?: string; intro: string }

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
    <section
      className="portal-progress"
      aria-label="Project progress"
      data-tour-id="portal-progress"
      data-tour-title="Follow the workflow"
      data-tour-intro="These status cards reflect whether you've saved a project snapshot and advanced pre-screening steps."
    >
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

function formatDocumentTimestamp(iso?: string): string | undefined {
  if (!iso) {
    return undefined
  }
  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) {
    return undefined
  }
  return new Date(timestamp).toLocaleString()
}

function formatFileSize(bytes?: number): string | undefined {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return undefined
  }
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const formatted = value >= 10 || unitIndex === 0 ? Math.round(value).toString() : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}

interface DocumentUploadModalProps {
  isOpen: boolean
  onDismiss: () => void
  onSubmit: (input: DocumentUploadInput) => Promise<void>
}

function DocumentUploadModal({ isOpen, onDismiss, onSubmit }: DocumentUploadModalProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
      setTitle("")
      setSelectedFile(null)
      setError(undefined)
      setIsSubmitting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      return
    }

    const { body } = document
    if (body) {
      const previousOverflow = body.style.overflow
      body.style.overflow = "hidden"
      return () => {
        body.style.overflow = previousOverflow
      }
    }
    return undefined
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    requestAnimationFrame(() => {
      titleInputRef.current?.focus()
    })
  }, [isOpen])

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null
    if (!file) {
      setSelectedFile(null)
      return
    }

    const extension = extractFileExtension(file.name)
    if (!extension) {
      setError("Unsupported file type. Upload a PDF, DOCX, JPG, or PNG file.")
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      return
    }

    setSelectedFile(file)
    setError(undefined)
  }, [])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmedTitle = title.trim()

      if (!trimmedTitle) {
        setError("Enter a document title.")
        return
      }

      if (!selectedFile) {
        setError("Choose a file to upload.")
        return
      }

      const extension = extractFileExtension(selectedFile.name)
      if (!extension) {
        setError("Unsupported file type. Upload a PDF, DOCX, JPG, or PNG file.")
        return
      }

      setIsSubmitting(true)
      setError(undefined)

      try {
        await onSubmit({ title: trimmedTitle, file: selectedFile })
        setTitle("")
        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
        onDismiss()
      } catch (submissionError) {
        if (submissionError instanceof ProjectPersistenceError) {
          setError(submissionError.message)
        } else if (submissionError instanceof Error) {
          setError(submissionError.message)
        } else {
          setError("Unable to upload document.")
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [onSubmit, selectedFile, title, onDismiss]
  )

  if (!isOpen) {
    return null
  }

  const selectedFileName = selectedFile?.name ?? ""

  return (
    <div className="document-upload-modal__backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="document-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-upload-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="document-upload-modal__header">
          <h2 id="document-upload-modal-title">Upload supporting document</h2>
          <button
            type="button"
            className="document-upload-modal__close"
            onClick={onDismiss}
            aria-label="Close upload dialog"
          >
            ×
          </button>
        </header>
        <form className="document-upload-modal__form" onSubmit={handleSubmit} noValidate>
          <div className="document-upload-modal__field">
            <label htmlFor="document-upload-title">Document title</label>
            <input
              id="document-upload-title"
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={200}
            />
          </div>
          <div className="document-upload-modal__field">
            <label htmlFor="document-upload-file">File</label>
            <input
              id="document-upload-file"
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_DOCUMENT_ACCEPT}
              onChange={handleFileChange}
              required
            />
            {selectedFileName ? (
              <p className="document-upload-modal__filename" aria-live="polite">
                Selected file: {selectedFileName}
              </p>
            ) : null}
          </div>
          {error ? (
            <p className="document-upload-modal__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="document-upload-modal__actions">
            <button
              type="button"
              className="usa-button usa-button--outline secondary"
              onClick={onDismiss}
            >
              Cancel
            </button>
            <button type="submit" className="usa-button primary" disabled={isSubmitting}>
              {isSubmitting ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
    projectId && persistedProjectFormState
      ? ensureBasicPermitChecklistItem(cloneValue(persistedProjectFormState.permittingChecklist))
      : createDefaultPermittingChecklist()
  )
  const [preScreeningProcessId, setPreScreeningProcessId] = useState<number | undefined>(() =>
    projectId && persistedProjectFormState ? persistedProjectFormState.preScreeningProcessId : undefined
  )
  const [projectReport, setProjectReport] = useState<ProjectReportSummary | undefined>(() =>
    projectId && persistedProjectFormState ? cloneValue(persistedProjectFormState.projectReport) : undefined
  )
  const [supportingDocuments, setSupportingDocuments] = useState<SupportingDocumentSummary[]>(() =>
    projectId && persistedProjectFormState
      ? cloneValue(persistedProjectFormState.supportingDocuments ?? [])
      : []
  )
  const [processInformationState, setProcessInformationState] = useState<ProcessInformationState>({
    status: "idle"
  })
  const [isProcessModalOpen, setProcessModalOpen] = useState(false)
  const [isDocumentModalOpen, setDocumentModalOpen] = useState(false)
  const [documentUploadStatus, setDocumentUploadStatus] = useState<DocumentUploadStatus | undefined>(
    undefined
  )
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
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [reportError, setReportError] = useState<string | undefined>(undefined)
  const permitChecklistItems = useMemo(() => {
    const projectIdValue = typeof formData.id === "string" ? formData.id.trim() : ""
    if (!projectIdValue) {
      return permittingChecklist
    }
    return permittingChecklist.map((item) => ({
      ...item,
      link: appendProjectIdToPermitLink(item.link, projectIdValue)
    }))
  }, [formData.id, permittingChecklist])
  const canUploadDocument =
    typeof preScreeningProcessId === "number" && Number.isFinite(preScreeningProcessId)
  const canGenerateReport = canUploadDocument && hasSavedSnapshot
  const previousProjectIdRef = useRef<string | undefined>(projectId)
  const [projectLoadState, setProjectLoadState] = useState<{
    status: "idle" | "loading" | "error"
    message?: string
  }>({ status: "idle" })
  const hasBasicPermitChecklistItem = useMemo(
    () => permittingChecklist.some((item) => toChecklistKey(item.label) === BASIC_PERMIT_CHECKLIST_KEY),
    [permittingChecklist]
  )

  const startPortalTour = useCallback(() => {
    if (typeof window === "undefined") {
      return null
    }

    const copilotWrapper =
      document.querySelector<HTMLElement>(".copilotKitWindow") ??
      document.querySelector<HTMLElement>(".copilotKitSidebar")

    if (copilotWrapper) {
      copilotWrapper.dataset.tourId = copilotWrapper.dataset.tourId ?? "portal-copilot"
      copilotWrapper.dataset.tourTitle =
        copilotWrapper.dataset.tourTitle ?? "Work with the Copilot"
      copilotWrapper.dataset.tourIntro =
        copilotWrapper.dataset.tourIntro ??
        "Open the Copilot pane to describe your project conversationally. It can map your notes into the form and checklist."
    }

    const stepSelectors = [
      "[data-tour-id='portal-copilot']",
      "[data-tour-id='portal-progress']",
      "[data-tour-id='portal-summary']",
      "[data-tour-id='portal-location']",
      "[data-tour-id='portal-form']",
      "[data-tour-id='portal-checklist']",
      "[data-tour-id='portal-nepa']"
    ]

    const steps = stepSelectors.reduce<IntroStep[]>((collectedSteps, selector) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) {
        return collectedSteps
      }
      const intro = element.dataset.tourIntro ?? ""
      if (!intro.trim()) {
        return collectedSteps
      }
      collectedSteps.push({ element, title: element.dataset.tourTitle, intro })
      return collectedSteps
    }, [])

    if (!steps.length) {
      return null
    }

    const intro = introJs()

    intro.setOptions({
      steps,
      showProgress: true,
      showBullets: false,
      disableInteraction: true,
      exitOnOverlayClick: true,
      nextLabel: "Next",
      prevLabel: "Back",
      doneLabel: "Finish",
      tooltipClass: "site-tour__tooltip",
      highlightClass: "site-tour__highlight"
    })

    const markTourComplete = () => {
      localStorage.setItem(PORTAL_TOUR_STORAGE_KEY, "true")
    }

    intro.oncomplete(markTourComplete)
    intro.onexit(markTourComplete)

    intro.start()

    return intro
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (localStorage.getItem(PORTAL_TOUR_STORAGE_KEY) === "true") {
      return
    }

    const intro = startPortalTour()

    return () => {
      intro?.exit()
    }
  }, [startPortalTour])

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
    setPermittingChecklist(createDefaultPermittingChecklist())
    setSaveError(undefined)
    setIsSaving(false)
    setDecisionSubmitState({ status: "idle" })
    setHasSavedSnapshot(false)
    setProjectGisUpload({})
    setPortalProgress(createInitialPortalProgress())
    setPreScreeningProcessId(undefined)
    setDocumentModalOpen(false)
    setDocumentUploadStatus(undefined)
    setProjectReport(undefined)
    setSupportingDocuments([])
    setIsGeneratingReport(false)
    setReportError(undefined)
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
    setPortalProgress,
    setPreScreeningProcessId,
    setDocumentModalOpen,
    setDocumentUploadStatus,
    setProjectReport,
    setSupportingDocuments,
    setIsGeneratingReport,
    setReportError
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
    setPreScreeningProcessId(undefined)
    setDocumentUploadStatus(undefined)
    setDocumentModalOpen(false)
    setProjectReport(undefined)
    setSupportingDocuments([])
    setReportError(undefined)
    setIsGeneratingReport(false)

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
        setPermittingChecklist(ensureBasicPermitChecklistItem(checklistWithIds))
        setProjectGisUpload(cloneValue(loaded.gisUpload ?? {}))
        setPortalProgress(cloneValue(loaded.portalProgress))
        setPreScreeningProcessId(loaded.preScreeningProcessId)
        setProjectReport(loaded.projectReport ? cloneValue(loaded.projectReport) : undefined)
        setSupportingDocuments(cloneValue(loaded.supportingDocuments ?? []))

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
        setPreScreeningProcessId(undefined)
        setDocumentUploadStatus(undefined)
        setDocumentModalOpen(false)
        setProjectReport(undefined)
        setSupportingDocuments([])
        setReportError(undefined)
        setIsGeneratingReport(false)
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
    setProjectGisUpload,
    setProjectReport,
    setSupportingDocuments,
    setReportError,
    setIsGeneratingReport
  ])

  useEffect(() => {
    persistedProjectFormState = {
      formData: cloneValue(formData),
      lastSaved,
      geospatialResults: cloneValue(geospatialResults),
      permittingChecklist: cloneValue(permittingChecklist),
      hasSavedSnapshot,
      gisUpload: cloneValue(projectGisUpload),
      portalProgress: cloneValue(portalProgress),
      preScreeningProcessId,
      projectReport: cloneValue(projectReport),
      supportingDocuments: cloneValue(supportingDocuments)
    }
  }, [
    formData,
    geospatialResults,
    lastSaved,
    permittingChecklist,
    hasSavedSnapshot,
    projectGisUpload,
    portalProgress,
    preScreeningProcessId,
    projectReport,
    supportingDocuments
  ])

  const locationSectionKey = projectId ?? "new-project"

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

  const projectRequiredFields = useMemo<(keyof ProjectFormData)[]>(
    () => (projectSchema.required ?? []).filter((field): field is keyof ProjectFormData => typeof field === "string"),
    []
  )

  const missingProjectFields = useMemo(
    () =>
      projectRequiredFields.filter((field) => {
        const value = formData?.[field]
        return value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)
      }),
    [formData, projectRequiredFields]
  )

  const projectFormStatus: CollapsibleCardStatus = useMemo(() => {
    if (missingProjectFields.length > 0) {
      const label = `${missingProjectFields.length} required field${missingProjectFields.length === 1 ? "" : "s"} missing`
      return { tone: "danger", text: label }
    }

    if (!hasSavedSnapshot) {
      return { tone: "warning", text: "Save the project snapshot to continue" }
    }

    const savedLabel = lastSaved ? `Snapshot saved ${lastSaved}` : "Snapshot saved"
    return { tone: "success", text: savedLabel }
  }, [hasSavedSnapshot, lastSaved, missingProjectFields.length])

  const nepaStatus: CollapsibleCardStatus = useMemo(() => {
    const missingFields = ([
      "nepa_categorical_exclusion_code",
      "nepa_conformance_conditions",
      "nepa_extraordinary_circumstances"
    ] as const)
      .filter((key) => {
        const value = formData?.[key]
        return value === undefined || value === null || (typeof value === "string" && value.trim().length === 0)
      })

    if (missingFields.length > 0) {
      const labels = missingFields
        .map((key) => nepaFieldConfigs[key]?.title ?? key.replaceAll("_", " "))
        .join(" and ")
      return { tone: "danger", text: `Add ${labels}` }
    }

    const geospatialComplete =
      geospatialResults.nepassist.status === "success" && geospatialResults.ipac.status === "success"

    const hasChecklistItems = permittingChecklist.length > 0

    if (!geospatialComplete) {
      return { tone: "danger", text: "Run the geospatial screen" }
    }

    if (portalProgress.preScreening.completedAt) {
      return { tone: "success", text: "Pre-screening submitted" }
    }

    if (!hasChecklistItems) {
      return { tone: "danger", text: "Add permitting checklist items" }
    }

    if (!hasSavedSnapshot) {
      return { tone: "warning", text: "Save the project snapshot to submit" }
    }

    if (portalProgress.preScreening.hasDecisionPayloads || portalProgress.preScreening.initiatedAt) {
      return { tone: "warning", text: "Submit pre-screening data" }
    }

    return { tone: "warning", text: "Save pre-screening data" }
  }, [
    formData,
    geospatialResults,
    hasSavedSnapshot,
    nepaFieldConfigs,
    permittingChecklist.length,
    portalProgress.preScreening
  ])

  const formattedReportTimestamp = useMemo(() => {
    if (!projectReport?.generatedAt) {
      return undefined
    }
    const parsed = Date.parse(projectReport.generatedAt)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toLocaleString()
    }
    return projectReport.generatedAt
  }, [projectReport?.generatedAt])

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

  const permitInventoryForCopilot = useMemo(() => getPermitOptions(), [])

  useCopilotReadable(
    {
      description: "Federal permit inventory with IDs. When adding checklist items, prefer using permitId from this list for accurate linking.",
      value: permitInventoryForCopilot,
      convert: (_, value) =>
        value
          .map((p: { id: string; name: string; agency: string }) => `- ${p.id}: ${p.name} (${p.agency})`)
          .join("\n")
    },
    [permitInventoryForCopilot]
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
              source: entry.source,
              permitId: entry.permitId
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
        const isBasicPermit = key === BASIC_PERMIT_CHECKLIST_KEY
        const isComplexReview = key === COMPLEX_REVIEW_CHECKLIST_KEY
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
          let nextLink = existing.link
          if (isBasicPermit && !existing.link) {
            nextLink = BASIC_PERMIT_LINK
            updated = true
          }
          if (isComplexReview && !existing.link) {
            nextLink = COMPLEX_REVIEW_LINK
            updated = true
          }
          if (updated) {
            next[existingIndex] = {
              ...existing,
              completed:
                typeof completedValue === "boolean" ? completedValue : existing.completed,
              notes: notesValue !== undefined ? notesValue : existing.notes,
              source: sourceValue ?? existing.source,
              link: nextLink
            }
            changed = true
          }
        } else {
          // Look up permit info link for special items first
          let itemLink: PermittingChecklistItem["link"] = undefined
          if (isBasicPermit) {
            itemLink = BASIC_PERMIT_LINK
          } else if (isComplexReview) {
            itemLink = COMPLEX_REVIEW_LINK
          } else if (entry.permitId) {
            // Use permitId directly if provided (from CopilotKit action)
            itemLink = {
              href: getPermitInfoUrl(entry.permitId),
              label: "Info"
            }
          } else {
            // Fall back to fuzzy matching by label
            const matchedPermit = findPermitByLabel(entry.label)
            if (matchedPermit) {
              itemLink = {
                href: getPermitInfoUrl(matchedPermit.id),
                label: "Info"
              }
            }
          }

          const newItem: PermittingChecklistItem = {
            id: generateChecklistItemId(),
            label: entry.label,
            completed: typeof entry.completed === "boolean" ? entry.completed : false,
            notes: entry.notes,
            source: entry.source ?? "manual",
            link: itemLink
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

  const handleAddBasicPermit = useCallback(() => {
    upsertPermittingChecklistItems([{ label: BASIC_PERMIT_LABEL, source: "seed" }])
  }, [upsertPermittingChecklistItems])

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
    if (processInformationState.status === "success" || processInformationState.status === "loading") {
      return
    }

    setProcessInformationState({ status: "loading" })

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
  }, [loadProcessInformation, processInformationState.status])

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
        "Add or update permitting checklist entries. Use this to track likely permits, approvals, or consultations the project will require. Prefer using permitId from the federal permit inventory when available for accurate linking to permit info pages.",
      parameters: [
        {
          name: "items",
          type: "object[]",
          description: "Checklist items to merge into the permitting tracker.",
          attributes: [
            {
              name: "permitId",
              type: "string",
              description: "The ID from the federal permit inventory (e.g., 'section-404-clean-water-act'). When provided, the label and link will be automatically set from the inventory.",
              required: false
            },
            {
              name: "label",
              type: "string",
              description: "Name of the permit or authorization. Optional if permitId is provided.",
              required: false
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
          const permitId = typeof item?.permitId === "string" ? item.permitId : undefined
          const permit = permitId ? getPermitById(permitId) : undefined

          // Use permit name if found, otherwise use provided label
          const label = permit?.name ?? (typeof item?.label === "string" ? item.label : "")
          const status = typeof item?.status === "string" ? item.status.toLowerCase() : undefined

          return {
            label,
            source: "copilot",
            notes: typeof item?.notes === "string" ? item.notes : undefined,
            completed:
              status === "completed" ? true : status === "pending" ? false : undefined,
            // Pass permitId so upsertPermittingChecklistItems can create the link
            permitId: permit?.id
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
        "Use addPermittingChecklistItems to maintain the permitting checklist. IMPORTANT: When adding permits, always use the permitId from the federal permit inventory (provided in context) instead of just the label. This ensures proper linking to permit information pages. For example, use permitId='section-404-clean-water-act' for CWA Section 404 permits.",
        "Use resetProjectForm when the user asks to start over."
      ].join("\n"),
    []
  )

  const [conversationStartersHidden, setConversationStartersHidden] = useState(false)

  const conversationStarters: SuggestionItem[] = useMemo(
    () => [
      {
        title: "How do I start?",
        message:
          "How do I start? Describe how this project portal form works and what information I should provide."
      },
      {
        title: "I have an idea for a project.",
        message:
          "I have an idea for a project. Ask me for the details you need and map them into the form and checklist."
      }
    ],
    []
  )

  const ConversationStartersList = useCallback(
    ({ suggestions, onSuggestionClick }: RenderSuggestionsListProps) => {
      if (conversationStartersHidden) {
        return null
      }

      return (
        <div className="conversation-starters-panel">
          <div className="conversation-starters-panel__header">
            <span className="conversation-starters-panel__title">Conversation starters</span>
            <button
              type="button"
              className="conversation-starters-panel__dismiss"
              onClick={() => setConversationStartersHidden(true)}
              aria-label="Hide conversation starters"
            >
              ×
            </button>
          </div>

          <div className="suggestions">
            {suggestions.map((suggestion, index) => (
              <RenderSuggestion
                key={index}
                title={suggestion.title}
                message={suggestion.message}
                partial={suggestion.partial}
                className={suggestion.className}
                onClick={() => onSuggestionClick(suggestion.message)}
              />
            ))}
          </div>
        </div>
      )
    },
    [conversationStartersHidden]
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
      const processId = await saveProjectSnapshot({
        formData: next,
        geospatialResults,
        gisUpload: {
          arcgisJson: projectGisUpload.arcgisJson,
          geoJson: next.location_object ?? undefined,
          source: projectGisUpload.source,
          uploadedFile: projectGisUpload.uploadedFile ?? null
        }
      })
      setPreScreeningProcessId(processId)
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

  const handleOpenDocumentModal = useCallback(() => {
    if (!canUploadDocument) {
      return
    }
    setDocumentModalOpen(true)
  }, [canUploadDocument])

  const handleCloseDocumentModal = useCallback(() => {
    setDocumentModalOpen(false)
  }, [])

  const handleDocumentUpload = useCallback(
    async ({ title, file }: DocumentUploadInput) => {
      const normalizedId = typeof formData?.id === "string" ? formData.id.trim() : ""
      const projectIdValue = normalizedId.length > 0 ? Number.parseInt(normalizedId, 10) : Number.NaN

      if (!Number.isFinite(projectIdValue)) {
        const error = new ProjectPersistenceError(
          "A numeric project identifier is required before uploading documents."
        )
        setDocumentUploadStatus({ type: "error", message: error.message })
        throw error
      }

      try {
        await uploadSupportingDocument({
          title,
          file,
          projectId: projectIdValue,
          projectTitle: typeof formData?.title === "string" ? formData.title : null,
          parentProcessId: preScreeningProcessId
        })
        setDocumentUploadStatus({ type: "success", message: "Document uploaded successfully." })
        if (typeof preScreeningProcessId === "number" && Number.isFinite(preScreeningProcessId)) {
          try {
            const refreshedDocuments = await loadSupportingDocumentsForProcess(preScreeningProcessId)
            setSupportingDocuments(refreshedDocuments)
          } catch (refreshError) {
            console.warn("Failed to refresh supporting documents", refreshError)
          }
        }
      } catch (uploadError) {
        const message =
          uploadError instanceof ProjectPersistenceError
            ? uploadError.message
            : uploadError instanceof Error
            ? uploadError.message
            : "Unable to upload document."
        setDocumentUploadStatus({ type: "error", message })
        throw uploadError
      }
    },
    [
      formData?.id,
      formData?.title,
      preScreeningProcessId,
      loadSupportingDocumentsForProcess
    ]
  )

  const handleGenerateProjectReport = useCallback(async () => {
    if (isGeneratingReport) {
      return
    }

    const normalizedId = typeof formData?.id === "string" ? formData.id.trim() : ""
    const projectIdValue = normalizedId.length > 0 ? Number.parseInt(normalizedId, 10) : Number.NaN

    if (!Number.isFinite(projectIdValue)) {
      setReportError("Save the project snapshot before generating a report.")
      return
    }

    if (typeof preScreeningProcessId !== "number" || !Number.isFinite(preScreeningProcessId)) {
      setReportError("Pre-screening must be initialized before generating a report.")
      return
    }

    setIsGeneratingReport(true)
    setReportError(undefined)

    try {
      const generatedAt = new Date()
      const pdfBytes = await createProjectReportPdf({
        project: formData,
        permittingChecklist,
        portalProgress,
        generatedAt
      })
      const pdfBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength
      ) as ArrayBuffer
      const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" })
      const saved = await saveProjectReportDocument({
        blob: pdfBlob,
        projectId: projectIdValue,
        projectTitle: typeof formData.title === "string" ? formData.title : null,
        parentProcessId: preScreeningProcessId,
        generatedAt: generatedAt.toISOString()
      })
      setProjectReport(saved)
    } catch (error) {
      console.error("Failed to generate project report", error)
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
          ? error.message
          : "Unable to generate report."
      setReportError(message)
    } finally {
      setIsGeneratingReport(false)
    }
  }, [
    formData,
    isGeneratingReport,
    permittingChecklist,
    portalProgress,
    preScreeningProcessId
  ])

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
      suggestions={conversationStarters}
      defaultOpen
      clickOutsideToClose={false}
      labels={{ title: "Permitting Copilot" }}
      RenderSuggestionsList={ConversationStartersList}
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
              <button type="button" className="usa-button secondary" onClick={() => startPortalTour()}>
                Take a tour
              </button>
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
            <ProjectSummary
              data={formData}
              actions={
                <>
                  <div className="summary-panel__buttons">
                    <button
                      type="button"
                      className="usa-button usa-button--outline secondary"
                      onClick={handleGenerateProjectReport}
                      disabled={!canGenerateReport || isGeneratingReport}
                      title={
                        !canGenerateReport
                          ? "Save the project snapshot to enable report generation."
                          : undefined
                      }
                    >
                      {isGeneratingReport ? "Generating…" : "Generate PDF"}
                    </button>
                    {projectReport ? (
                      <a
                        className="usa-button"
                        href={projectReport.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View latest PDF
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="usa-button"
                        disabled
                        title="Generate a report to enable the download."
                      >
                        View latest PDF
                      </button>
                    )}
                  </div>
                  <div className="summary-panel__status-group" aria-live="polite">
                    {isGeneratingReport ? (
                      <span className="summary-panel__status">Generating report…</span>
                    ) : projectReport?.generatedAt ? (
                      <span className="summary-panel__status">
                        {formattedReportTimestamp
                          ? `Generated ${formattedReportTimestamp}`
                          : `Generated ${projectReport.generatedAt}`}
                      </span>
                    ) : null}
                    {reportError ? (
                      <span className="summary-panel__status summary-panel__status--error" role="alert">
                        {reportError}
                      </span>
                    ) : null}
                  </div>
                </>
              }
            />
            <CollapsibleCard
              className="form-panel"
              title="Project form"
              description="Complete the CEQ project fields."
              ariaLabel="Project form"
              status={projectFormStatus}
              dataAttributes={{
                "data-tour-id": "portal-form",
                "data-tour-title": "Fill out the CEQ form",
                "data-tour-intro":
                  "Work through the structured fields or ask the Copilot to take your narrative and populate the schema for you."
              }}
            >
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
                  {documentUploadStatus ? (
                    <span
                      className={`form-panel__status-message status${
                        documentUploadStatus.type === "error" ? " status--error" : ""
                      }`}
                      aria-live="polite"
                    >
                      {documentUploadStatus.message}
                    </span>
                  ) : null}
                  <div className="form-panel__actions-group">
                    <button type="submit" className="usa-button primary" disabled={isSaving}>
                      {isSaving ? "Saving…" : "Save project snapshot"}
                    </button>
                    <button
                      type="button"
                      className="usa-button usa-button--outline secondary"
                      onClick={handleOpenDocumentModal}
                      disabled={!canUploadDocument}
                      title={
                        !canUploadDocument
                          ? "Save the project snapshot before uploading documents."
                          : undefined
                      }
                    >
                      Upload supporting document
                    </button>
                  </div>
                  {supportingDocuments.length > 0 ? (
                    <div className="supporting-documents" aria-live="polite">
                      <p className="supporting-documents__heading">Uploaded documents</p>
                      <ul className="supporting-documents__list">
                        {supportingDocuments.map((document) => {
                          const uploadedAt = formatDocumentTimestamp(document.uploadedAt)
                          const fileSizeLabel = formatFileSize(document.fileSize)
                          const metaParts: string[] = []
                          if (document.fileName) {
                            metaParts.push(document.fileName)
                          }
                          if (fileSizeLabel) {
                            metaParts.push(fileSizeLabel)
                          }
                          if (uploadedAt) {
                            metaParts.push(`Uploaded ${uploadedAt}`)
                          }
                          const metaText = metaParts.join(" • ")
                          return (
                            <li key={document.id} className="supporting-documents__item">
                              <a
                                className="supporting-documents__link"
                                href={document.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {document.title}
                              </a>
                              {metaText ? <span className="supporting-documents__meta">{metaText}</span> : null}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Form>
            </CollapsibleCard>
            {locationFieldDetail ? (
              <LocationSection
                key={locationSectionKey}
                title="Location and Geospatial Screening"
                description={locationFieldDetail.description}
                placeholder={locationFieldDetail.placeholder}
                rows={locationFieldDetail.rows}
                locationText={formData.location_text}
                geometry={formData.location_object}
                activeUploadFileName={projectGisUpload.uploadedFile?.fileName}
                enableFileUpload
                onLocationTextChange={handleLocationTextChange}
                onLocationGeometryChange={handleLocationGeometryChange}
                geospatialResults={geospatialResults}
                onRunGeospatialScreen={handleRunGeospatialScreen}
                isRunningGeospatial={isGeospatialRunning}
                hasGeometry={hasGeometry}
                bufferMiles={DEFAULT_BUFFER_MILES}
              />
            ) : null}
        <PermittingChecklistSection
          items={permitChecklistItems}
          onAddItem={handleAddChecklistItem}
          onToggleItem={handleToggleChecklistItem}
          onRemoveItem={handleRemoveChecklistItem}
          onBulkAddFromSeed={handleBulkAddFromSeed}
          hasBasicPermit={hasBasicPermitChecklistItem}
          onAddBasicPermit={handleAddBasicPermit}
        />
            <NepaReviewSection
              values={{
                nepa_categorical_exclusion_code: formData.nepa_categorical_exclusion_code,
                nepa_conformance_conditions: formData.nepa_conformance_conditions,
                nepa_extraordinary_circumstances: formData.nepa_extraordinary_circumstances
              }}
              fieldConfigs={nepaFieldConfigs}
              onFieldChange={handleNepaFieldChange}
              onSavePreScreeningData={handleSavePreScreeningData}
              onSubmitPreScreeningData={handleSubmitPreScreeningData}
              preScreeningSubmitState={decisionSubmitState}
              isProjectSaving={isSaving}
              canSubmitPreScreening={hasSavedSnapshot}
              onShowProcessInformation={handleShowProcessInformation}
              isProcessInformationLoading={processInformationState.status === "loading"}
              status={nepaStatus}
            />
          </section>
        </div>
      </main>
      <DocumentUploadModal
        isOpen={isDocumentModalOpen}
        onDismiss={handleCloseDocumentModal}
        onSubmit={handleDocumentUpload}
      />
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
  const { runtimeMode } = useCopilotRuntimeSelection()

  const effectiveRuntimeUrl = runtimeMode === "custom" ? CUSTOM_ADK_PROXY_URL : defaultRuntimeUrl
  const showApiKeyWarning = runtimeMode === "default" && !publicApiKey

  return (
    <CopilotKit
      key={runtimeMode}
      publicApiKey={publicApiKey || undefined}
      runtimeUrl={effectiveRuntimeUrl || undefined}
    >
      <ProjectFormWithCopilot showApiKeyWarning={showApiKeyWarning} />
    </CopilotKit>
  )
}

export default PortalPage
