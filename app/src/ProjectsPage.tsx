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
import { ProjectsOverviewMap } from "./components/ProjectsOverviewMap"

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

function ProcessTree({ process }: { process: ProjectProcessSummary }) {
  const formattedUpdated = useMemo(() => formatTimestamp(process.lastUpdated), [process.lastUpdated])
  const formattedCreated = useMemo(() => formatTimestamp(process.createdTimestamp), [process.createdTimestamp])

  return (
    <li className="projects-tree__process">
      <details>
        <summary>
          <span className="projects-tree__process-title">{process.title ?? `Process ${process.id}`}</span>
          <span className="projects-tree__summary-meta">
            {formattedUpdated ? `Updated ${formattedUpdated}` : formattedCreated ? `Created ${formattedCreated}` : null}
          </span>
        </summary>
        <div className="projects-tree__process-body">
          {process.description ? <p className="projects-tree__description">{process.description}</p> : null}
          {process.caseEvents.length > 0 ? (
            <ul className="projects-tree__events">
              {process.caseEvents.map((event) => (
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

function ProjectTreeItem({
  entry,
  onToggle
}: {
  entry: ProjectHierarchy
  onToggle?: (id: number, open: boolean) => void
}) {
  const formattedUpdated = formatTimestamp(entry.project.lastUpdated)
  const projectTitle = entry.project.title?.trim().length
    ? entry.project.title
    : `Project ${entry.project.id}`
  const [isOpen, setIsOpen] = useState(false)
  const handleToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const open = event.currentTarget.open
    setIsOpen(open)
    onToggle?.(entry.project.id, open)
  }, [entry.project.id, onToggle])
  const geometry = entry.project.geometry ?? undefined

  return (
    <li className="projects-tree__project">
      <details onToggle={handleToggle}>
        <summary>
          <div className="projects-tree__project-summary">
            <Link to={`/portal/${entry.project.id}`} className="projects-tree__project-link">
              {projectTitle}
            </Link>
            {formattedUpdated ? (
              <span className="projects-tree__summary-meta">Updated {formattedUpdated}</span>
            ) : null}
          </div>
        </summary>
        <div className="projects-tree__project-body">
          {isOpen && !geometry ? (
            <p className="projects-tree__map-empty projects-tree__empty">No project geometry provided.</p>
          ) : null}
          {entry.project.description ? (
            <p className="projects-tree__description">{entry.project.description}</p>
          ) : null}
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
  const [activeProjectId, setActiveProjectId] = useState<number | undefined>(undefined)

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

  const handleProjectToggle = useCallback((projectId: number, open: boolean) => {
    setActiveProjectId((current) => {
      if (open) {
        return projectId
      }
      return current === projectId ? undefined : current
    })
  }, [])

  return (
    <div className="projects-page usa-prose">
      <header className="projects-page__header">
        <h1>Projects</h1>
        <p>Browse saved projects and inspect their processes and case events.</p>
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
        <div className="projects-page__layout">
          <div className="projects-page__list" role="region" aria-label="Project list">
            <ul className="projects-tree">
              {projects.map((entry) => (
                <ProjectTreeItem key={entry.project.id} entry={entry} onToggle={handleProjectToggle} />
              ))}
            </ul>
          </div>
          <aside className="projects-page__map" aria-label="Projects map">
            <ProjectsOverviewMap projects={projects} activeProjectId={activeProjectId} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}
