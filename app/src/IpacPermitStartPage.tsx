import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useSearchParams } from "react-router-dom"

import "./App.css"
import {
  formatProjectSummary,
  projectFieldDetails,
  projectSchema,
  type ProjectFormData
} from "./schema/projectSchema"
import { loadProjectPortalState } from "./utils/projectPersistence"
import { ProjectPersistenceError } from "./utils/projectPersistence"
import { extractIpacStartProjectUrl, prepareGeospatialPayload } from "./utils/geospatial"

type ProjectInformationState =
  | { status: "idle" | "loading" }
  | { status: "success"; formData: ProjectFormData }
  | { status: "error"; message: string }

type IpacSubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string; startProjectUrl: string }
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

export default function IpacPermitStartPage() {
  const [projectState, setProjectState] = useState<ProjectInformationState>({ status: "idle" })
  const [submitState, setSubmitState] = useState<IpacSubmissionState>({ status: "idle" })
  const [searchParams] = useSearchParams()

  useEffect(() => {
    let isCancelled = false
    const projectId = searchParams.get("projectId")
    if (!projectId) {
      setProjectState({
        status: "error",
        message: "Provide a project identifier to submit to IPaC."
      })
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
      })

    return () => {
      isCancelled = true
    }
  }, [searchParams])

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

  const canSubmitProject =
    projectState.status === "success" &&
    missingRequiredFields.length === 0 &&
    Boolean(preparedPayload?.ipac) &&
    submitState.status !== "submitting"

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
      const startProjectUrl = extractIpacStartProjectUrl(data)
      if (!startProjectUrl) {
        throw new Error("IPaC returned a response, but no project creation URL was included.")
      }

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

  const placeholderContent: ReactNode = (
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
        <section className="process-info-section">
          <h3>IPaC beta handoff</h3>
          <p className="process-info-section__description">
            IPaC does not expose a broadcast process model the way PermitFlow and Review Works do,
            so this screen uses placeholders instead of local process-model metadata.
          </p>
          <dl className="process-info-definition-list">
            <div className="process-info-definition">
              <dt>Agency system</dt>
              <dd>IPaC beta (DOI / USFWS)</dd>
            </div>
            <div className="process-info-definition">
              <dt>Integration mode</dt>
              <dd>Manual Integration (not data standards compliant)</dd>
            </div>
            <div className="process-info-definition">
              <dt>Process model</dt>
              <dd>Placeholder only. IPaC does not broadcast one through this API.</dd>
            </div>
            <div className="process-info-definition">
              <dt>Submission artifact</dt>
              <dd>IPaC returns a `startProjectURL` for the user to continue project creation.</dd>
            </div>
            <div className="process-info-definition">
              <dt>Endpoint</dt>
              <dd>
                <a href="https://ipacb.ecosphere.fws.gov/location/api" target="_blank" rel="noreferrer">
                  https://ipacb.ecosphere.fws.gov/location/api
                </a>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </details>
  )

  return (
    <article className="app permit-start-page ipac-start-page">
      <div className="app__inner">
        <header className="permit-start-page__header">
          <p className="permit-start-page__eyebrow">FWS ESA consultation</p>
          <h1>Start this permit.</h1>
          <p>
            Submit the saved project footprint to IPaC beta and continue the endangered species
            consultation in the returned USFWS project link.
          </p>
        </header>
        <section className="permit-start-page__content">
          <section className="permit-start-page__panel">
            <h2>Submit project data to IPaC beta</h2>
            <p>
              This handoff is only available after the project has a saved line or polygon
              footprint. IPaC does not accept point-only geometries for this workflow.
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
                  <h3>IPaC beta status</h3>
                  <p className="permit-start-page__status">{ipacReadinessMessage}</p>
                  {submitState.status === "success" ? (
                    <p className="permit-start-page__submit-success" role="status">
                      {submitState.message}
                    </p>
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
                ) : null}
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
            </div>
            {submitState.status === "success" ? (
              <div className="ipac-start-page__continue">
                <h3>Continue in IPaC</h3>
                <p>
                  <a
                    href={submitState.startProjectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ipac-start-page__continue-link"
                  >
                    Open returned IPaC project link
                  </a>
                </p>
              </div>
            ) : null}
          </section>
          <section className="permit-start-page__panel">{placeholderContent}</section>
        </section>
      </div>
    </article>
  )
}
