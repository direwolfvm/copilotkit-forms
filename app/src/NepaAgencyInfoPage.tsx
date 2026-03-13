import { Link, useParams } from "react-router-dom"
import { nepaAgencies } from "./utils/nepaAgencies"
import { INTEGRATION_STATUS_LABELS } from "./utils/permitInventory"
import type { IntegrationStatus } from "./utils/permitInventory"
import type { NepaAgency } from "./utils/nepaAgencies"
import { agencyCaseMgmtTools } from "./utils/agencyCaseMgmtTools"
import type { AgencyCaseMgmtTool } from "./utils/agencyCaseMgmtTools"

function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <span className={`integration-badge integration-badge--${status}`}>
      <span className="integration-badge__dot" aria-hidden="true" />
      <span className="integration-badge__label">{INTEGRATION_STATUS_LABELS[status]}</span>
    </span>
  )
}

function ToolCard({ tool }: { tool: AgencyCaseMgmtTool }) {
  return (
    <article className="permit-info__tool-card">
      <h3 className="permit-info__tool-name">{tool.systemName}</h3>
      <span className="permit-info__tool-agency">{tool.agencySystemOwner}</span>
      <p className="permit-info__tool-desc">{tool.functionalityDescription}</p>
    </article>
  )
}

function findToolsForAgency(agency: NepaAgency): AgencyCaseMgmtTool[] {
  const abbr = agency.abbreviation
  const deptAbbr = agency.departmentAbbreviation
  return agencyCaseMgmtTools.filter(tool => {
    const owner = tool.agencySystemOwner
    // Match "DOI / BLM" style owner strings against abbreviation or dept/abbr combo
    return (
      owner === abbr ||
      owner === `${deptAbbr} / ${abbr}` ||
      owner === `${deptAbbr}` ||
      owner.includes(abbr)
    )
  })
}

function AgencyInfoContent({ agency }: { agency: NepaAgency }) {
  const relatedTools = findToolsForAgency(agency)

  return (
    <div className="permit-info">
      <header className="permit-info__header">
        <Link to="/resources/nepa-compliance" className="permit-info__back">
          &larr; Back to NEPA Compliance
        </Link>
        <h1>{agency.name}</h1>
        <div className="permit-info__meta">
          <span className="permit-info__agency">{agency.department}</span>
          <span className="permit-info__office">{agency.abbreviation}</span>
          <IntegrationStatusBadge status={agency.integrationStatus} />
        </div>
      </header>

      <section className="permit-info__section">
        <h2>About NEPA</h2>
        <p className="permit-info__description">
          The National Environmental Policy Act (NEPA) requires federal agencies to assess the
          environmental effects of their proposed actions prior to making decisions. Each federal
          agency develops its own NEPA implementing procedures that define how it will comply with
          the Act, including categorical exclusions, environmental assessments, and environmental
          impact statements.
        </p>
      </section>

      <section className="permit-info__section">
        <h2>NEPA Implementing Procedures</h2>
        <p>{agency.procedureCitation}</p>
        {agency.procedureUrl ? (
          <p>
            <a
              href={agency.procedureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="permit-info__statute"
            >
              View source document &rarr;
            </a>
          </p>
        ) : null}
      </section>

      {relatedTools.length > 0 ? (
        <section className="permit-info__section">
          <h2>Agency Case Management Tools</h2>
          <p className="permit-info__tools-intro">
            The following agency systems support case management or NEPA review processes for this agency.
          </p>
          <div className="permit-info__tools-grid">
            {relatedTools.map((tool) => (
              <ToolCard key={tool.systemName} tool={tool} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function AgencyNotFound({ agencyId }: { agencyId: string }) {
  return (
    <div className="permit-info permit-info--not-found">
      <header className="permit-info__header">
        <Link to="/resources/nepa-compliance" className="permit-info__back">
          &larr; Back to NEPA Compliance
        </Link>
        <h1>Agency Not Found</h1>
      </header>
      <p>
        No agency information found for ID: <code>{agencyId}</code>
      </p>
      <p>
        <Link to="/resources/nepa-compliance">Return to NEPA Compliance</Link> to browse all agencies.
      </p>
    </div>
  )
}

export function NepaAgencyInfoPage() {
  const { agencyId } = useParams<{ agencyId: string }>()
  const agency = nepaAgencies.find((a) => a.id === agencyId)

  return (
    <main className="permit-info-page">
      {agency ? <AgencyInfoContent agency={agency} /> : <AgencyNotFound agencyId={agencyId ?? ""} />}
    </main>
  )
}
