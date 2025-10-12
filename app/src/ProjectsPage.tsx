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
import { ArcgisSketchMap, type GeometryChange } from "./components/ArcgisSketchMap"

const PRE_SCREENING_COMPLETE_EVENT = "Pre-screening complete"
const PRE_SCREENING_INITIATED_EVENT = "Pre-screening initiated"
const PRE_SCREENING_ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

type PreScreeningStatus = "complete" | "pending" | "caution"

type StatusIndicatorProps = {
  variant: PreScreeningStatus
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

function renderEventData(data: unknown): string {
  if (typeof data === "string") {
    return data
  }
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
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

function isPreScreeningProcess(process: ProjectProcessSummary): boolean {
  const haystack = `${process.title ?? ""} ${process.description ?? ""}`.toLowerCase()
  return haystack.includes("pre-screening")
}

function findPreScreeningProcess(processes: ProjectProcessSummary[]): ProjectProcessSummary | undefined {
  return processes.find((process) => isPreScreeningProcess(process))
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

  return (
    <li className="projects-tree__process">
      <details>
        <summary>
          <div className="projects-tree__process-title">
            <span className="projects-tree__process-name">{process.title ?? `Process ${process.id}`}</span>
            {preScreeningStatus ? (
              <StatusIndicator variant={preScreeningStatus.variant} label={preScreeningStatus.label} />
            ) : null}
            {latestCaseEvent?.eventType ? (
              <span className="projects-tree__latest-event">
                <span className="projects-tree__latest-event-label">Latest event:</span>
                <span className="projects-tree__latest-event-value">{latestCaseEvent.eventType}</span>
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

  return (
    <li className="projects-tree__event">
      <details>
        <summary>
          <span className="projects-tree__event-title">{event.eventType ?? `Event ${event.id}`}</span>
          {formattedUpdated ? (
            <span className="projects-tree__summary-meta">Updated {formattedUpdated}</span>
          ) : null}
        </summary>
        <div className="projects-tree__event-body">
          {event.data ? (
            <pre className="projects-tree__event-data">{renderEventData(event.data)}</pre>
          ) : (
            <p className="projects-tree__empty">No event payload.</p>
          )}
        </div>
      </details>
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
  const preScreeningProcess = findPreScreeningProcess(entry.processes)
  const preScreeningStatus = preScreeningProcess ? determinePreScreeningStatus(preScreeningProcess) : undefined

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
            <Link to={`/portal/${entry.project.id}`} className="projects-tree__project-link">
              {projectTitle}
            </Link>
            {preScreeningStatus ? (
              <StatusIndicator variant={preScreeningStatus.variant} label={preScreeningStatus.label} />
            ) : null}
            {latestEvent?.eventType ? (
              <span className="projects-tree__latest-event">
                <span className="projects-tree__latest-event-label">Latest event:</span>
                <span className="projects-tree__latest-event-value">{latestEvent.eventType}</span>
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
      .then((hierarchy) => {
        if (!isMounted) {
          return
        }
        setProjects(hierarchy)
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
