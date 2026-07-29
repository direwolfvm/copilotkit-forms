import { useCallback, useEffect, useMemo, useState } from "react"
import type { SyntheticEvent } from "react"
import { Link } from "react-router-dom"
import {
  ProjectPersistenceError,
  fetchProjectHierarchy,
  type CaseEventSummary,
  type ProjectHierarchy,
  type ProjectProcessSummary
} from "./utils/projectPersistence"
import {
  authenticatePermitflowUser,
  deletePermitflowProject,
  loadRowAuthorizationProcessesForProjects
} from "./utils/permitflow"
import {
  authenticateReviewworksUser,
  deleteReviewworksProject,
  loadComplexReviewProcessesForProjects
} from "./utils/reviewworks"
import { deletePortalProject, loadSection106ShadowState } from "./utils/projectPersistence"
import { SECTION106_SYSTEM_LABEL, withdrawSection106Case } from "./utils/section106"
import { ArcgisSketchMap, type GeometryChange } from "./components/ArcgisSketchMap"
import {
  StatusIndicator,
  formatTimestamp,
  compareByTimestampDesc,
  determinePreScreeningStatus,
  determineRowAuthorizationStatus,
  determineComplexReviewStatus,
  determineIpacStatus,
  determineProjectStatus,
  determineSection106Status,
  getLatestCaseEvent,
  isRowAuthorizationProcess,
  isComplexReviewProcess,
  isIpacChecklistItem,
  isIpacShadowProcess,
  isPreScreeningProcess,
  isSection106Process,
  isWorkflowBackedChecklistItem
} from "./utils/projectStatus"

function ProcessTree({ process }: { process: ProjectProcessSummary }) {
  const formattedUpdated = useMemo(() => formatTimestamp(process.lastUpdated), [process.lastUpdated])
  const formattedCreated = useMemo(() => formatTimestamp(process.createdTimestamp), [process.createdTimestamp])
  const chronologicalCaseEvents = useMemo(
    () => [...process.caseEvents].reverse(),
    [process.caseEvents]
  )
  const latestCaseEvent = process.caseEvents[0]
  const preScreeningStatus = determinePreScreeningStatus(process)
  const rowAuthorizationStatus = determineRowAuthorizationStatus(process)
  const complexReviewStatus = determineComplexReviewStatus(process)
  const section106Status = determineSection106Status(process)
  const ipacStatus = determineIpacStatus(process)
  const latestEventLabel = latestCaseEvent?.name || latestCaseEvent?.eventType

  return (
    <li className="projects-tree__process">
      <details>
        <summary>
          <div className="projects-tree__process-title">
            <span className="projects-tree__toggle-icon" aria-hidden="true">
              <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
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
            <span className="projects-tree__process-name">{process.title ?? `Process ${process.id}`}</span>
            {preScreeningStatus ? (
              <StatusIndicator variant={preScreeningStatus.variant} label={preScreeningStatus.label} />
            ) : null}
            {rowAuthorizationStatus ? (
              <StatusIndicator variant={rowAuthorizationStatus.variant} label={rowAuthorizationStatus.label} />
            ) : null}
            {complexReviewStatus ? (
              <StatusIndicator variant={complexReviewStatus.variant} label={complexReviewStatus.label} />
            ) : null}
            {section106Status ? (
              <StatusIndicator variant={section106Status.variant} label={section106Status.label} />
            ) : null}
            {ipacStatus ? (
              <StatusIndicator variant={ipacStatus.variant} label={ipacStatus.label} />
            ) : null}
            {latestEventLabel ? (
              <span className="projects-tree__latest-event">
                <span className="projects-tree__latest-event-label">Latest event:</span>
                <span className="projects-tree__latest-event-value">{latestEventLabel}</span>
              </span>
            ) : null}
          </div>
          <span className="projects-tree__summary-meta">
            {formattedUpdated ? `Updated ${formattedUpdated}` : formattedCreated ? `Created ${formattedCreated}` : null}
          </span>
        </summary>
        <div className="projects-tree__process-body">
          {process.description ? <p className="projects-tree__description">{process.description}</p> : null}
          {process.caseEvents.length > 0 ? (
            <ul className="projects-tree__events">
              {chronologicalCaseEvents.map((event) => (
                <CaseEventTree key={event.id} event={event} />
              ))}
            </ul>
          ) : (
            <p className="projects-tree__empty">No case events recorded.</p>
          )}
        </div>
      </details>
    </li>
  )
}

