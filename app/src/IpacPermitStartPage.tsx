import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import "./App.css"
import { ProcessInformationDetails } from "./components/ProcessInformationDetails"
import {
  formatProjectSummary,
  projectFieldDetails,
  projectSchema,
  type ProjectFormData
} from "./schema/projectSchema"
import { extractIpacStartProjectUrl, prepareGeospatialPayload } from "./utils/geospatial"
import { IPAC_SHADOW_PROCESS_INFORMATION, IPAC_SHADOW_PROCESS_MODEL_ID } from "./utils/ipacShadowWorkflow"
import {
  completeIpacShadowWorkflowConsultation,
  completeIpacShadowWorkflowProjectCreated,
  loadIpacShadowWorkflowStatus,
  loadProcessInformation,
  loadProjectPortalState,
  recordIpacShadowWorkflowSubmission,
  ProjectPersistenceError,
  type IpacShadowWorkflowStatus,
  type ProcessInformation
} from "./utils/projectPersistence"

type ProcessInformationState =
  | { status: "idle" | "loading" }
  | { status: "success"; info: ProcessInformation }
  | { status: "error"; message: string; info: ProcessInformation }

type ProjectInformationState =
  | { status: "idle" | "loading" }
  | { status: "success"; formData: ProjectFormData }
  | { status: "error"; message: string }

type IpacSubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string; startProjectUrl: string }
  | { status: "error"; message: string }

type WorkflowState =
  | { status: "idle" | "loading" }
  | { status: "success"; workflow: IpacShadowWorkflowStatus }
  | { status: "error"; message: string }

type WorkflowActionState =
  | { status: "idle" }
  | { status: "submitting"; action: "project-created" | "consultation-complete" }
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

function formatTimestamp(value?: string | null) {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

async function copyText(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard access is not available in this browser.")
  }
  await navigator.clipboard.writeText(value)
}

