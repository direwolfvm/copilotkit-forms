import { useEffect, useMemo, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { useSearchParams } from "react-router-dom"

import "./App.css"
import { ProcessInformationDetails } from "./components/ProcessInformationDetails"
import {
  authenticatePermitflowUser,
  loadPermitflowProjectStatus,
  loadPermitflowProcessInformation,
  submitPermitflowProject,
  updatePermitflowProject,
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
          </section>
          <section className="permit-start-page__panel">{content}</section>
        </section>
      </div>
    </article>
  )
}
