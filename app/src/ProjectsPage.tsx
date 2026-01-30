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

const PRE_SCREENING_COMPLETE_EVENT = "Pre-screening complete"
const PRE_SCREENING_INITIATED_EVENT = "Pre-screening initiated"
const PRE_SCREENING_ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const BASIC_PERMIT_LABEL = "Basic Permit"
const BASIC_PERMIT_APPROVED_EVENT = "project_approved"
const COMPLEX_REVIEW_LABEL = "Complex Review"
const COMPLEX_REVIEW_APPROVED_EVENT = "project_approved"

type PreScreeningStatus = "complete" | "pending" | "caution"
type ProcessStatusVariant = "complete" | "pending" | "caution"

type StatusIndicatorProps = {
  variant: ProcessStatusVariant
  label: string
}

function StatusIndicator({ variant, label }: StatusIndicatorProps) {
  return (
    <span className={`status-indicator status-indicator--${variant}`}>
      <span className="status-indicator__icon" aria-hidden="true">
        {variant === "complete" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" />
            <polyline points="7 12.5 10.5 16 17 9" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        {variant === "pending" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" />
            <path d="M12 7v5l3 3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        {variant === "caution" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 5 19 17H5z" fill="none" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 10v3.5" fill="none" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="1.2" stroke="none" />
          </svg>
        ) : null}
      </span>
      <span className="status-indicator__text">{label}</span>
    </span>
  )
}

function formatTimestamp(value?: string | null): string | undefined {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value ?? undefined
  }
  return date.toLocaleString()
}

function parseTimestampMillis(value?: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return undefined
  }
  return timestamp
}

function compareByTimestampDesc(a?: string | null, b?: string | null): number {
  const aTime = parseTimestampMillis(a ?? undefined)
  const bTime = parseTimestampMillis(b ?? undefined)
  if (typeof aTime === "number" && typeof bTime === "number") {
    return bTime - aTime
  }
  if (typeof aTime === "number") {
    return -1
  }
  if (typeof bTime === "number") {
    return 1
  }
  if (a && b) {
    return b.localeCompare(a)
  }
  if (a) {
    return -1
  }
  if (b) {
    return 1
  }
  return 0
}

function isPreScreeningProcess(process: ProjectProcessSummary): boolean {
  const haystack = `${process.title ?? ""} ${process.description ?? ""}`.toLowerCase()
  return haystack.includes("pre-screening")
}

function determinePreScreeningStatus(
  process: ProjectProcessSummary
): { variant: PreScreeningStatus; label: string } | undefined {
  if (!isPreScreeningProcess(process)) {
    return undefined
  }

  if (process.caseEvents.some((event) => event.eventType === PRE_SCREENING_COMPLETE_EVENT)) {
    return { variant: "complete", label: PRE_SCREENING_COMPLETE_EVENT }
  }

  const hasInitiated = process.caseEvents.some((event) => event.eventType === PRE_SCREENING_INITIATED_EVENT)
  const latestEvent = process.caseEvents[0]

  if (!hasInitiated && !latestEvent) {
    return undefined
  }

  if (latestEvent) {
    const latestTimestamp = parseTimestampMillis(latestEvent.lastUpdated)
    if (latestTimestamp && Date.now() - latestTimestamp > PRE_SCREENING_ONE_WEEK_MS) {
      return { variant: "caution", label: "Pre-screening pending for over 7 days" }
    }
  }

  if (hasInitiated || latestEvent) {
    return { variant: "pending", label: "Pre-screening in progress" }
  }

  return undefined
}

function isBasicPermitProcess(process: ProjectProcessSummary): boolean {
  const haystack = `${process.title ?? ""} ${process.description ?? ""}`.toLowerCase()
  return haystack.includes("basic permit")
}

function determineBasicPermitStatus(
  process: ProjectProcessSummary
): { variant: ProcessStatusVariant; label: string } | undefined {
  if (!isBasicPermitProcess(process)) {
    return undefined
  }

  const hasApproval = process.caseEvents.some(
    (event) => event.eventType?.toLowerCase() === BASIC_PERMIT_APPROVED_EVENT
  )
  if (hasApproval) {
    return { variant: "complete", label: `${BASIC_PERMIT_LABEL} complete` }
  }

  const latestEvent = process.caseEvents[0]
  if (!latestEvent) {
    return undefined
  }

  const eventStatus = latestEvent.status?.toLowerCase()

  if (eventStatus === "late" || eventStatus === "overdue" || eventStatus === "delayed") {
    return { variant: "caution", label: `${BASIC_PERMIT_LABEL} delayed` }
  }

  const latestTimestamp = parseTimestampMillis(latestEvent.lastUpdated)
  if (latestTimestamp && Date.now() - latestTimestamp > PRE_SCREENING_ONE_WEEK_MS) {
    return { variant: "caution", label: `${BASIC_PERMIT_LABEL} pending for over 7 days` }
  }

  return { variant: "pending", label: `${BASIC_PERMIT_LABEL} in progress` }
}

