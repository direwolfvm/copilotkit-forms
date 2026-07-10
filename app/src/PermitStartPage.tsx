import { useEffect, useMemo, useState } from "react"
import type { ChangeEvent, FormEvent, ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import Form from "@rjsf/core"
import type { IChangeEvent } from "@rjsf/core"
import type { WidgetProps } from "@rjsf/utils"
import validator from "@rjsf/validator-ajv8"

import "./App.css"
import { ProcessInformationDetails } from "./components/ProcessInformationDetails"
import {
  ROW_AUTHORIZATION_LABEL,
  authenticatePermitflowUser,
  loadPermitflowCustomFormState,
  loadPermitflowProjectStatus,
  loadPermitflowProcessInformation,
  savePermitflowCustomForm,
  submitPermitflowCustomFormForApproval,
  submitPermitflowProject,
  updatePermitflowProject,
  uploadPermitflowDocument,
  type PermitflowCustomFormState,
  type PermitflowProjectStatus,
  type PermitflowSectionFormState
} from "./utils/permitflow"
import {
  formatProjectSummary,
  projectFieldDetails,
  projectSchema,
  type ProjectFormData
} from "./schema/projectSchema"
import { loadProjectPortalState } from "./utils/projectPersistence"
import { ProjectPersistenceError, type ProcessInformation } from "./utils/projectPersistence"

const ROW_AUTHORIZATION_SF299_TITLE = `${ROW_AUTHORIZATION_LABEL} (SF-299)`

type ProcessInformationState =
  | { status: "idle" | "loading" }
  | { status: "success"; info: ProcessInformation }
  | { status: "error"; message: string }

type ProjectInformationState =
  | { status: "idle" | "loading" }
  | { status: "success"; formData: ProjectFormData }
  | { status: "error"; message: string }

type PermitflowAuthState =
  | { status: "idle" }
  | { status: "authenticating" }
  | { status: "authenticated"; accessToken: string; userId: string; userEmail: string }
  | { status: "error"; message: string }

type PermitflowSubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string }

type PermitflowStatusState =
  | { status: "idle" | "loading" }
  | { status: "success"; info: PermitflowProjectStatus }
  | { status: "error"; message: string }

type CustomFormModalState =
  | { status: "idle" | "loading" }
  | { status: "success"; info: PermitflowCustomFormState }
  | { status: "error"; message: string }

type CustomFormActionState =
  | { status: "idle" }
  | { status: "saving" | "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasSchema(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  const properties = value.properties
  return isRecord(properties) && Object.keys(properties).length > 0
}

function normalizeRequiredFieldValue(value: ProjectFormData[keyof ProjectFormData]): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
  }
  return false
}

