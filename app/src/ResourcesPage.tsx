import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import "./App.css"
import { permitInventory, getPermitInfoUrl, INTEGRATION_STATUS_LABELS } from "./utils/permitInventory"
import type { PermitInfo, IntegrationStatus } from "./utils/permitInventory"

const INTEGRATION_STATUS_OPTIONS: IntegrationStatus[] = ["integrated", "modern-app", "manual"]

function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <span className={`integration-badge integration-badge--${status}`}>
      <span className="integration-badge__dot" aria-hidden="true" />
      <span className="integration-badge__label">{INTEGRATION_STATUS_LABELS[status]}</span>
    </span>
  )
}

// Group permits by agency
function groupByAgency(permits: PermitInfo[]): Map<string, PermitInfo[]> {
  const grouped = new Map<string, PermitInfo[]>()
  for (const permit of permits) {
    const agency = permit.responsibleAgency
    if (!grouped.has(agency)) {
      grouped.set(agency, [])
    }
    grouped.get(agency)!.push(permit)
  }
  return grouped
}

export default function ResourcesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAgency, setSelectedAgency] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")

  // Get unique agencies for filter dropdown
  const agencies = useMemo(() => {
    const agencySet = new Set(permitInventory.map(p => p.responsibleAgency))
    return Array.from(agencySet).sort()
  }, [])

  // Filter permits based on search, agency filter, and status filter
  const filteredPermits = useMemo(() => {
    return permitInventory.filter(permit => {
      const matchesSearch = searchQuery === "" ||
        permit.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        permit.responsibleAgency.toLowerCase().includes(searchQuery.toLowerCase()) ||
        permit.description.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesAgency = selectedAgency === "all" || permit.responsibleAgency === selectedAgency

      const matchesStatus = selectedStatus === "all" || permit.integrationStatus === selectedStatus

      return matchesSearch && matchesAgency && matchesStatus
    })
  }, [searchQuery, selectedAgency, selectedStatus])

  // Group filtered permits by agency
  const groupedPermits = useMemo(() => groupByAgency(filteredPermits), [filteredPermits])

  return (
    <article className="app resources-page">
      <div className="app__inner">
        <header className="resources-page__header">
          <p className="resources-page__eyebrow">Reference Library</p>
          <h1>Permits and Authorizations</h1>
          <p>
            Browse the complete inventory of federal environmental permits, authorizations, and consultations.
            Each entry includes details about the responsible agency, activity triggers, and relevant statutes.
          </p>
        </header>

        <div className="resources-page__filters">
          <div className="resources-page__search">
            <label htmlFor="permit-search" className="visually-hidden">Search permits</label>
            <input
              id="permit-search"
              type="search"
              placeholder="Search permits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="resources-page__search-input"
            />
          </div>
          <div className="resources-page__agency-filter">
            <label htmlFor="agency-filter" className="visually-hidden">Filter by agency</label>
            <select
              id="agency-filter"
              value={selectedAgency}
              onChange={(e) => setSelectedAgency(e.target.value)}
              className="resources-page__select"
            >
              <option value="all">All Agencies ({permitInventory.length})</option>
              {agencies.map(agency => {
                const count = permitInventory.filter(p => p.responsibleAgency === agency).length
                return (
                  <option key={agency} value={agency}>
                    {agency} ({count})
                  </option>
                )
              })}
            </select>
          </div>
          <div className="resources-page__status-filter">
            <label htmlFor="status-filter" className="visually-hidden">Filter by integration status</label>
            <select
              id="status-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="resources-page__select"
            >
              <option value="all">All Statuses</option>
              {INTEGRATION_STATUS_OPTIONS.map(status => {
                const count = permitInventory.filter(p => p.integrationStatus === status).length
                return (
                  <option key={status} value={status}>
                    {INTEGRATION_STATUS_LABELS[status]} ({count})
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        <p className="resources-page__results-count">
          Showing {filteredPermits.length} of {permitInventory.length} permits
        </p>

        <div className="resources-page__list">
          {Array.from(groupedPermits.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([agency, permits]) => (
              <section key={agency} className="resources-page__agency-group">
                <h2 className="resources-page__agency-heading">{agency}</h2>
                <ul className="resources-page__permits">
                  {permits
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(permit => (
                      <li key={permit.id} className="resources-page__permit-item">
                        <Link
                          to={getPermitInfoUrl(permit.id)}
                          className="resources-page__permit-link"
                        >
                          <span className="resources-page__permit-top">
                            <span className="resources-page__permit-name">{permit.name}</span>
                            <IntegrationStatusBadge status={permit.integrationStatus} />
                          </span>
                          <span className="resources-page__permit-office">{permit.responsibleOffice}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
        </div>

        {filteredPermits.length === 0 && (
          <p className="resources-page__no-results">
            No permits found matching your search criteria.
          </p>
        )}
      </div>
    </article>
  )
}
