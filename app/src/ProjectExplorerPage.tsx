import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ProjectPersistenceError,
  fetchProjectHierarchy,
  type ProjectHierarchy
} from "./utils/projectPersistence"
import { loadBasicPermitProcessesForProjects } from "./utils/permitflow"
import { loadComplexReviewProcessesForProjects } from "./utils/reviewworks"
import {
  compareByTimestampDesc,
  determineProjectStatus
} from "./utils/projectStatus"
import { ExplorerMap } from "./components/ExplorerMap"

type SortKey =
  | "startYear:desc"
  | "startYear:asc"
  | "name:asc"
  | "name:desc"
  | "status:asc"
  | "sector:asc"
  | "type:asc"
  | "updated:desc"

function getProjectStartYear(entry: ProjectHierarchy): number | null {
  const startDate = entry.project.startDate
  if (startDate) {
    const d = new Date(startDate)
    if (!Number.isNaN(d.getTime())) return d.getUTCFullYear()
  }
  const createdAt = entry.project.createdAt
  if (createdAt) {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) return d.getUTCFullYear()
  }
  for (const process of entry.processes) {
    if (process.createdTimestamp) {
      const d = new Date(process.createdTimestamp)
      if (!Number.isNaN(d.getTime())) return d.getUTCFullYear()
    }
  }
  return null
}

function getProjectStatusLabel(entry: ProjectHierarchy): string {
  return entry.project.currentStatus ?? determineProjectStatus(entry).label
}