export default function IpacPermitStartPage() {
  const [processState, setProcessState] = useState<ProcessInformationState>({ status: "idle" })
  const [projectState, setProjectState] = useState<ProjectInformationState>({ status: "idle" })
  const [submitState, setSubmitState] = useState<IpacSubmissionState>({ status: "idle" })
  const [workflowState, setWorkflowState] = useState<WorkflowState>({ status: "idle" })
  const [workflowActionState, setWorkflowActionState] = useState<WorkflowActionState>({
    status: "idle"
  })
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [searchParams] = useSearchParams()

  const projectId = useMemo(() => {
    const raw = searchParams.get("projectId")
    if (!raw) {
      return undefined
    }
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }, [searchParams])

  useEffect(() => {
    let isCancelled = false
    setProcessState({ status: "loading" })

    loadProcessInformation(IPAC_SHADOW_PROCESS_MODEL_ID)
      .then((info) => {
        if (!isCancelled) {
          setProcessState({ status: "success", info })
        }
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
              : "Unable to load the IPaC process model from Supabase."
        setProcessState({ status: "error", message, info: IPAC_SHADOW_PROCESS_INFORMATION })
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    if (typeof projectId !== "number") {
      setProjectState({
        status: "error",
        message: "Provide a numeric project identifier to manage an IPaC consultation."
      })
      return () => {
        isCancelled = true
      }
    }

    setProjectState({ status: "loading" })
    loadProjectPortalState(projectId)
      .then((result) => {
        if (!isCancelled) {
          setProjectState({ status: "success", formData: result.formData })
        }
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
      })

    return () => {
      isCancelled = true
    }
  }, [projectId])

  useEffect(() => {
    let isCancelled = false
    if (typeof projectId !== "number") {
      setWorkflowState({ status: "idle" })
      return () => {
        isCancelled = true
      }
    }

    setWorkflowState({ status: "loading" })
    loadIpacShadowWorkflowStatus(projectId)
      .then((workflow) => {
        if (!isCancelled) {
          setWorkflowState({ status: "success", workflow })
        }
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
              : "Unable to load the IPaC workflow state."
        setWorkflowState({ status: "error", message })
      })

    return () => {
      isCancelled = true
    }
  }, [projectId])

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

  const preparedPayload = useMemo(() => {
    if (projectState.status !== "success") {
      return undefined
    }
    return prepareGeospatialPayload(projectState.formData.location_object ?? null)
  }, [projectState])

  const ipacReadinessMessage = useMemo(() => {
    if (!preparedPayload) {
      return undefined
    }
    if (preparedPayload.ipac) {
      return "Project footprint is ready for IPaC submission."
    }
    return (
      preparedPayload.errors.find((message) => message.toLowerCase().includes("ipac")) ??
      preparedPayload.errors[0] ??
      "Attach a polygon or line footprint before submitting to IPaC."
    )
  }, [preparedPayload])

  const workflow = workflowState.status === "success" ? workflowState.workflow : undefined
  const effectiveStartProjectUrl =
    submitState.status === "success" ? submitState.startProjectUrl : workflow?.startProjectUrl ?? undefined

  const canSubmitProject =
    projectState.status === "success" &&
    typeof projectId === "number" &&
    missingRequiredFields.length === 0 &&
    Boolean(preparedPayload?.ipac) &&
    submitState.status !== "submitting"

  const handleCopy = async (value: string, label: string) => {
    try {
      await copyText(value)
      setCopyFeedback(`${label} copied.`)
      window.setTimeout(() => setCopyFeedback(null), 2500)
    } catch (error) {
      setCopyFeedback(error instanceof Error ? error.message : "Unable to copy text.")
      window.setTimeout(() => setCopyFeedback(null), 2500)
    }
  }

  const refreshWorkflow = async (resolvedProjectId: number) => {
    const next = await loadIpacShadowWorkflowStatus(resolvedProjectId)
    setWorkflowState({ status: "success", workflow: next })
  }

  const handleSubmit = async () => {
    if (projectState.status !== "success" || typeof projectId !== "number") {
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
    if (!preparedPayload?.ipac) {
      setSubmitState({
        status: "error",
        message: ipacReadinessMessage ?? "Attach a polygon or line footprint before submitting."
      })
      return
    }

    setSubmitState({ status: "submitting" })

    try {
      const response = await fetch("/api/geospatial/ipac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: "beta",
          projectLocationWKT: preparedPayload.ipac.wkt,
          includeOtherFwsResources: true,
          includeCrithabGeometry: false,
          saveLocationForProjectCreation: true,
          timeout: 5
        })
      })
      const text = await response.text()
      let payload: unknown = null
      if (text) {
        try {
          payload = JSON.parse(text)
        } catch {
          payload = { data: text }
        }
      }

      if (!response.ok) {
        const body = payload as { error?: unknown }
        const errorMessage =
          (typeof body?.error === "string" ? body.error : text) ||
          `IPaC request failed (${response.status})`
        throw new Error(errorMessage)
      }

      const data =
        payload && typeof payload === "object" && "data" in payload
          ? (payload as { data: unknown }).data
          : payload
      const startProjectUrl = extractIpacStartProjectUrl(data)
      if (!startProjectUrl) {
        throw new Error("IPaC returned a response, but no project creation URL was included.")
      }

      await recordIpacShadowWorkflowSubmission({
        projectId,
        projectTitle: projectState.formData.title ?? null,
        startProjectUrl
      })
      await refreshWorkflow(projectId)

      setSubmitState({
        status: "success",
        message: "Project footprint submitted to IPaC beta. Continue the consultation there.",
        startProjectUrl
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit project data to IPaC."
      setSubmitState({ status: "error", message })
    }
  }

  const handleCompleteProjectCreated = async () => {
    if (projectState.status !== "success" || typeof projectId !== "number") {
      return
    }
    setWorkflowActionState({ status: "submitting", action: "project-created" })
    try {
      const next = await completeIpacShadowWorkflowProjectCreated({
        projectId,
        projectTitle: projectState.formData.title ?? null
      })
      setWorkflowState({ status: "success", workflow: next })
      setWorkflowActionState({ status: "idle" })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to mark the IPaC project as created."
      setWorkflowActionState({ status: "error", message })
    }
  }

  const handleCompleteConsultation = async () => {
    if (projectState.status !== "success" || typeof projectId !== "number") {
      return
    }
    setWorkflowActionState({ status: "submitting", action: "consultation-complete" })
    try {
      const next = await completeIpacShadowWorkflowConsultation({
        projectId,
        projectTitle: projectState.formData.title ?? null
      })
      setWorkflowState({ status: "success", workflow: next })
      setWorkflowActionState({ status: "idle" })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to mark the consultation as complete."
      setWorkflowActionState({ status: "error", message })
    }
  }

  const decisionElements = [
    {
      title: "Geospatial data",
      description: "Completed automatically after HelpPermitMe submits the saved project footprint to IPaC.",
      completedAt: workflow?.geospatialDataCompletedAt,
      action: null
    },
    {
      title: "Project Created",
      description: "Mark this once you have authenticated with login.gov and created the project in IPaC.",
      completedAt: workflow?.projectCreatedAt,
      action: (
        <button
          type="button"
          className="secondary"
          onClick={handleCompleteProjectCreated}
          disabled={
            Boolean(workflow?.projectCreatedAt) ||
            workflowActionState.status === "submitting" ||
            !effectiveStartProjectUrl
          }
        >
          {workflowActionState.status === "submitting" &&
          workflowActionState.action === "project-created"
            ? "Saving…"
            : "Mark Project Created"}
        </button>
      )
    },
    {
      title: "Consultation Complete",
      description: "Mark this after the external consultation has been completed in IPaC.",
      completedAt: workflow?.consultationCompletedAt,
      action: (
        <button
          type="button"
          className="secondary"
          onClick={handleCompleteConsultation}
          disabled={
            Boolean(workflow?.consultationCompletedAt) ||
            workflowActionState.status === "submitting" ||
            !workflow?.projectCreatedAt
          }
        >
          {workflowActionState.status === "submitting" &&
          workflowActionState.action === "consultation-complete"
            ? "Saving…"
            : "Mark Consultation Complete"}
        </button>
      )
    }
  ]

  const processInfo = processState.status === "success" || processState.status === "error"
    ? processState.info
    : IPAC_SHADOW_PROCESS_INFORMATION

  return (
    <article className="app permit-start-page ipac-start-page">
      <div className="app__inner">
        <header className="permit-start-page__header">
          <p className="permit-start-page__eyebrow">FWS ESA consultation</p>
          <h1>Start this permit.</h1>
          <p>
            This shadow workflow tracks the IPaC endangered species consultation inside HelpPermitMe
            while the user completes the authoritative external steps in IPaC.
          </p>
        </header>
        <section className="permit-start-page__content">
          <section className="permit-start-page__panel">
            <h2>Permit management</h2>
            <p>
              HelpPermitMe can submit the footprint and track milestone completion, but users still
              authenticate with login.gov and finish the consultation in IPaC.
            </p>
            {projectState.status === "loading" ? (
              <p className="permit-start-page__status" role="status">Loading project details…</p>
            ) : null}
            {projectState.status === "error" ? (
              <div className="permit-start-page__error" role="alert">
                <p>{projectState.message}</p>
              </div>
            ) : null}
            {projectState.status === "success" ? (
              <>
                <div className="permit-start-page__project">
                  <div>
                    <h3>Project title</h3>
                    <div className="ipac-start-page__copy-block">
                      <textarea
                        readOnly
                        value={projectState.formData.title ?? ""}
                        className="ipac-start-page__copy-field"
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleCopy(projectState.formData.title ?? "", "Project title")}
                        disabled={!projectState.formData.title}
                      >
                        Copy title
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3>Project description</h3>
                    <div className="ipac-start-page__copy-block">
                      <textarea
                        readOnly
                        value={projectState.formData.description ?? ""}
                        className="ipac-start-page__copy-field ipac-start-page__copy-field--multiline"
                      />
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          handleCopy(projectState.formData.description ?? "", "Project description")
                        }
                        disabled={!projectState.formData.description}
                      >
                        Copy description
                      </button>
                    </div>
                  </div>
                  <div>
                    <h3>Project summary</h3>
                    <pre className="permit-start-page__project-summary">{projectSummary}</pre>
                  </div>
                  <div>
                    <h3>IPaC readiness</h3>
                    <p className="permit-start-page__status">{ipacReadinessMessage}</p>
                    {workflow?.startedAt ? (
                      <p className="permit-start-page__status">
                        Workflow started: {formatTimestamp(workflow.startedAt)}
                      </p>
                    ) : null}
                    {workflow?.consultationCompletedAt ? (
                      <p className="permit-start-page__submit-success">
                        Consultation completed: {formatTimestamp(workflow.consultationCompletedAt)}
                      </p>
                    ) : null}
                  </div>
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
                ) : null}

                <div className="permit-start-page__submit">
                  <button
                    type="button"
                    className="usa-button"
                    onClick={handleSubmit}
                    disabled={!canSubmitProject}
                  >
                    {submitState.status === "submitting"
                      ? "Submitting project data…"
                      : "Submit project data"}
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

                {effectiveStartProjectUrl ? (
                  <div className="ipac-start-page__continue">
                    <h3>Continue in IPaC</h3>
                    <p>
                      <a
                        href={effectiveStartProjectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ipac-start-page__continue-link"
                      >
                        Open returned IPaC project link
                      </a>
                    </p>
                  </div>
                ) : null}

                <div className="ipac-start-page__milestones">
                  <h3>Decision elements</h3>
                  {workflowState.status === "loading" ? (
                    <p className="permit-start-page__status">Loading workflow state…</p>
                  ) : null}
                  {workflowState.status === "error" ? (
                    <p className="permit-start-page__submit-error">{workflowState.message}</p>
                  ) : null}
                  {workflowActionState.status === "error" ? (
                    <p className="permit-start-page__submit-error">{workflowActionState.message}</p>
                  ) : null}
                  <ul className="ipac-start-page__decision-list">
                    {decisionElements.map((element) => (
                      <li key={element.title} className="ipac-start-page__decision">
                        <div>
                          <h4>{element.title}</h4>
                          <p>{element.description}</p>
                          <p className="permit-start-page__status">
                            {element.completedAt
                              ? `Completed ${formatTimestamp(element.completedAt)}`
                              : "Not completed yet"}
                          </p>
                        </div>
                        {element.action}
                      </li>
                    ))}
                  </ul>
                </div>

                {copyFeedback ? <p className="permit-start-page__status">{copyFeedback}</p> : null}
              </>
            ) : null}
          </section>

          <section className="permit-start-page__panel">
            <details className="permit-start-page__details" open>
              <summary className="permit-start-page__details-summary">
                <span className="permit-start-page__details-title">IPaC process information</span>
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
                {processState.status === "error" ? (
                  <p className="process-info-section__empty">
                    Supabase process-model seed not found yet. Showing the local fallback definition.
                  </p>
                ) : null}
                <ProcessInformationDetails info={processInfo} />
              </div>
            </details>
          </section>
        </section>
      </div>
    </article>
  )
}
