import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import "./App.css"
import { nepaAgencies, getNepaAgencyUrl } from "./utils/nepaAgencies"
import { INTEGRATION_STATUS_LABELS } from "./utils/permitInventory"
import type { IntegrationStatus } from "./utils/permitInventory"
import type { NepaAgency } from "./utils/nepaAgencies"

const INTEGRATION_STATUS_OPTIONS: IntegrationStatus[] = ["integrated", "integration-ready", "app-exists", "manual"]

function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <span className={`integration-badge integration-badge--${status}`}>
      <span className="integration-badge__dot" aria-hidden="true" />
      <span className="integration-badge__label">{INTEGRATION_STATUS_LABELS[status]}</span>
    </span>
  )
}

function groupByDepartment(agencies: NepaAgency[]): Map<string, NepaAgency[]> {
  const grouped = new Map<string, NepaAgency[]>()
  for (const agency of agencies) {
    const dept = agency.department
    if (!grouped.has(dept)) {
      grouped.set(dept, [])
    }
    grouped.get(dept)!.push(agency)
  }
  return grouped
}

export default function NepaCompliancePage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")

  const departments = useMemo(() => {
    const deptSet = new Set(nepaAgencies.map(a => a.department))
    return Array.from(deptSet).sort()
  }, [])

  const filteredAgencies = useMemo(() => {
    return nepaAgencies.filter(agency => {
      const matchesSearch = searchQuery === "" ||
        agency.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agency.abbreviation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agency.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agency.procedureCitation.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesDepartment = selectedDepartment === "all" || agency.department === selectedDepartment

      const matchesStatus = selectedStatus === "all" || agency.integrationStatus === selectedStatus

      return matchesSearch && matchesDepartment && matchesStatus
    })
  }, [searchQuery, selectedDepartment, selectedStatus])

  const groupedAgencies = useMemo(() => groupByDepartment(filteredAgencies), [filteredAgencies])

  return (
    <article className="app resources-page">
      <div className="app__inner">
        <header className="resources-page__header">
          <p className="resources-page__eyebrow">Reference Library</p>
          <h1>NEPA Implementing Procedures</h1>
          <p>
            Browse federal agencies with NEPA implementing procedures. Each entry includes the
            agency's procedure citation, a link to the source document, and current case management
            integration status.
          </p>
        </header>

        <div className="resources-page__filters">
          <div className="resources-page__search">
            <label htmlFor="nepa-search" className="visually-hidden">Search agencies</label>
            <input
              id="nepa-search"
              type="search"
              placeholder="Search agencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="resources-page__search-input"
            />
          </div>
          <div className="resources-page__agency-filter">
            <label htmlFor="department-filter" className="visually-hidden">Filter by department</label>
            <select
              id="department-filter"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="resources-page__select"
            >
              <option value="all">All Departments ({nepaAgencies.length})</option>
              {departments.map(dept => {
                const count = nepaAgencies.filter(a => a.department === dept).length
                return (
                  <option key={dept} value={dept}>
                    {dept} ({count})
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
                const count = nepaAgencies.filter(a => a.integrationStatus === status).length
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
          Showing {filteredAgencies.length} of {nepaAgencies.length} agencies
        </p>

        <div className="resources-page__list">
          {Array.from(groupedAgencies.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([department, agencies]) => (
              <section key={department} className="resources-page__agency-group">
                <h2 className="resources-page__agency-heading">{department}</h2>
                <ul className="resources-page__permits">
                  {agencies
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(agency => (
                      <li key={agency.id} className="resources-page__permit-item">
                        <Link
                          to={getNepaAgencyUrl(agency.id)}
                          className="resources-page__permit-link"
                        >
                          <span className="resources-page__permit-top">
                            <span className="resources-page__permit-name">
                              {agency.name} ({agency.abbreviation})
                            </span>
                            <IntegrationStatusBadge status={agency.integrationStatus} />
                          </span>
                          <span className="resources-page__permit-office">{agency.procedureCitation}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
        </div>

        {filteredAgencies.length === 0 && (
          <p className="resources-page__no-results">
            No agencies found matching your search criteria.
          </p>
        )}
      </div>
    </article>
  )
}