function CaseEventTree({ event }: { event: CaseEventSummary }) {
  const formattedUpdated = useMemo(() => formatTimestamp(event.lastUpdated), [event.lastUpdated])
  const eventLabel = event.name || event.eventType || `Event ${event.id}`
  const eventData = useMemo(
    () =>
      event.data && typeof event.data === "object" && !Array.isArray(event.data)
        ? (event.data as Record<string, unknown>)
        : undefined,
    [event.data]
  )
  const eventDescription =
    event.description ??
    (typeof eventData?.description === "string" ? eventData.description : undefined)
  const eventSource = typeof eventData?.source === "string" ? eventData.source : undefined
  const eventOutcome = typeof eventData?.outcome === "string" ? eventData.outcome : undefined

  return (
    <li className="projects-tree__event">
      <div className="projects-tree__event-row">
        <span className="projects-tree__event-title">{eventLabel}</span>
        {formattedUpdated ? <span className="projects-tree__event-date">{formattedUpdated}</span> : null}
      </div>
      {eventDescription ? <p className="projects-tree__event-description">{eventDescription}</p> : null}
      <div className="projects-tree__event-meta">
        {event.eventType ? <span className="projects-tree__event-chip">Type: {event.eventType}</span> : null}
        {event.status ? <span className="projects-tree__event-chip">Status: {event.status}</span> : null}
        {eventSource ? <span className="projects-tree__event-chip">Source: {eventSource}</span> : null}
        {eventOutcome ? <span className="projects-tree__event-chip">Outcome: {eventOutcome}</span> : null}
      </div>
    </li>
  )
}

function WorkflowChecklistProcess({
  itemLabel,
  process
}: {
  itemLabel: string
  process?: ProjectProcessSummary
}) {
  if (!process) {
    return (
      <div className="projects-tree__permit-checklist-process-empty">
        No workflow has been started yet for {itemLabel}.
      </div>
    )
  }

  return (
    <ul className="projects-tree__processes projects-tree__processes--nested">
      <ProcessTree process={process} />
    </ul>
  )
}

