import { useEffect, useMemo, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import Form from "@rjsf/core"
import type { IChangeEvent } from "@rjsf/core"
import validator from "@rjsf/validator-ajv8"

import "./App.css"
import { ProcessInformationDetails } from "./components/ProcessInformationDetails"
import {
  authenticatePermitflowUser,
  loadPermitflowCustomFormState,
  loadPermitflowProjectStatus,
  loadPermitflowProcessInformation,
  savePermitflowCustomForm,
  submitPermitflowCustomFormForApproval,
  submitPermitflowProject,
  updatePermitflowProject,
  type PermitflowCustomFormState,
  type PermitflowProjectStatus
} from "./utils/permitflow"
import {
  formatProjectSummary,
  projectFieldDetails,
  projectSchema,
  type ProjectFormData
} from "./schema/projectSchema"
import { loadProjectPortalState } from "./utils/projectPersistence"
import { ProjectPersistenceError, type ProcessInformation } from "./utils/projectPersistence"

const BASIC_PERMIT_PROCESS_MODEL_ID = 1

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

function isSf299DecisionElement(candidate: { title: string | null; other: unknown }): boolean {
  const title = candidate.title?.toLowerCase()
  const otherRecord = isRecord(candidate.other) ? candidate.other : undefined
  const formType = typeof otherRecord?.form_type === "string" ? otherRecord.form_type.toLowerCase() : undefined
  return Boolean(title?.includes("sf-299")) || formType === "sf299"
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
  const [customFormDraft, setCustomFormDraft] = useState<Record<string, unknown>>({})
  const [customFormSaveState, setCustomFormSaveState] = useState<CustomFormActionState>({
    status: "idle"
  })
  const [customFormSubmitState, setCustomFormSubmitState] = useState<CustomFormActionState>({
    status: "idle"
  })

  useEffect(() => {
    let isCancelled = false
    setProcessState({ status: "loading" })

    loadPermitflowProcessInformation(BASIC_PERMIT_PROCESS_MODEL_ID)
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
        message: "Provide a project identifier to submit to PermitFlow."
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
        message: "Project identifiers must be numeric to check PermitFlow status."
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
              : "Unable to check PermitFlow status."
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

  const customFormIndicator = useMemo(() => {
    if (processState.status !== "success") {
      return undefined
    }
    const withSchema = processState.info.decisionElements.filter((entry) => hasSchema(entry.formData))
    if (withSchema.length === 0) {
      return undefined
    }
    const selected = withSchema.find((entry) => isSf299DecisionElement(entry)) ?? withSchema[2] ?? withSchema[0]
    return {
      title: selected.title ?? "Custom form",
      decisionElementId: selected.id
    }
  }, [processState])

  useEffect(() => {
    if (projectState.status !== "success") {
      setCustomFormState({ status: "idle" })
      setCustomFormDraft({})
      return
    }

    if (permitflowStatus.status !== "success" || !permitflowStatus.info.exists) {
      setCustomFormState({ status: "idle" })
      setCustomFormDraft({})
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
        setCustomFormDraft(info.evaluationData ?? {})
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
              : "Unable to load PermitFlow custom form."
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
            : "Unable to authenticate with PermitFlow."
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
        message: "Authenticate with PermitFlow before submitting."
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
          userId: authState.userId,
          userEmail: authState.userEmail
        })
      }
      setSubmitState({
        status: "success",
        message: hasExistingPermitflowProject
          ? "Project updated in PermitFlow."
          : "Project submitted to PermitFlow."
      })
      const projectIdValue = projectState.formData.id
      const projectId = projectIdValue ? Number.parseInt(projectIdValue, 10) : Number.NaN
      if (Number.isFinite(projectId)) {
        try {
          const info = await loadPermitflowProjectStatus(projectId)
          setPermitflowStatus({ status: "success", info })
        } catch (statusError) {
          console.warn("Failed to refresh PermitFlow status after submission.", statusError)
        }
      }
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to submit the project to PermitFlow."
      setSubmitState({ status: "error", message })
    }
  }

  const handleSaveCustomForm = async () => {
    if (projectState.status !== "success") {
      setCustomFormSaveState({ status: "error", message: "Project details are not available yet." })
      return
    }
    if (authState.status !== "authenticated") {
      setCustomFormSaveState({
        status: "error",
        message: "Authenticate with PermitFlow before saving the custom form."
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
        evaluationData: customFormDraft
      })
      setCustomFormSaveState({ status: "success", message: "Custom form saved." })
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to save the custom form."
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
        message: "Authenticate with PermitFlow before submitting for approval."
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
        evaluationData: customFormDraft
      })
      setCustomFormSubmitState({
        status: "success",
        message: "Custom form submitted for approval."
      })
      try {
        const info = await loadPermitflowProjectStatus(projectId)
        setPermitflowStatus({ status: "success", info })
      } catch (statusError) {
        console.warn("Failed to refresh PermitFlow status after custom form submission.", statusError)
      }
    } catch (error) {
      const message =
        error instanceof ProjectPersistenceError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to submit custom form for approval."
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
          <span className="permit-start-page__details-title">Basic permit information</span>
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
          <p className="permit-start-page__eyebrow">Basic permit</p>
          <h1>Start this permit.</h1>
          <p>
            Use this checklist item to kick off the PermitFlow workflow. Review the process
            model and decision elements below before advancing the application.
          </p>
        </header>
        <section className="permit-start-page__content">
          <section className="permit-start-page__panel">
            <h2>Submit this project to PermitFlow</h2>
            <p>
              PermitFlow requires a complete project profile and an authenticated Supabase
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
                  <h3>PermitFlow status</h3>
                  {permitflowStatus.status === "loading" ? (
                    <p className="permit-start-page__status" role="status" aria-live="polite">
                      Checking PermitFlow for existing records…
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
                          PermitFlow already has this project.
                          {formattedPermitflowTimestamp
                            ? ` Last updated ${formattedPermitflowTimestamp}.`
                            : null}
                        </p>
                      ) : (
                        <p>No PermitFlow submission found for this project yet.</p>
                      )}
                      {permitflowStatus.info.basicPermitProcess ? (
                        <p>
                          A Basic Permit process is already underway. Update details to keep it
                          current.
                        </p>
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
                {customFormIndicator ? (
                  <div className="permit-start-page__custom-form-status" role="status" aria-live="polite">
                    <p>
                      This process includes a custom form ({customFormIndicator.title}, decision element{" "}
                      {customFormIndicator.decisionElementId}).
                    </p>
                    <p>Complete it after you initiate the PermitFlow project.</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <form className="permit-start-page__auth" onSubmit={handleAuthenticate}>
              <div className="permit-start-page__auth-fields">
                <label>
                  PermitFlow email
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label>
                  PermitFlow password
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
                    : "Authenticate with PermitFlow"}
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
                    ? "Update project in PermitFlow"
                    : "Submit project to PermitFlow"}
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
            {customFormIndicator ? (
              <div className="permit-start-page__custom-form-actions">
                <button
                  type="button"
                  className="usa-button usa-button--outline"
                  onClick={() => setCustomFormModalOpen(true)}
                  disabled={!hasExistingPermitflowProject}
                >
                  Open custom form
                </button>
                {!hasExistingPermitflowProject ? (
                  <span className="permit-start-page__status">
                    Submit this project first to open the custom form.
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>
          <section className="permit-start-page__panel">{content}</section>
        </section>
      </div>
      {isCustomFormModalOpen ? (
        <PermitflowCustomFormModal
          state={customFormState}
          formData={customFormDraft}
          isAuthenticated={authState.status === "authenticated"}
          saveState={customFormSaveState}
          submitState={customFormSubmitState}
          onDismiss={() => {
            setCustomFormModalOpen(false)
            setCustomFormSaveState({ status: "idle" })
            setCustomFormSubmitState({ status: "idle" })
          }}
          onChange={(event) => {
            setCustomFormDraft((event.formData as Record<string, unknown>) ?? {})
          }}
          onSave={handleSaveCustomForm}
          onSubmit={handleSubmitCustomForm}
        />
      ) : null}
    </article>
  )
}

type PermitflowCustomFormModalProps = {
  state: CustomFormModalState
  formData: Record<string, unknown>
  isAuthenticated: boolean
  saveState: CustomFormActionState
  submitState: CustomFormActionState
  onDismiss: () => void
  onChange: (event: IChangeEvent) => void
  onSave: () => void
  onSubmit: () => void
}

function PermitflowCustomFormModal({
  state,
  formData,
  isAuthenticated,
  saveState,
  submitState,
  onDismiss,
  onChange,
  onSave,
  onSubmit
}: PermitflowCustomFormModalProps) {
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

  const customFormSchema =
    state.status === "success" && hasSchema(state.info.formSchema)
      ? state.info.formSchema
      : undefined
  const uiSchema =
    customFormSchema && isRecord(customFormSchema.uiSchema)
      ? (customFormSchema.uiSchema as Record<string, unknown>)
      : undefined
  const schemaForRjsf = customFormSchema
    ? Object.fromEntries(
        Object.entries(customFormSchema).filter(([key]) => key !== "uiSchema")
      )
    : undefined

  return (
    <div className="process-info-modal__backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="process-info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="permitflow-custom-form-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="process-info-modal__header">
          <div>
            <p className="process-info-modal__eyebrow">Basic permit</p>
            <h2 id="permitflow-custom-form-modal-title">Custom form</h2>
          </div>
          <button
            type="button"
            className="process-info-modal__close"
            onClick={onDismiss}
            aria-label="Close custom form dialog"
          >
            ×
          </button>
        </header>
        <div className="process-info-modal__body">
          {state.status === "loading" || state.status === "idle" ? (
            <p className="permit-start-page__status" role="status" aria-live="polite">
              Loading custom form…
            </p>
          ) : null}
          {state.status === "error" ? (
            <div className="permit-start-page__error" role="alert">
              <p>{state.message}</p>
            </div>
          ) : null}
          {state.status === "success" && state.info.exists && schemaForRjsf ? (
            <>
              {state.info.decisionElementTitle ? (
                <p className="permit-start-page__status">
                  Decision element: {state.info.decisionElementTitle}
                </p>
              ) : null}
              {!isAuthenticated ? (
                <div className="permit-start-page__warning" role="status">
                  Authenticate with PermitFlow on the start page to save or submit this form.
                </div>
              ) : null}
              <Form
                schema={schemaForRjsf}
                uiSchema={uiSchema}
                formData={formData}
                validator={validator}
                onChange={onChange}
              >
                <div />
              </Form>
              <div className="permit-start-page__custom-form-footer">
                <button
                  type="button"
                  className="usa-button usa-button--outline"
                  disabled={!isAuthenticated || saveState.status === "saving" || submitState.status === "submitting"}
                  onClick={onSave}
                >
                  {saveState.status === "saving" ? "Saving…" : "Save form"}
                </button>
                <button
                  type="button"
                  className="usa-button"
                  disabled={!isAuthenticated || submitState.status === "submitting" || saveState.status === "saving"}
                  onClick={onSubmit}
                >
                  {submitState.status === "submitting" ? "Submitting…" : "Submit for approval"}
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
          ) : null}
          {state.status === "success" && (!state.info.exists || !schemaForRjsf) ? (
            <p className="permit-start-page__status">
              No custom form schema is currently available for this process.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