export default function ProjectExplorerPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectHierarchy[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading")
  const [error, setError] = useState<string | undefined>()

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sectorFilter, setSectorFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("updated:desc")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    let isMounted = true
    setStatus("loading")
    setError(undefined)
    fetchProjectHierarchy()
      .then(async (hierarchy) => {
        if (!isMounted) return
        const projectList = hierarchy.map((entry) => entry.project)
        const [permitflowProcessesByProject, reviewworksProcessesByProject] = await Promise.all([
          loadBasicPermitProcessesForProjects(projectList),
          loadComplexReviewProcessesForProjects(projectList)
        ])
        if (!isMounted) return
        const merged = hierarchy.map((entry) => {
          const permitflowProcesses = permitflowProcessesByProject.get(entry.project.id) ?? []
          const reviewworksProcesses = reviewworksProcessesByProject.get(entry.project.id) ?? []
          if (permitflowProcesses.length === 0 && reviewworksProcesses.length === 0) {
            return entry
          }
          const combinedProcesses = [...entry.processes, ...permitflowProcesses, ...reviewworksProcesses]
          combinedProcesses.sort((a, b) => compareByTimestampDesc(a.lastUpdated, b.lastUpdated))
          return { ...entry, processes: combinedProcesses }
        })
        setProjects(merged)
        setStatus("idle")
      })
      .catch((err) => {
        if (!isMounted) return
        const message =
          err instanceof ProjectPersistenceError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unable to load projects."
        setError(message)
        setStatus("error")
      })
    return () => {
      isMounted = false
    }
  }, [])

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const entry of projects) {
      const s = getProjectStatusLabel(entry)
      if (s) set.add(s)
    }
    return Array.from(set).sort()
  }, [projects])

  const uniqueSectors = useMemo(() => {
    const set = new Set<string>()
    for (const entry of projects) {
      if (entry.project.sector) set.add(entry.project.sector)
    }
    return Array.from(set).sort()
  }, [projects])

  const uniqueTypes = useMemo(() => {
    const set = new Set<string>()
    for (const entry of projects) {
      if (entry.project.type) set.add(entry.project.type)
    }
    return Array.from(set).sort()
  }, [projects])

  const filteredProjects = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    let result = projects

    if (term) {
      result = result.filter((entry) => {
        const haystack = [
          entry.project.title,
          entry.project.locationText,
          entry.project.sector,
          entry.project.type,
          entry.project.description
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(term)
      })
    }

    if (statusFilter) {
      result = result.filter((entry) => getProjectStatusLabel(entry) === statusFilter)
    }

    if (sectorFilter) {
      result = result.filter((entry) => entry.project.sector === sectorFilter)
    }

    if (typeFilter) {
      result = result.filter((entry) => entry.project.type === typeFilter)
    }

    const sorted = [...result]
    switch (sortKey) {
      case "startYear:desc":
        sorted.sort((a, b) => (getProjectStartYear(b) ?? 0) - (getProjectStartYear(a) ?? 0))
        break
      case "startYear:asc":
        sorted.sort((a, b) => (getProjectStartYear(a) ?? 9999) - (getProjectStartYear(b) ?? 9999))
        break
      case "name:asc":
        sorted.sort((a, b) => (a.project.title ?? "").localeCompare(b.project.title ?? ""))
        break
      case "name:desc":
        sorted.sort((a, b) => (b.project.title ?? "").localeCompare(a.project.title ?? ""))
        break
      case "status:asc":
        sorted.sort((a, b) => getProjectStatusLabel(a).localeCompare(getProjectStatusLabel(b)))
        break
      case "sector:asc":
        sorted.sort((a, b) => (a.project.sector ?? "").localeCompare(b.project.sector ?? ""))
        break
      case "type:asc":
        sorted.sort((a, b) => (a.project.type ?? "").localeCompare(b.project.type ?? ""))
        break
      case "updated:desc":
      default:
        sorted.sort((a, b) => compareByTimestampDesc(a.project.lastUpdated, b.project.lastUpdated))
        break
    }

    return sorted
  }, [projects, searchTerm, statusFilter, sectorFilter, typeFilter, sortKey])

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedProjects = useMemo(
    () => filteredProjects.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredProjects, safePage, pageSize]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, sectorFilter, typeFilter, sortKey, pageSize])

  const mapProjects = useMemo(
    () =>
      filteredProjects.map((entry) => ({
        id: entry.project.id,
        title: entry.project.title,
        locationLat: entry.project.locationLat,
        locationLon: entry.project.locationLon,
        currentStatus: getProjectStatusLabel(entry)
      })),
    [filteredProjects]
  )

  const handleProjectClick = useCallback(
    (projectId: number) => {
      navigate(`/dashboard/project-explorer/${projectId}`)
    },
    [navigate]
  )

  return (
    <div className="explorer-page">
      <header className="explorer-page__header">
        <p className="hub-page__eyebrow">Dashboard</p>
        <h1>Project Explorer</h1>
        <p>Browse the project portfolio on a map and in a searchable catalog.</p>
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

      {status === "idle" ? (
        <div className="explorer-layout">
          <div className="explorer-layout__map">
            <ExplorerMap projects={mapProjects} onProjectClick={handleProjectClick} />
          </div>

          <div className="explorer-layout__catalog">
            <div className="explorer-filter-bar">
              <div className="explorer-filter-group explorer-filter-group--wide">
                <label className="explorer-filter-label" htmlFor="explorer-search">
                  Search
                </label>
                <input
                  id="explorer-search"
                  type="text"
                  className="explorer-filter-input"
                  placeholder="Search by name or location…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="explorer-filter-group">
                <label className="explorer-filter-label" htmlFor="explorer-status">
                  Status
                </label>
                <select
                  id="explorer-status"
                  className="explorer-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  {uniqueStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="explorer-filter-group">
                <label className="explorer-filter-label" htmlFor="explorer-sector">
                  Sector
                </label>
                <select
                  id="explorer-sector"
                  className="explorer-filter-select"
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                >
                  <option value="">All sectors</option>
                  {uniqueSectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="explorer-filter-group">
                <label className="explorer-filter-label" htmlFor="explorer-type">
                  Type
                </label>
                <select
                  id="explorer-type"
                  className="explorer-filter-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="">All types</option>
                  {uniqueTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="explorer-filter-group">
                <label className="explorer-filter-label" htmlFor="explorer-sort">
                  Sort
                </label>
                <select
                  id="explorer-sort"
                  className="explorer-filter-select"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                >
                  <option value="updated:desc">Last updated</option>
                  <option value="startYear:desc">Start year (newest)</option>
                  <option value="startYear:asc">Start year (oldest)</option>
                  <option value="name:asc">Name (A–Z)</option>
                  <option value="name:desc">Name (Z–A)</option>
                  <option value="status:asc">Status</option>
                  <option value="sector:asc">Sector</option>
                  <option value="type:asc">Type</option>
                </select>
              </div>
            </div>

            <div className="explorer-table-wrapper">
              <table className="explorer-table">
                <thead>
                  <tr>
                    <th className="explorer-table__col--project">Project</th>
                    <th className="explorer-table__col--year">Start Year</th>
                    <th className="explorer-table__col--status">Status</th>
                    <th className="explorer-table__col--sector">Sector</th>
                    <th className="explorer-table__col--type">Type</th>
                    <th className="explorer-table__col--location">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProjects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="explorer-table__empty">
                        No projects match the current filters.
                      </td>
                    </tr>
                  ) : null}
                  {paginatedProjects.map((entry) => {
                    const projectStatus = determineProjectStatus(entry)
                    const startYear = getProjectStartYear(entry)
                    const displayStatus = entry.project.currentStatus ?? projectStatus.label
                    return (
                      <tr key={entry.project.id}>
                        <td className="explorer-table__col--project">
                          <Link
                            to={`/dashboard/project-explorer/${entry.project.id}`}
                            className="explorer-table__project-link"
                          >
                            {entry.project.title?.trim() || `Project ${entry.project.id}`}
                          </Link>
                        </td>
                        <td className="explorer-table__col--year">{startYear ?? "—"}</td>
                        <td className="explorer-table__col--status">
                          <span className={`explorer-status-pill explorer-status-pill--${projectStatus.variant}`}>
                            {displayStatus}
                          </span>
                        </td>
                        <td className="explorer-table__col--sector">{entry.project.sector ?? "—"}</td>
                        <td className="explorer-table__col--type">{entry.project.type ?? "—"}</td>
                        <td className="explorer-table__col--location">{entry.project.locationText ?? "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="explorer-pagination">
              <div className="explorer-pagination__size">
                <label htmlFor="explorer-page-size">Rows per page:</label>
                <select
                  id="explorer-page-size"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div className="explorer-pagination__controls">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="explorer-pagination__status">
                  Page {safePage} of {totalPages} &middot; {filteredProjects.length} projects
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