export default function PermitStartPage() {
  const [processState, setProcessState] = useState<ProcessInformationState>({ status: "idle" })
  const [projectState, setProjectState] = useState<ProjectInformationState>({ status: "idle" })
  const [authState, setAuthState] = useState<PermitflowAuthState>({ status: "idle" })
  const [submitState, setSubmitState] = useState<PermitflowSubmitState>({ status: "idle" })
  const [permitflowStatus, setPermitflowStatus] = useState<PermitflowStatusState>({
    status: "idle"
  })
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [searchParams] = useSearchParams()
  const [isCustomFormModalOpen, setCustomFormModalOpen] = useState(false)
  const [customFormState, setCustomFormState] = useState<CustomFormModalState>({ status: "idle" })
  const [customFormDrafts, setCustomFormDrafts] = useState<Record<number, Record<string, unknown>>>({})
  const [dirtySectionIds, setDirtySectionIds] = useState<ReadonlySet<number>>(new Set())
  const [activeSectionId, setActiveSectionId] = useState<number | undefined>(undefined)
  const [customFormSaveState, setCustomFormSaveState] = useState<CustomFormActionState>({
    status: "idle"
  })
  const [customFormSubmitState, setCustomFormSubmitState] = useState<CustomFormActionState>({
    status: "idle"
  })

  useEffect(() => {
    let isCancelled = false
    setProcessState({ status: "loading" })

    loadPermitflowProcessInformation()
      .then((info) => {
        if (isCancelled) {
          return
        }
        setProcessState({ status: "success", info })
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }
        const message =
          error instanceof ProjectPersistenceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to load permit information."
        setProcessState({ status: "error", message })
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const projectId = searchParams.get("projectId")
    if (!projectId) {
      setProjectState({
        status: "error",
        message: "Provide a project identifier to submit to PermitFast."
      })
      setPermitflowStatus({ status: "idle" })
      return () => {
        isCancelled = true
      }
    }

    const parsedId = Number.parseInt(projectId, 10)
    if (!Number.isFinite(parsedId)) {
      setProjectState({
        status: "error",
        message: "Project identifiers must be numeric. Return to the portal to save your project."
      })
      setPermitflowStatus({ status: "idle" })
      return () => {
        isCancelled = true
      }
    }

    setProjectState({ status: "loading" })

    loadProjectPortalState(parsedId)
      .then((result) => {
        if (isCancelled) {
          return
        }
        setProjectState({ status: "success", formData: result.formData })
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }
        const message =
          error instanceof ProjectPersistenceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to load project details."
        setProjectState({ status: "error", message })
        setPermitflowStatus({ status: "idle" })
      })

    return () => {
      isCancelled = true
    }
  }, [searchParams])

  useEffect(() => {
    if (projectState.status !== "success") {
      return
    }

    const projectIdValue = projectState.formData.id
    const projectId = projectIdValue ? Number.parseInt(projectIdValue, 10) : Number.NaN
    if (!Number.isFinite(projectId)) {
      setPermitflowStatus({
        status: "error",
        message: "Project identifiers must be numeric to check PermitFast status."
      })
      return
    }

    let isCancelled = false
    setPermitflowStatus({ status: "loading" })

    loadPermitflowProjectStatus(projectId)
      .then((info) => {
        if (isCancelled) {
          return
        }
        setPermitflowStatus({ status: "success", info })
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }
        const message =
          error instanceof ProjectPersistenceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to check PermitFast status."
        setPermitflowStatus({ status: "error", message })
      })

    return () => {
      isCancelled = true
    }
  }, [projectState])

  const requiredFields = useMemo(
    () =>
      (projectSchema.required ?? []).filter(
        (field): field is keyof ProjectFormData => typeof field === "string"
      ),
    []
  )

  const missingRequiredFields = useMemo(() => {
    if (projectState.status !== "success") {
      return [] as string[]
    }
    return requiredFields
      .filter((field) => !normalizeRequiredFieldValue(projectState.formData[field]))
      .map((field) => {
        const detail = projectFieldDetails.find((entry) => entry.key === field)
        return detail?.title ?? field
      })
  }, [projectState, requiredFields])

  const projectSummary = useMemo(() => {
    if (projectState.status !== "success") {
      return undefined
    }
    return formatProjectSummary(projectState.formData)
  }, [projectState])

  const hasExistingPermitflowProject =
    permitflowStatus.status === "success" && permitflowStatus.info.exists
  const isProjectInformationSubmitted = hasExistingPermitflowProject

  const formattedPermitflowTimestamp = useMemo(() => {
    if (permitflowStatus.status !== "success") {
      return undefined
    }
    const timestamp = permitflowStatus.info.lastUpdated
    if (!timestamp) {
      return undefined
    }
    const parsed = Date.parse(timestamp)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toLocaleString()
    }
    return timestamp
  }, [permitflowStatus])

  const canSubmitProject =
    projectState.status === "success" &&
    missingRequiredFields.length === 0 &&
    authState.status === "authenticated" &&
    submitState.status !== "submitting"

  const sectionFormCount = useMemo(() => {
    if (processState.status !== "success") {
      return 0
    }
    return processState.info.decisionElements.filter((entry) => hasSchema(entry.formData)).length
  }, [processState])

  useEffect(() => {
    if (projectState.status !== "success") {
      setCustomFormState({ status: "idle" })
      setCustomFormDrafts({})
      setDirtySectionIds(new Set())
      setActiveSectionId(undefined)
      return
    }

    if (permitflowStatus.status !== "success" || !permitflowStatus.info.exists) {
      setCustomFormState({ status: "idle" })
      setCustomFormDrafts({})
      setDirtySectionIds(new Set())
      setActiveSectionId(undefined)
      return
    }

    const projectIdValue = projectState.formData.id
    const projectId = projectIdValue ? Number.parseInt(projectIdValue, 10) : Number.NaN
    if (!Number.isFinite(projectId)) {
      setCustomFormState({ status: "error", message: "A numeric project ID is required." })
      return
    }

    let isCancelled = false
    setCustomFormState({ status: "loading" })
    loadPermitflowCustomFormState(projectId)
      .then((info) => {
        if (isCancelled) {
          return
        }
        setCustomFormState({ status: "success", info })
        const formSections = info.sections.filter((section) => section.hasForm)
        setCustomFormDrafts(
          Object.fromEntries(
            formSections.map((section) => [section.decisionElementId, section.evaluationData ?? {}])
          )
        )
        setDirtySectionIds(new Set())
        setActiveSectionId((current) =>
          typeof current === "number" &&
          formSections.some((section) => section.decisionElementId === current)
            ? current
            : formSections[0]?.decisionElementId
        )
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }
        const message =
          error instanceof ProjectPersistenceError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to load the PermitFast SF-299 application."
        setCustomFormState({ status: "error", message })
      })
    return () => {
      isCancelled = true
    }
  }, [projectState, permitflowStatus])

  const handleAuthenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = authEmail.trim()
    const password = authPassword
    if (!email || !password) {
      setAuthState({ status: "error", message: "Email and password are required." })
      return
    }
    setAuthState({ status: "authenticating" })
    setSubmitState({ status: "idle" })

    try {
      const session = await authenticatePermitflowUser({ email, password })
      setAuthState({
        status: "authenticated",
        accessToken: session.accessToken,
        userId: session.userId,
        userEmail: email
      })
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to authenticate with PermitFast."
      setAuthState({ status: "error", message })
    }
  }

  const handleSubmit = async () => {
    if (projectState.status !== "success") {
      setSubmitState({ status: "error", message: "Project details are not available yet." })
      return
    }
    if (missingRequiredFields.length > 0) {
      setSubmitState({
        status: "error",
        message: "Complete the required project fields before submitting."
      })
      return
    }
    if (authState.status !== "authenticated") {
      setSubmitState({
        status: "error",
        message: "Authenticate with PermitFast before submitting."
      })
      return
    }

    setSubmitState({ status: "submitting" })

    try {
      if (hasExistingPermitflowProject) {
        await updatePermitflowProject({
          formData: projectState.formData,
          accessToken: authState.accessToken,
          userId: authState.userId
        })
      } else {
        await submitPermitflowProject({
          formData: projectState.formData,
          accessToken: authState.accessToken,
          userId: authState.userId
        })
      }
      setSubmitState({
        status: "success",
        message: hasExistingPermitflowProject
          ? "Project updated in PermitFast."
          : "Project submitted to PermitFast."
      })
      const projectIdValue = projectState.formData.id
      const projectId = projectIdValue ? Number.parseInt(projectIdValue, 10) : Number.NaN
      if (Number.isFinite(projectId)) {
        try {
          const info = await loadPermitflowProjectStatus(projectId)
          setPermitflowStatus({ status: "success", info })
        } catch (statusError) {
          console.warn("Failed to refresh PermitFast status after submission.", statusError)
        }
      }
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to submit the project to PermitFast."
      setSubmitState({ status: "error", message })
    }
  }

  const handleSectionDraftChange = (decisionElementId: number, draft: Record<string, unknown>) => {
    setCustomFormDrafts((previous) => ({ ...previous, [decisionElementId]: draft }))
    setDirtySectionIds((previous) => {
      if (previous.has(decisionElementId)) {
        return previous
      }
      const next = new Set(previous)
      next.add(decisionElementId)
      return next
    })
  }

  const handleSaveCustomForm = async (decisionElementId: number) => {
    if (projectState.status !== "success") {
      setCustomFormSaveState({ status: "error", message: "Project details are not available yet." })
      return
    }
    if (authState.status !== "authenticated") {
      setCustomFormSaveState({
        status: "error",
        message: "Authenticate with PermitFast before saving this section."
      })
      return
    }
    const projectId = Number.parseInt(projectState.formData.id ?? "", 10)
    if (!Number.isFinite(projectId)) {
      setCustomFormSaveState({ status: "error", message: "A numeric project ID is required." })
      return
    }

    setCustomFormSaveState({ status: "saving" })
    setCustomFormSubmitState({ status: "idle" })
    try {
      await savePermitflowCustomForm({
        portalProjectId: projectId,
        accessToken: authState.accessToken,
        decisionElementId,
        evaluationData: customFormDrafts[decisionElementId] ?? {}
      })
      setDirtySectionIds((previous) => {
        if (!previous.has(decisionElementId)) {
          return previous
        }
        const next = new Set(previous)
        next.delete(decisionElementId)
        return next
      })
      setCustomFormSaveState({ status: "success", message: "Section saved." })
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to save this section."
      setCustomFormSaveState({ status: "error", message })
    }
  }

  const handleSubmitCustomForm = async () => {
    if (projectState.status !== "success") {
      setCustomFormSubmitState({
        status: "error",
        message: "Project details are not available yet."
      })
      return
    }
    if (authState.status !== "authenticated") {
      setCustomFormSubmitState({
        status: "error",
        message: "Authenticate with PermitFast before submitting for approval."
      })
      return
    }
    const projectId = Number.parseInt(projectState.formData.id ?? "", 10)
    if (!Number.isFinite(projectId)) {
      setCustomFormSubmitState({ status: "error", message: "A numeric project ID is required." })
      return
    }

    setCustomFormSubmitState({ status: "submitting" })
    setCustomFormSaveState({ status: "idle" })
    try {
      await submitPermitflowCustomFormForApproval({
        portalProjectId: projectId,
        accessToken: authState.accessToken,
        sections: Array.from(dirtySectionIds).map((decisionElementId) => ({
          decisionElementId,
          evaluationData: customFormDrafts[decisionElementId] ?? {}
        }))
      })
      setDirtySectionIds(new Set())
      setCustomFormSubmitState({
        status: "success",
        message: "Application submitted for approval."
      })
      try {
        const info = await loadPermitflowProjectStatus(projectId)
        setPermitflowStatus({ status: "success", info })
      } catch (statusError) {
        console.warn("Failed to refresh PermitFast status after submission.", statusError)
      }
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to submit the application for approval."
      setCustomFormSubmitState({ status: "error", message })
    }
  }

  let content: ReactNode
  if (processState.status === "loading" || processState.status === "idle") {
    content = (
      <p className="permit-start-page__status" role="status" aria-live="polite">
        Loading permit process information…
      </p>
    )
  } else if (processState.status === "error") {
    content = (
      <div className="permit-start-page__error" role="alert">
        <p>{processState.message}</p>
      </div>
    )
  } else if (processState.status === "success") {
    content = (
      <details className="permit-start-page__details" open>
        <summary className="permit-start-page__details-summary">
          <span className="permit-start-page__details-title">
            {ROW_AUTHORIZATION_SF299_TITLE} information
          </span>
          <span className="permit-start-page__details-icon" aria-hidden="true">
            <svg viewBox="0 0 12 12" focusable="false">
              <path
                d="M4 2.5 8 6l-4 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </summary>
        <div className="permit-start-page__details-body">
          <ProcessInformationDetails info={processState.info} />
        </div>
      </details>
    )
  }

  return (
    <article className="app permit-start-page">
      <div className="app__inner">
        <header className="permit-start-page__header">
          <p className="permit-start-page__eyebrow">{ROW_AUTHORIZATION_SF299_TITLE}</p>
          <h1>Start this permit.</h1>
          <p>
            Use this checklist item to kick off the PermitFast {ROW_AUTHORIZATION_LABEL}{" "}
            workflow, a phased digitization of Standard Form 299. Review the process model and
            form sections below before advancing the application.
          </p>
        </header>
        <section className="permit-start-page__content">
          <section className="permit-start-page__panel">
            <h2>Submit this project to PermitFast</h2>
            <p>
              PermitFast requires a complete project profile and an authenticated Supabase
              session. Once authenticated, your user identifier will be attached to the
              submission record.
            </p>
            {projectState.status === "loading" ? (
              <p className="permit-start-page__status" role="status" aria-live="polite">
                Loading project details…
              </p>
            ) : null}
            {projectState.status === "error" ? (
              <div className="permit-start-page__error" role="alert">
                <p>{projectState.message}</p>
              </div>
            ) : null}
            {projectState.status === "success" ? (
              <div className="permit-start-page__project">
                <div>
                  <h3>Project summary</h3>
                  <pre className="permit-start-page__project-summary">{projectSummary}</pre>
                </div>
                <div>
                  <h3>PermitFast status</h3>
                  {permitflowStatus.status === "loading" ? (
                    <p className="permit-start-page__status" role="status" aria-live="polite">
                      Checking PermitFast for existing records…
                    </p>
                  ) : null}
                  {permitflowStatus.status === "error" ? (
                    <div className="permit-start-page__error" role="alert">
                      <p>{permitflowStatus.message}</p>
                    </div>
                  ) : null}
                  {permitflowStatus.status === "success" ? (
                    <div className="permit-start-page__status" role="status" aria-live="polite">
                      {permitflowStatus.info.exists ? (
                        <p>
                          PermitFast already has this project.
                          {formattedPermitflowTimestamp
                            ? ` Last updated ${formattedPermitflowTimestamp}.`
                            : null}
                        </p>
                      ) : (
                        <p>No PermitFast submission found for this project yet.</p>
                      )}
                      {permitflowStatus.info.rowAuthorizationProcess ? (
                        <p>
                          A {ROW_AUTHORIZATION_SF299_TITLE} process is already underway. Update
                          details to keep it current.
                        </p>
                      ) : null}
                      {permitflowStatus.info.currentStatus?.toLowerCase() === "returned" ? (
                        <div className="permit-start-page__warning" role="alert">
                          <p>
                            A reviewer returned this application for revision. Open the SF-299
                            form sections below to review the feedback, make corrections, and
                            resubmit for approval.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {missingRequiredFields.length > 0 ? (
                  <div className="permit-start-page__warning" role="status" aria-live="polite">
                    <p>Complete the following required fields before submitting:</p>
                    <ul>
                      {missingRequiredFields.map((field) => (
                        <li key={field}>{field}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="permit-start-page__status">
                    Project information is complete. Ready to authenticate.
                  </p>
                )}
                {sectionFormCount > 0 && isProjectInformationSubmitted ? (
                  <div className="permit-start-page__custom-form-status" role="status" aria-live="polite">
                    <p>
                      This process digitizes Standard Form 299 as {sectionFormCount} phased form
                      section{sectionFormCount === 1 ? "" : "s"}.
                    </p>
                    <p>Complete them after you initiate the PermitFast project.</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <form className="permit-start-page__auth" onSubmit={handleAuthenticate}>
              <div className="permit-start-page__auth-fields">
                <label>
                  PermitFast email
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label>
                  PermitFast password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>
              </div>
              <div className="permit-start-page__auth-actions">
                <button
                  type="submit"
                  className="usa-button usa-button--outline"
                  disabled={authState.status === "authenticating"}
                >
                  {authState.status === "authenticating"
                    ? "Authenticating…"
                    : "Authenticate with PermitFast"}
                </button>
                {authState.status === "authenticated" ? (
                  <span className="permit-start-page__auth-success" role="status">
                    Authenticated as {authState.userId}
                  </span>
                ) : null}
                {authState.status === "error" ? (
                  <span className="permit-start-page__auth-error" role="alert">
                    {authState.message}
                  </span>
                ) : null}
              </div>
            </form>
            <div className="permit-start-page__submit">
              <button
                type="button"
                className="usa-button"
                onClick={handleSubmit}
                disabled={!canSubmitProject}
              >
                {submitState.status === "submitting"
                  ? "Submitting…"
                  : hasExistingPermitflowProject
                    ? "Update project in PermitFast"
                    : "Submit project to PermitFast"}
              </button>
              {submitState.status === "error" ? (
                <span className="permit-start-page__submit-error" role="alert">
                  {submitState.message}
                </span>
              ) : null}
              {submitState.status === "success" ? (
                <span className="permit-start-page__submit-success" role="status">
                  {submitState.message}
                </span>
              ) : null}
            </div>
            {sectionFormCount > 0 && isProjectInformationSubmitted ? (
              <div className="permit-start-page__custom-form-actions">
                <button
                  type="button"
                  className="usa-button usa-button--outline"
                  onClick={() => setCustomFormModalOpen(true)}
                >
                  Complete SF-299 Form Sections
                </button>
              </div>
            ) : null}
          </section>
          <section className="permit-start-page__panel">{content}</section>
        </section>
      </div>
      {isCustomFormModalOpen ? (
        <PermitflowSf299FormModal
          state={customFormState}
          drafts={customFormDrafts}
          dirtySectionIds={dirtySectionIds}
          activeSectionId={activeSectionId}
          onSelectSection={setActiveSectionId}
          auth={
            authState.status === "authenticated"
              ? { accessToken: authState.accessToken, userId: authState.userId }
              : undefined
          }
          saveState={customFormSaveState}
          submitState={customFormSubmitState}
          onDismiss={() => {
            setCustomFormModalOpen(false)
            setCustomFormSaveState({ status: "idle" })
            setCustomFormSubmitState({ status: "idle" })
          }}
          onChange={handleSectionDraftChange}
          onSave={handleSaveCustomForm}
          onSubmit={handleSubmitCustomForm}
        />
      ) : null}
    </article>
  )
}

type Sf299UploadContext = {
  auth?: { accessToken: string; userId: string }
  processInstanceId?: number
  permitflowProjectId?: number
  decisionElementId: number
}

function parseDocumentReference(value: unknown): { originalFilename?: string } | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined
  }
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed)
      ? { originalFilename: typeof parsed.originalFilename === "string" ? parsed.originalFilename : undefined }
      : undefined
  } catch {
    return undefined
  }
}

/**
 * RJSF widget for SF-299 `*_file` fields: uploads the picked file to the PermitFast
 * `permit-documents` bucket and stores the JSON-string document reference as the value.
 */
function DocumentUploadWidget(props: WidgetProps) {
  const [isUploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | undefined>(undefined)
  const context = props.formContext as Sf299UploadContext | undefined
  const reference = parseDocumentReference(props.value)

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) {
      return
    }
    if (
      !context?.auth ||
      typeof context.processInstanceId !== "number" ||
      typeof context.permitflowProjectId !== "number"
    ) {
      setUploadError("Authenticate with PermitFast before uploading documents.")
      input.value = ""
      return
    }

    setUploading(true)
    setUploadError(undefined)
    try {
      const { encodedValue } = await uploadPermitflowDocument({
        accessToken: context.auth.accessToken,
        userId: context.auth.userId,
        processInstanceId: context.processInstanceId,
        permitflowProjectId: context.permitflowProjectId,
        decisionElementId: context.decisionElementId,
        fieldName: props.name,
        file
      })
      props.onChange(encodedValue)
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to upload the document."
      setUploadError(message)
    } finally {
      setUploading(false)
      input.value = ""
    }
  }

  return (
    <div className="permit-start-page__file-widget">
      <input
        id={props.id}
        type="file"
        disabled={props.disabled || props.readonly || isUploading}
        onChange={handleFileChange}
      />
      {isUploading ? (
        <p className="permit-start-page__status" role="status" aria-live="polite">
          Uploading…
        </p>
      ) : null}
      {reference?.originalFilename ? (
        <p className="permit-start-page__status">
          Attached: <strong>{reference.originalFilename}</strong>
        </p>
      ) : null}
      {uploadError ? (
        <p className="permit-start-page__submit-error" role="alert">
          {uploadError}
        </p>
      ) : null}
    </div>
  )
}

const SF299_FORM_WIDGETS = { permitfastDocumentUpload: DocumentUploadWidget }

function buildSectionUiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const baseUiSchema = isRecord(schema.uiSchema) ? { ...schema.uiSchema } : {}
  const properties = isRecord(schema.properties) ? schema.properties : {}
  for (const key of Object.keys(properties)) {
    if (!key.endsWith("_file")) {
      continue
    }
    const existing = isRecord(baseUiSchema[key]) ? baseUiSchema[key] : {}
    baseUiSchema[key] = { ...existing, "ui:widget": "permitfastDocumentUpload" }
  }
  return baseUiSchema
}

function sectionDisplayTitle(section: PermitflowSectionFormState, index: number): string {
  return section.title ?? section.referenceId ?? `Section ${index + 1}`
}

type PermitflowSf299FormModalProps = {
  state: CustomFormModalState
  drafts: Record<number, Record<string, unknown>>
  dirtySectionIds: ReadonlySet<number>
  activeSectionId?: number
  onSelectSection: (decisionElementId: number) => void
  auth?: { accessToken: string; userId: string }
  saveState: CustomFormActionState
  submitState: CustomFormActionState
  onDismiss: () => void
  onChange: (decisionElementId: number, draft: Record<string, unknown>) => void
  onSave: (decisionElementId: number) => void
  onSubmit: () => void
}

function PermitflowSf299FormModal({
  state,
  drafts,
  dirtySectionIds,
  activeSectionId,
  onSelectSection,
  auth,
  saveState,
  submitState,
  onDismiss,
  onChange,
  onSave,
  onSubmit
}: PermitflowSf299FormModalProps) {
  useEffect(() => {
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
  }, [onDismiss])

  useEffect(() => {
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = "hidden"
    return () => {
      body.style.overflow = previousOverflow
    }
  }, [])

  const isAuthenticated = Boolean(auth)
  const info = state.status === "success" ? state.info : undefined
  const formSections = useMemo(
    () => (info?.sections ?? []).filter((section) => section.hasForm),
    [info]
  )
  const activeSection =
    formSections.find((section) => section.decisionElementId === activeSectionId) ??
    formSections[0]
  const wasReturned = info?.projectCurrentStatus?.toLowerCase() === "returned"

  const activeSchema =
    activeSection && hasSchema(activeSection.formSchema) ? activeSection.formSchema : undefined
  const activeUiSchema = activeSchema ? buildSectionUiSchema(activeSchema) : undefined
  const activeSchemaForRjsf = activeSchema
    ? Object.fromEntries(Object.entries(activeSchema).filter(([key]) => key !== "uiSchema"))
    : undefined
  const uploadContext: Sf299UploadContext | undefined = activeSection
    ? {
        auth,
        processInstanceId: info?.processInstanceId,
        permitflowProjectId: info?.projectId,
        decisionElementId: activeSection.decisionElementId
      }
    : undefined

  return (
    <div className="process-info-modal__backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="process-info-modal permit-start-page__custom-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permitflow-custom-form-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="process-info-modal__header">
          <div>
            <p className="process-info-modal__eyebrow">{ROW_AUTHORIZATION_SF299_TITLE}</p>
            <h2 id="permitflow-custom-form-modal-title">SF-299 application</h2>
          </div>
          <button
            type="button"
            className="process-info-modal__close"
            onClick={onDismiss}
            aria-label="Close SF-299 application dialog"
          >
            ×
          </button>
        </header>
        <div className="process-info-modal__body">
          {state.status === "loading" || state.status === "idle" ? (
            <p className="permit-start-page__status" role="status" aria-live="polite">
              Loading SF-299 application…
            </p>
          ) : null}
          {state.status === "error" ? (
            <div className="permit-start-page__error" role="alert">
              <p>{state.message}</p>
            </div>
          ) : null}
          {info && info.exists && formSections.length > 0 ? (
            <>
              {wasReturned ? (
                <div className="permit-start-page__warning" role="alert">
                  <p>
                    A reviewer returned this application for revision. Sections with feedback are
                    flagged below — update them and resubmit for approval.
                  </p>
                </div>
              ) : null}
              {!isAuthenticated ? (
                <div className="permit-start-page__warning" role="status">
                  Authenticate with PermitFast on the start page to save or submit this form.
                </div>
              ) : null}
              <div className="permit-start-page__sf299">
                <nav className="permit-start-page__sf299-nav" aria-label="SF-299 form sections">
                  <ul>
                    {formSections.map((section, index) => {
                      const isActive =
                        activeSection?.decisionElementId === section.decisionElementId
                      const needsRevision = section.resultBool === false && section.resultNotes
                      return (
                        <li key={section.decisionElementId}>
                          <button
                            type="button"
                            className={`permit-start-page__sf299-nav-item${
                              isActive ? " permit-start-page__sf299-nav-item--active" : ""
                            }`}
                            aria-current={isActive ? "true" : undefined}
                            onClick={() => onSelectSection(section.decisionElementId)}
                          >
                            <span>
                              {index + 1}. {sectionDisplayTitle(section, index)}
                            </span>
                            {needsRevision ? (
                              <span className="permit-start-page__sf299-flag">Revision requested</span>
                            ) : null}
                            {dirtySectionIds.has(section.decisionElementId) ? (
                              <span className="permit-start-page__sf299-flag permit-start-page__sf299-flag--dirty">
                                Unsaved changes
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </nav>
                <div className="permit-start-page__sf299-panel">
                  {activeSection && activeSchemaForRjsf ? (
                    <>
                      {activeSection.description ? (
                        <p className="permit-start-page__status">{activeSection.description}</p>
                      ) : null}
                      {activeSection.resultBool === false && activeSection.resultNotes ? (
                        <div className="permit-start-page__warning" role="alert">
                          <p>
                            <strong>Reviewer feedback:</strong> {activeSection.resultNotes}
                          </p>
                        </div>
                      ) : null}
                      <div className="permit-start-page__custom-form-shell">
                        <Form
                          key={activeSection.decisionElementId}
                          schema={activeSchemaForRjsf}
                          uiSchema={activeUiSchema}
                          formData={drafts[activeSection.decisionElementId] ?? {}}
                          validator={validator}
                          widgets={SF299_FORM_WIDGETS}
                          formContext={uploadContext}
                          onChange={(event: IChangeEvent) => {
                            onChange(
                              activeSection.decisionElementId,
                              (event.formData as Record<string, unknown>) ?? {}
                            )
                          }}
                        >
                          <div />
                        </Form>
                      </div>
                      <div className="permit-start-page__custom-form-footer">
                        <button
                          type="button"
                          className="usa-button usa-button--outline"
                          disabled={
                            !isAuthenticated ||
                            saveState.status === "saving" ||
                            submitState.status === "submitting"
                          }
                          onClick={() => onSave(activeSection.decisionElementId)}
                        >
                          {saveState.status === "saving" ? "Saving…" : "Save section"}
                        </button>
                        <button
                          type="button"
                          className="usa-button"
                          disabled={
                            !isAuthenticated ||
                            submitState.status === "submitting" ||
                            saveState.status === "saving"
                          }
                          onClick={onSubmit}
                        >
                          {submitState.status === "submitting"
                            ? "Submitting…"
                            : wasReturned
                              ? "Resubmit for approval"
                              : "Submit for approval"}
                        </button>
                        {saveState.status === "error" ? (
                          <span className="permit-start-page__submit-error" role="alert">
                            {saveState.message}
                          </span>
                        ) : null}
                        {saveState.status === "success" ? (
                          <span className="permit-start-page__submit-success" role="status">
                            {saveState.message}
                          </span>
                        ) : null}
                        {submitState.status === "error" ? (
                          <span className="permit-start-page__submit-error" role="alert">
                            {submitState.message}
                          </span>
                        ) : null}
                        {submitState.status === "success" ? (
                          <span className="permit-start-page__submit-success" role="status">
                            {submitState.message}
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="permit-start-page__status">
                      Select a section to review its form.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
          {info && (!info.exists || formSections.length === 0) ? (
            <p className="permit-start-page__status">
              No SF-299 form sections are currently available for this process.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
