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
import { loadBasicPermitProcessesForProjects } from "./utils/permitflow"
import { loadComplexReviewProcessesForProjects } from "./utils/reviewworks"
import { ArcgisSketchMap, type GeometryChange } from "./components/ArcgisSketchMap"
import {
  StatusIndicator,
  formatTimestamp,
  compareByTimestampDesc,
  determinePreScreeningStatus,
  determineBasicPermitStatus,
  determineComplexReviewStatus,
  determineProjectStatus,
  getLatestCaseEvent
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
  const basicPermitStatus = determineBasicPermitStatus(process)
  const complexReviewStatus = determineComplexReviewStatus(process)
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
            {basicPermitStatus ? (
              <StatusIndicator variant={basicPermitStatus.variant} label={basicPermitStatus.label} />
            ) : null}
            {complexReviewStatus ? (
              <StatusIndicator variant={complexReviewStatus.variant} label={complexReviewStatus.label} />
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

function ProjectTreeItem({ entry }: { entry: ProjectHierarchy }) {
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
  const permitChecklistStatus = useMemo(() => {
    const total = entry.permittingChecklist.length
    if (total === 0) {
      return { tone: "empty", label: "No checklist items" }
    }
    const completed = entry.permittingChecklist.filter((item) => item.completed).length
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
          {entry.processes.length > 0 ? (
            <ul className="projects-tree__processes">
              {entry.processes.map((process) => (
                <ProcessTree key={process.id} process={process} />
              ))}
            </ul>
          ) : (
            <p className="projects-tree__empty">No processes recorded for this project.</p>
          )}
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
                      item.completed ? " projects-tree__permit-checklist-item--complete" : ""
                    }`}
                  >
                    <span className="projects-tree__permit-checklist-marker" aria-hidden="true" />
                    <span className="projects-tree__permit-checklist-label">{item.label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="projects-tree__empty">No permitting checklist items recorded.</p>
            )}
          </div>
        </div>
      </details>
    </li>
  )
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectHierarchy[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading")
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let isMounted = true
    setStatus("loading")
    setError(undefined)
    fetchProjectHierarchy()
      .then(async (hierarchy) => {
        if (!isMounted) {
          return
        }
        const projectList = hierarchy.map((entry) => entry.project)
        const [permitflowProcessesByProject, reviewworksProcessesByProject] = await Promise.all([
          loadBasicPermitProcessesForProjects(projectList),
          loadComplexReviewProcessesForProjects(projectList)
        ])
        if (!isMounted) {
          return
        }
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
      })
      .catch((err) => {
        if (!isMounted) {
          return
        }
        const message = err instanceof ProjectPersistenceError ? err.message : err instanceof Error ? err.message : "Unable to load projects."
        setError(message)
        setStatus("error")
      })
    return () => {
      isMounted = false
    }
  }, [])
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
            <ProjectTreeItem key={entry.project.id} entry={entry} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
