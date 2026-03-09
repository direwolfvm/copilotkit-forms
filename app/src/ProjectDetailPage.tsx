import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell
} from "recharts"
import {
  ProjectPersistenceError,
  fetchProjectHierarchy,
  type ProjectHierarchy,
  type ProjectProcessSummary
} from "./utils/projectPersistence"
import { loadBasicPermitProcessesForProjects } from "./utils/permitflow"
import { loadComplexReviewProcessesForProjects } from "./utils/reviewworks"
import {
  StatusIndicator,
  parseTimestampMillis,
  compareByTimestampDesc,
  determineProjectStatus,
  determinePreScreeningStatus,
  determineBasicPermitStatus,
  determineComplexReviewStatus
} from "./utils/projectStatus"
import { ArcgisGeometryViewer } from "./components/ArcgisGeometryViewer"

function formatDate(value?: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function formatCurrency(value?: string | null): string {
  if (!value) return "—"
  const num = Number(value)
  if (Number.isNaN(num)) return value
  return num.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

function buildPointGeometry(lat?: number | null, lon?: number | null): string | null {
  if (typeof lat !== "number" || typeof lon !== "number") return null
  return JSON.stringify({
    type: "Point",
    coordinates: [lon, lat]
  })
}

type GanttDataPoint = {
  name: string
  range: [number, number]
  status: string
}

function buildGanttData(processes: ProjectProcessSummary[]): GanttDataPoint[] {
  const points: GanttDataPoint[] = []
  for (const process of processes) {
    const startMs = parseTimestampMillis(process.createdTimestamp)
    if (typeof startMs !== "number") continue

    let endMs: number | undefined
    for (const event of process.caseEvents) {
      const ms = parseTimestampMillis(event.lastUpdated)
      if (typeof ms === "number" && (endMs === undefined || ms > endMs)) {
        endMs = ms
      }
    }
    if (endMs === undefined) {
      endMs = parseTimestampMillis(process.lastUpdated) ?? startMs + 86400000
    }
    if (endMs <= startMs) {
      endMs = startMs + 86400000
    }

    const name = process.title ?? `Process ${process.id}`
    points.push({ name, range: [startMs, endMs], status: "active" })
  }
  points.sort((a, b) => a.range[0] - b.range[0])
  return points
}

function GanttChart({ processes }: { processes: ProjectProcessSummary[] }) {
  const data = useMemo(() => buildGanttData(processes), [processes])
  const now = Date.now()

  if (data.length === 0) {
    return <p className="project-detail__empty">No process timeline data available.</p>
  }

  const dateFormatter = (ms: number) => {
    const d = new Date(ms)
    return d.toLocaleDateString(undefined, { year: "2-digit", month: "short" })
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 50 + 60)}>
      <BarChart layout="vertical" data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={dateFormatter}
          fontSize={11}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={180}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value: any) => {
            if (Array.isArray(value) && value.length === 2) {
              return `${new Date(value[0]).toLocaleDateString()} – ${new Date(value[1]).toLocaleDateString()}`
            }
            return String(value)
          }}
          labelFormatter={(label) => label}
        />
        <ReferenceLine x={now} stroke="#b50909" strokeDasharray="6 6" label={{ value: "Today", fontSize: 11 }} />
        <Bar dataKey="range" radius={[4, 4, 4, 4]}>
          {data.map((_, index) => (
            <Cell key={index} fill="var(--accent, #0d9dda)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ProcessTable({ processes }: { processes: ProjectProcessSummary[] }) {
  if (processes.length === 0) {
    return <p className="project-detail__empty">No processes recorded for this project.</p>
  }

  return (
    <table className="project-detail__process-table">
      <thead>
        <tr>
          <th>Process</th>
          <th>Status</th>
          <th>Start</th>
          <th>Latest Activity</th>
        </tr>
      </thead>
      <tbody>
        {processes.map((process) => (
          <ProcessRow key={process.id} process={process} />
        ))}
      </tbody>
    </table>
  )
}

function ProcessRow({ process }: { process: ProjectProcessSummary }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasMilestones = process.caseEvents.length > 0
  const preScreeningStatus = determinePreScreeningStatus(process)
  const basicPermitStatus = determineBasicPermitStatus(process)
  const complexReviewStatus = determineComplexReviewStatus(process)
  const processStatus = preScreeningStatus ?? basicPermitStatus ?? complexReviewStatus

  const chronologicalEvents = useMemo(
    () => [...process.caseEvents].reverse(),
    [process.caseEvents]
  )

  return (
    <>
      <tr className="project-detail__process-row">
        <td>
          <div className="project-detail__process-name-cell">
            {hasMilestones ? (
              <button
                type="button"
                className="project-detail__process-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
              >
                <span className="project-detail__process-toggle-icon" aria-hidden="true">
                  {isExpanded ? "\u25BE" : "\u25B8"}
                </span>
              </button>
            ) : (
              <span className="project-detail__process-toggle-spacer" />
            )}
            <span>{process.title ?? `Process ${process.id}`}</span>
            {hasMilestones ? (
              <span className="project-detail__milestone-tag">
                {process.caseEvents.length} event{process.caseEvents.length !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </td>
        <td>
          {processStatus ? (
            <StatusIndicator variant={processStatus.variant} label={processStatus.label} />
          ) : (
            "—"
          )}
        </td>
        <td>{formatDate(process.createdTimestamp)}</td>
        <td>{formatDate(process.lastUpdated)}</td>
      </tr>
      {isExpanded && hasMilestones ? (
        <tr className="project-detail__events-row">
          <td colSpan={4}>
            <table className="project-detail__milestones-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {chronologicalEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.name || event.eventType || `Event ${event.id}`}</td>
                    <td>{event.eventType ?? "—"}</td>
                    <td>{event.status ?? "—"}</td>
                    <td>{formatDate(event.lastUpdated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  )
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [entry, setEntry] = useState<ProjectHierarchy | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading")
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!projectId) {
      setStatus("error")
      setError("No project ID provided.")
      return
    }

    const id = parseInt(projectId, 10)
    if (Number.isNaN(id)) {
      setStatus("error")
      setError("Invalid project ID.")
      return
    }

    let isMounted = true
    setStatus("loading")
    setError(undefined)

    fetchProjectHierarchy()
      .then(async (hierarchy) => {
        if (!isMounted) return
        const match = hierarchy.find((e) => e.project.id === id)
        if (!match) {
          setError("Project not found.")
          setStatus("error")
          return
        }

        const projectList = [match.project]
        const [permitflowProcesses, reviewworksProcesses] = await Promise.all([
          loadBasicPermitProcessesForProjects(projectList),
          loadComplexReviewProcessesForProjects(projectList)
        ])
        if (!isMounted) return

        const pf = permitflowProcesses.get(id) ?? []
        const rw = reviewworksProcesses.get(id) ?? []
        if (pf.length > 0 || rw.length > 0) {
          const combined = [...match.processes, ...pf, ...rw]
          combined.sort((a, b) => compareByTimestampDesc(a.lastUpdated, b.lastUpdated))
          setEntry({ ...match, processes: combined })
        } else {
          setEntry(match)
        }
        setStatus("idle")
      })
      .catch((err) => {
        if (!isMounted) return
        const message =
          err instanceof ProjectPersistenceError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unable to load project."
        setError(message)
        setStatus("error")
      })

    return () => {
      isMounted = false
    }
  }, [projectId])

  if (status === "loading") {
    return (
      <div className="project-detail">
        <div className="projects-page__status" aria-live="polite">Loading project…</div>
      </div>
    )
  }

  if (status === "error" || !entry) {
    return (
      <div className="project-detail">
        <div className="projects-page__status projects-page__status--error" role="alert">
          {error ?? "Unable to load project."}
        </div>
        <Link to="/dashboard/project-explorer" className="project-detail__back-link">
          Back to Project Explorer
        </Link>
      </div>
    )
  }

  const project = entry.project
  const projectTitle = project.title?.trim() || `Project ${project.id}`
  const projectStatus = determineProjectStatus(entry)
  const displayStatus = project.currentStatus ?? projectStatus.label
  const geometry = project.geometry ?? buildPointGeometry(project.locationLat, project.locationLon)

  return (
    <div className="project-detail">
      <Link to="/dashboard/project-explorer" className="project-detail__back-link">
        Back to Project Explorer
      </Link>

      <div className="project-detail__header-row">
        <div className="project-detail__header">
          <p className="hub-page__eyebrow">Project Detail</p>
          <h1>{projectTitle}</h1>
          {project.description ? <p className="project-detail__description">{project.description}</p> : null}

          <div className="project-detail__meta-grid">
            <div className="project-detail__meta-item">
              <span className="project-detail__meta-label">Status</span>
              <span className="project-detail__meta-value">
                <span className={`explorer-status-pill explorer-status-pill--${projectStatus.variant}`}>
                  {displayStatus}
                </span>
              </span>
            </div>
            {project.sector ? (
              <div className="project-detail__meta-item">
                <span className="project-detail__meta-label">Sector</span>
                <span className="project-detail__meta-value">{project.sector}</span>
              </div>
            ) : null}
            {project.type ? (
              <div className="project-detail__meta-item">
                <span className="project-detail__meta-label">Type</span>
                <span className="project-detail__meta-value">{project.type}</span>
              </div>
            ) : null}
            {project.leadAgency ? (
              <div className="project-detail__meta-item">
                <span className="project-detail__meta-label">Lead Agency</span>
                <span className="project-detail__meta-value">{project.leadAgency}</span>
              </div>
            ) : null}
            {project.sponsor ? (
              <div className="project-detail__meta-item">
                <span className="project-detail__meta-label">Sponsor</span>
                <span className="project-detail__meta-value">{project.sponsor}</span>
              </div>
            ) : null}
            {project.funding ? (
              <div className="project-detail__meta-item">
                <span className="project-detail__meta-label">Estimated Funding</span>
                <span className="project-detail__meta-value">{formatCurrency(project.funding)}</span>
              </div>
            ) : null}
            {project.locationText ? (
              <div className="project-detail__meta-item">
                <span className="project-detail__meta-label">Location</span>
                <span className="project-detail__meta-value">{project.locationText}</span>
              </div>
            ) : null}
            {project.lastUpdated ? (
              <div className="project-detail__meta-item">
                <span className="project-detail__meta-label">Last Updated</span>
                <span className="project-detail__meta-value">{formatDate(project.lastUpdated)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="project-detail__location-card">
          {geometry ? (
            <ArcgisGeometryViewer geometry={geometry} />
          ) : (
            <div className="project-detail__map-empty">No location data available.</div>
          )}
          {project.locationText ? (
            <p className="project-detail__location-text">{project.locationText}</p>
          ) : null}
        </div>
      </div>

      {entry.processes.length > 0 ? (
        <section className="project-detail__section">
          <h2>Timeline</h2>
          <div className="project-detail__gantt-wrapper">
            <GanttChart processes={entry.processes} />
          </div>
        </section>
      ) : null}

      <section className="project-detail__section">
        <h2>Processes</h2>
        <ProcessTable processes={entry.processes} />
      </section>
    </div>
  )
}