function isComplexReviewProcess(process: ProjectProcessSummary): boolean {
  const haystack = `${process.title ?? ""} ${process.description ?? ""}`.toLowerCase()
  return haystack.includes("complex review")
}

function determineComplexReviewStatus(
  process: ProjectProcessSummary
): { variant: ProcessStatusVariant; label: string } | undefined {
  if (!isComplexReviewProcess(process)) {
    return undefined
  }

  const hasApproval = process.caseEvents.some(
    (event) => event.eventType?.toLowerCase() === COMPLEX_REVIEW_APPROVED_EVENT
  )
  if (hasApproval) {
    return { variant: "complete", label: `${COMPLEX_REVIEW_LABEL} complete` }
  }

  const latestEvent = process.caseEvents[0]
  if (!latestEvent) {
    return undefined
  }

  const eventStatus = latestEvent.status?.toLowerCase()

  if (eventStatus === "late" || eventStatus === "overdue" || eventStatus === "delayed") {
    return { variant: "caution", label: `${COMPLEX_REVIEW_LABEL} delayed` }
  }

  const latestTimestamp = parseTimestampMillis(latestEvent.lastUpdated)
  if (latestTimestamp && Date.now() - latestTimestamp > PRE_SCREENING_ONE_WEEK_MS) {
    return { variant: "caution", label: `${COMPLEX_REVIEW_LABEL} pending for over 7 days` }
  }

  return { variant: "pending", label: `${COMPLEX_REVIEW_LABEL} in progress` }
}

function isProcessComplete(process: ProjectProcessSummary): boolean {
  if (isPreScreeningProcess(process)) {
    return process.caseEvents.some((event) => event.eventType === PRE_SCREENING_COMPLETE_EVENT)
  }

  if (isBasicPermitProcess(process)) {
    return process.caseEvents.some(
      (event) => event.eventType?.toLowerCase() === BASIC_PERMIT_APPROVED_EVENT
    )
  }

  if (isComplexReviewProcess(process)) {
    return process.caseEvents.some(
      (event) => event.eventType?.toLowerCase() === COMPLEX_REVIEW_APPROVED_EVENT
    )
  }

  return process.caseEvents.some((event) => {
    const eventType = event.eventType?.toLowerCase()
    if (event.status?.toLowerCase() === "complete") {
      return true
    }
    return typeof eventType === "string" && eventType.includes("complete")
  })
}

function isProcessDelayed(process: ProjectProcessSummary): boolean {
  if (determinePreScreeningStatus(process)?.variant === "caution") {
    return true
  }

  if (determineBasicPermitStatus(process)?.variant === "caution") {
    return true
  }

  if (determineComplexReviewStatus(process)?.variant === "caution") {
    return true
  }

  return process.caseEvents.some((event) => {
    const status = event.status?.toLowerCase()
    return status === "late" || status === "overdue" || status === "delayed"
  })
}

function isPermitChecklistComplete(entry: ProjectHierarchy): boolean {
  return entry.permittingChecklist.length > 0 && entry.permittingChecklist.every((item) => item.completed)
}

function determineProjectStatus(entry: ProjectHierarchy): { variant: ProcessStatusVariant; label: string } {
  const hasProcesses = entry.processes.length > 0
  const allProcessesComplete = hasProcesses && entry.processes.every(isProcessComplete)
  const checklistComplete = isPermitChecklistComplete(entry)

  if (allProcessesComplete && checklistComplete) {
    return { variant: "complete", label: "Project complete" }
  }

  if (!hasProcesses) {
    return { variant: "pending", label: "Project not started" }
  }

  if (entry.processes.some(isProcessDelayed)) {
    return { variant: "caution", label: "Project needs attention" }
  }

  return { variant: "pending", label: "Project in progress" }
}

function getLatestCaseEvent(entry: ProjectHierarchy): CaseEventSummary | undefined {
  let latest: CaseEventSummary | undefined
  let latestTimestamp = -Infinity

  for (const process of entry.processes) {
    for (const event of process.caseEvents) {
      const timestamp = parseTimestampMillis(event.lastUpdated)
      if (typeof timestamp === "number") {
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp
          latest = event
        }
      } else if (!latest) {
        latest = event
      }
    }
  }

  return latest
}

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

  return (
    <li className="projects-tree__event">
      <div className="projects-tree__event-row">
        <span className="projects-tree__event-title">{eventLabel}</span>
        {formattedUpdated ? <span className="projects-tree__event-date">{formattedUpdated}</span> : null}
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