function ProjectTreeItem({
  entry,
  onRequestDelete
}: {
  entry: ProjectHierarchy
  onRequestDelete: (entry: ProjectHierarchy) => void
}) {
  const formattedUpdated = formatTimestamp(entry.project.lastUpdated)
  const projectTitle = entry.project.title?.trim().length
    ? entry.project.title
    : `Project ${entry.project.id}`
  const [isOpen, setIsOpen] = useState(false)
  const handleToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    setIsOpen(event.currentTarget.open)
  }, [])
  const geometry = entry.project.geometry ?? undefined
  const latestEvent = getLatestCaseEvent(entry)
  const projectStatus = useMemo(() => determineProjectStatus(entry), [entry])
  const preScreeningProcesses = useMemo(
    () => entry.processes.filter((process) => isPreScreeningProcess(process)),
    [entry.processes]
  )
  const rowAuthorizationProcess = useMemo(
    () => entry.processes.find((process) => isRowAuthorizationProcess(process)),
    [entry.processes]
  )
  const complexReviewProcess = useMemo(
    () => entry.processes.find((process) => isComplexReviewProcess(process)),
    [entry.processes]
  )
  const section106Process = useMemo(
    () => entry.processes.find((process) => isSection106Process(process)),
    [entry.processes]
  )
  const ipacProcess = useMemo(
    () => entry.processes.find((process) => isIpacShadowProcess(process)),
    [entry.processes]
  )
  const additionalProcesses = useMemo(
    () =>
      entry.processes.filter(
        (process) =>
          !isPreScreeningProcess(process) &&
          !isRowAuthorizationProcess(process) &&
          !isComplexReviewProcess(process) &&
          !isSection106Process(process) &&
          !isIpacShadowProcess(process)
      ),
    [entry.processes]
  )
  const permitChecklistStatus = useMemo(() => {
    const manualItems = entry.permittingChecklist.filter((item) => !isWorkflowBackedChecklistItem(item))
    const total = manualItems.length
    if (total === 0) {
      return { tone: "empty", label: "No checklist items" }
    }
    const completed = manualItems.filter((item) => item.completed).length
    if (completed === total) {
      return { tone: "complete", label: "Checklist complete" }
    }
    return { tone: "pending", label: `${completed} of ${total} complete` }
  }, [entry.permittingChecklist])

  const handleGeometryChange = useCallback((_change: GeometryChange) => {
    // For read-only viewing, we don't need to handle changes
    // This component is just for viewing existing project geometry
  }, [])

  const geometryToRender = isOpen ? geometry : undefined

  const getWorkflowProcessForItem = useCallback(
    (label: string) => {
      const normalized = label.toLowerCase().trim()
      if (
        normalized === "right of way authorization" ||
        normalized === "right of way authorization (sf-299)" ||
        normalized === "basic permit"
      ) {
        return rowAuthorizationProcess
      }
      if (normalized === "complex review") {
        return complexReviewProcess
      }
      if (normalized.includes("section 106")) {
        return section106Process
      }
      if (isIpacChecklistItem({ label })) {
        return ipacProcess
      }
      return undefined
    },
    [rowAuthorizationProcess, complexReviewProcess, section106Process, ipacProcess]
  )

  return (
    <li className="projects-tree__project">
      <details onToggle={handleToggle}>
        <summary>
          <div className="projects-tree__project-summary">
            <span className="projects-tree__toggle-icon" aria-hidden="true">
              <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
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
            <Link to={`/portal/${entry.project.id}`} className="projects-tree__project-link">
              {projectTitle}
            </Link>
            <StatusIndicator variant={projectStatus.variant} label={projectStatus.label} />
            {latestEvent?.name || latestEvent?.eventType ? (
              <span className="projects-tree__latest-event">
                <span className="projects-tree__latest-event-label">Latest event:</span>
                <span className="projects-tree__latest-event-value">{latestEvent.name || latestEvent.eventType}</span>
              </span>
            ) : null}
            {formattedUpdated ? (
              <span className="projects-tree__summary-meta">Updated {formattedUpdated}</span>
            ) : null}
          </div>
        </summary>
        <div className="projects-tree__project-body">
          <div className="projects-tree__project-actions">
            <button
              type="button"
              className="usa-button usa-button--outline projects-tree__delete-button"
              onClick={() => onRequestDelete(entry)}
            >
              Delete project…
            </button>
          </div>
          <div className="projects-tree__overview">
            {entry.project.description ? (
              <div className="projects-tree__description-section">
                <p className="projects-tree__description">{entry.project.description}</p>
              </div>
            ) : null}
            <div className="projects-tree__map-section">
              <div className="projects-tree__map-wrapper">
                <div
                  className={`projects-tree__map ${isOpen ? "projects-tree__map--visible" : "projects-tree__map--preload"}`}
                  aria-hidden={!isOpen}
                >
                  <ArcgisSketchMap
                    key={`project-map-${entry.project.id}`}
                    geometry={geometryToRender}
                    isVisible={isOpen}
                    hideSketchWidget
                    onGeometryChange={handleGeometryChange}
                  />
                </div>
              </div>
              {isOpen && !geometry ? (
                <p className="projects-tree__map-empty projects-tree__empty">No project geometry provided.</p>
              ) : null}
            </div>
          </div>
          <section className="projects-tree__section">
            <div className="projects-tree__section-header">
              <span className="projects-tree__section-title">Pre-screening process</span>
            </div>
            {preScreeningProcesses.length > 0 ? (
              <ul className="projects-tree__processes">
                {preScreeningProcesses.map((process) => (
                  <ProcessTree key={process.id} process={process} />
                ))}
              </ul>
            ) : (
              <p className="projects-tree__empty">No pre-screening process recorded for this project.</p>
            )}
          </section>
          <div className="projects-tree__permit-checklist">
            <div className="projects-tree__permit-checklist-header">
              <span className="projects-tree__permit-checklist-title">Permitting checklist</span>
              <span
                className={`projects-tree__permit-checklist-status projects-tree__permit-checklist-status--${permitChecklistStatus.tone}`}
              >
                {permitChecklistStatus.label}
              </span>
            </div>
            {entry.permittingChecklist.length > 0 ? (
              <ul className="projects-tree__permit-checklist-list">
                {entry.permittingChecklist.map((item, index) => (
                  <li
                    key={`${item.label}-${index}`}
                    className={`projects-tree__permit-checklist-item${
                      !isWorkflowBackedChecklistItem(item) && item.completed
                        ? " projects-tree__permit-checklist-item--complete"
                        : ""
                    }`}
                  >
                    <div className="projects-tree__permit-checklist-item-row">
                      <span className="projects-tree__permit-checklist-marker" aria-hidden="true" />
                      <span className="projects-tree__permit-checklist-label">{item.label}</span>
                      {!isWorkflowBackedChecklistItem(item) ? (
                        <span
                          className={`projects-tree__permit-checklist-item-status projects-tree__permit-checklist-item-status--${
                            item.completed ? "complete" : "pending"
                          }`}
                        >
                          {item.completed ? "Complete" : "Not complete"}
                        </span>
                      ) : null}
                    </div>
                    {isWorkflowBackedChecklistItem(item) ? (
                      <WorkflowChecklistProcess
                        itemLabel={item.label}
                        process={getWorkflowProcessForItem(item.label)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="projects-tree__empty">No permitting checklist items recorded.</p>
            )}
          </div>
          {additionalProcesses.length > 0 ? (
            <section className="projects-tree__section">
              <div className="projects-tree__section-header">
                <span className="projects-tree__section-title">Additional processes</span>
              </div>
              <ul className="projects-tree__processes">
                {additionalProcesses.map((process) => (
                  <ProcessTree key={process.id} process={process} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </details>
    </li>
  )
}

type DeletionStepStatus = "pending" | "running" | "done" | "skipped" | "error"

type DeletionStep = {
  key: string
  label: string
  status: DeletionStepStatus
  message?: string
}

function DeleteProjectModal({
  entry,
  onDismiss,
  onDeleted
}: {
  entry: ProjectHierarchy
  onDismiss: () => void
  onDeleted: () => void
}) {
  const hasRowAuthorization = entry.processes.some((process) => isRowAuthorizationProcess(process))
  const hasComplexReview = entry.processes.some((process) => isComplexReviewProcess(process))
  const hasSection106 = entry.processes.some((process) => isSection106Process(process))

  const [deleteRowAuthorization, setDeleteRowAuthorization] = useState(hasRowAuthorization)
  const [deleteComplexReview, setDeleteComplexReview] = useState(hasComplexReview)
  const [withdrawSection106, setWithdrawSection106] = useState(hasSection106)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [steps, setSteps] = useState<DeletionStep[]>([])
  const [phase, setPhase] = useState<"confirm" | "running" | "done" | "failed">("confirm")

  const needsCredentials = deleteRowAuthorization || deleteComplexReview
  const projectTitle = entry.project.title?.trim() || `Project ${entry.project.id}`

  const updateStep = (key: string, status: DeletionStepStatus, message?: string) => {
    setSteps((previous) =>
      previous.map((step) => (step.key === key ? { ...step, status, message } : step))
    )
  }

  const handleDelete = async () => {
    if (needsCredentials && (!email.trim() || !password)) {
      setSteps([
        {
          key: "credentials",
          label: "Credentials",
          status: "error",
          message: "Enter the demo account email and password to delete external applications."
        }
      ])
      return
    }

    const plan: DeletionStep[] = [
      ...(withdrawSection106
        ? [{ key: "s106", label: `Withdraw Section 106 case (${SECTION106_SYSTEM_LABEL})`, status: "pending" as const }]
        : []),
      ...(deleteRowAuthorization
        ? [{ key: "permitfast", label: "Delete PermitFast SF-299 application", status: "pending" as const }]
        : []),
      ...(deleteComplexReview
        ? [{ key: "reviewworks", label: "Delete ReviewWorks Complex Review application", status: "pending" as const }]
        : []),
      { key: "portal", label: "Delete portal project data", status: "pending" as const }
    ]
    setSteps(plan)
    setPhase("running")
    let failed = false

    // External systems first — the Section 106 linkage lives in portal shadow records,
    // which the final portal deletion removes.
    if (withdrawSection106) {
      updateStep("s106", "running")
      try {
        const shadow = await loadSection106ShadowState(entry.project.id)
        if (shadow.linkage) {
          await withdrawSection106Case({
            processInstanceId: shadow.linkage.exchangeProcessInstanceId,
            reason: `The proponent deleted project "${projectTitle}" in HelpPermitMe and withdraws the Section 106 initiation.`
          })
          updateStep("s106", "done", "Case managers notified; the case remains on their side.")
        } else {
          updateStep("s106", "skipped", "No linked Section 106 case found.")
        }
      } catch (error) {
        failed = true
        updateStep("s106", "error", error instanceof Error ? error.message : "Withdrawal failed.")
      }
    }

    let permitflowToken: string | undefined
    let reviewworksToken: string | undefined
    if (!failed && deleteRowAuthorization) {
      updateStep("permitfast", "running")
      try {
        permitflowToken = (await authenticatePermitflowUser({ email: email.trim(), password })).accessToken
        const result = await deletePermitflowProject({
          portalProjectId: entry.project.id,
          accessToken: permitflowToken
        })
        updateStep(
          "permitfast",
          result.deleted ? "done" : "skipped",
          result.deleted ? undefined : "No linked PermitFast application found."
        )
      } catch (error) {
        failed = true
        updateStep("permitfast", "error", error instanceof Error ? error.message : "Deletion failed.")
      }
    }

    if (!failed && deleteComplexReview) {
      updateStep("reviewworks", "running")
      try {
        reviewworksToken = (await authenticateReviewworksUser({ email: email.trim(), password })).accessToken
        const result = await deleteReviewworksProject({
          portalProjectId: entry.project.id,
          accessToken: reviewworksToken
        })
        updateStep(
          "reviewworks",
          result.deleted ? "done" : "skipped",
          result.deleted ? undefined : "No linked ReviewWorks application found."
        )
      } catch (error) {
        failed = true
        updateStep("reviewworks", "error", error instanceof Error ? error.message : "Deletion failed.")
      }
    }

    if (!failed) {
      updateStep("portal", "running")
      try {
        await deletePortalProject(entry.project.id)
        updateStep("portal", "done")
      } catch (error) {
        failed = true
        updateStep("portal", "error", error instanceof Error ? error.message : "Deletion failed.")
      }
    } else {
      updateStep("portal", "skipped", "Skipped because an earlier step failed.")
    }

    setPhase(failed ? "failed" : "done")
  }

  return (
    <div className="process-info-modal__backdrop" role="presentation" onClick={phase === "running" ? undefined : onDismiss}>
      <div
        className="process-info-modal delete-project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="process-info-modal__header">
          <div>
            <p className="process-info-modal__eyebrow">Delete project</p>
            <h2 id="delete-project-modal-title">{projectTitle}</h2>
          </div>
          {phase !== "running" ? (
            <button
              type="button"
              className="process-info-modal__close"
              onClick={onDismiss}
              aria-label="Close delete project dialog"
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="process-info-modal__body">
          {phase === "confirm" ? (
            <>
              <p>
                This permanently deletes the project and its portal data (processes, case
                events, decision payloads, documents, and map data). This cannot be undone.
              </p>
              <fieldset className="delete-project-modal__options">
                <legend>Also remove linked permit applications</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={deleteRowAuthorization}
                    onChange={(event) => setDeleteRowAuthorization(event.target.checked)}
                  />
                  <span>
                    Delete the Right of Way Authorization (SF-299) application in PermitFast
                    {hasRowAuthorization ? "" : " (none detected)"}
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={deleteComplexReview}
                    onChange={(event) => setDeleteComplexReview(event.target.checked)}
                  />
                  <span>
                    Delete the Complex Review application in ReviewWorks
                    {hasComplexReview ? "" : " (none detected)"}
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={withdrawSection106}
                    onChange={(event) => setWithdrawSection106(event.target.checked)}
                  />
                  <span>
                    Withdraw the NHPA Section 106 case in the {SECTION106_SYSTEM_LABEL}
                    {hasSection106 ? "" : " (none detected)"} — their exchange API has no
                    delete, so the case is withdrawn by notification
                  </span>
                </label>
              </fieldset>
              {needsCredentials ? (
                <div className="delete-project-modal__credentials">
                  <p>
                    Deleting PermitFast or ReviewWorks applications requires the demo
                    account credentials for those systems.
                  </p>
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="username"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                    />
                  </label>
                </div>
              ) : null}
              {steps.length > 0 && steps[0]?.key === "credentials" ? (
                <p className="delete-project-modal__error" role="alert">
                  {steps[0].message}
                </p>
              ) : null}
              <div className="delete-project-modal__actions">
                <button type="button" className="usa-button usa-button--outline" onClick={onDismiss}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="usa-button delete-project-modal__confirm"
                  onClick={() => void handleDelete()}
                >
                  Delete project
                </button>
              </div>
            </>
          ) : (
            <>
              <ul className="delete-project-modal__steps">
                {steps.map((step) => (
                  <li key={step.key} className={`delete-project-modal__step delete-project-modal__step--${step.status}`}>
                    <span className="delete-project-modal__step-label">{step.label}</span>
                    <span className="delete-project-modal__step-status">
                      {step.status === "pending" && "Waiting"}
                      {step.status === "running" && "Working…"}
                      {step.status === "done" && "Done"}
                      {step.status === "skipped" && "Skipped"}
                      {step.status === "error" && "Failed"}
                    </span>
                    {step.message ? (
                      <span className="delete-project-modal__step-message">{step.message}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {phase === "done" ? (
                <p role="status">Project deleted.</p>
              ) : phase === "failed" ? (
                <p className="delete-project-modal__error" role="alert">
                  Deletion did not complete. Nothing further was removed — review the errors
                  above and try again.
                </p>
              ) : null}
              <div className="delete-project-modal__actions">
                {phase === "done" ? (
                  <button type="button" className="usa-button" onClick={onDeleted}>
                    Close
                  </button>
                ) : phase === "failed" ? (
                  <button type="button" className="usa-button usa-button--outline" onClick={onDismiss}>
                    Close
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectHierarchy[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading")
  const [error, setError] = useState<string | undefined>()
  const [pendingDeletion, setPendingDeletion] = useState<ProjectHierarchy | null>(null)

  const loadProjects = useCallback(async () => {
    setStatus("loading")
    setError(undefined)
    try {
      const hierarchy = await fetchProjectHierarchy()
      const projectList = hierarchy.map((entry) => entry.project)
      const [permitflowProcessesByProject, reviewworksProcessesByProject] = await Promise.all([
        loadRowAuthorizationProcessesForProjects(projectList),
        loadComplexReviewProcessesForProjects(projectList)
      ])
      const merged = hierarchy.map((entry) => {
        const permitflowProcesses = permitflowProcessesByProject.get(entry.project.id) ?? []
        const reviewworksProcesses = reviewworksProcessesByProject.get(entry.project.id) ?? []
        if (permitflowProcesses.length === 0 && reviewworksProcesses.length === 0) {
          return entry
        }
        const combinedProcesses = [...entry.processes, ...permitflowProcesses, ...reviewworksProcesses]
        combinedProcesses.sort((a, b) => compareByTimestampDesc(a.lastUpdated, b.lastUpdated))
        return {
          ...entry,
          processes: combinedProcesses
        }
      })
      setProjects(merged)
      setStatus("idle")
    } catch (err) {
      const message =
        err instanceof ProjectPersistenceError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load projects."
      setError(message)
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])
  const hasProjects = projects.length > 0

  return (
    <div className="projects-page usa-prose">
      <header className="projects-page__header">
        <h1>Projects</h1>
        <p>Browse saved projects and their pre-screening milestones.</p>
      </header>

      {status === "loading" ? (
        <div className="projects-page__status" aria-live="polite">
          Loading projects…
        </div>
      ) : null}

      {status === "error" ? (
        <div className="projects-page__status projects-page__status--error" role="alert">
          {error ?? "Unable to load projects."}
        </div>
      ) : null}

      {status === "idle" && !hasProjects ? (
        <p className="projects-page__empty">No projects found. Create a new one from the portal.</p>
      ) : null}

      {hasProjects ? (
        <ul className="projects-tree">
          {projects.map((entry) => (
            <ProjectTreeItem key={entry.project.id} entry={entry} onRequestDelete={setPendingDeletion} />
          ))}
        </ul>
      ) : null}

      {pendingDeletion ? (
        <DeleteProjectModal
          entry={pendingDeletion}
          onDismiss={() => setPendingDeletion(null)}
          onDeleted={() => {
            setPendingDeletion(null)
            void loadProjects()
          }}
        />
      ) : null}
    </div>
  )
}
