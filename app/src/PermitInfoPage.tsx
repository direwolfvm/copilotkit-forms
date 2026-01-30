import { Link, useParams } from "react-router-dom"
import { permitInventory, INTEGRATION_STATUS_LABELS } from "./utils/permitInventory"
import type { PermitInfo, IntegrationStatus } from "./utils/permitInventory"

function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <span className={`integration-badge integration-badge--${status}`}>
      <span className="integration-badge__dot" aria-hidden="true" />
      <span className="integration-badge__label">{INTEGRATION_STATUS_LABELS[status]}</span>
    </span>
  )
}

function PermitInfoContent({ permit }: { permit: PermitInfo }) {
  return (
    <div className="permit-info">
      <header className="permit-info__header">
        <Link to="/portal" className="permit-info__back">
          &larr; Back to Project Portal
        </Link>
        <h1>{permit.name}</h1>
        <div className="permit-info__meta">
          <span className="permit-info__agency">{permit.responsibleAgency}</span>
          {permit.responsibleOffice ? (
            <span className="permit-info__office">{permit.responsibleOffice}</span>
          ) : null}
          <IntegrationStatusBadge status={permit.integrationStatus} />
        </div>
      </header>

      <section className="permit-info__section">
        <h2>Description</h2>
        <p className="permit-info__description">{permit.description || "No description available."}</p>
      </section>

      {permit.activityTrigger ? (
        <section className="permit-info__section">
          <h2>Activity / Trigger</h2>
          <p>{permit.activityTrigger}</p>
        </section>
      ) : null}

      {permit.projectType ? (
        <section className="permit-info__section">
          <h2>Project Types</h2>
          <p>{permit.projectType}</p>
        </section>
      ) : null}

      {permit.statuteRegulation ? (
        <section className="permit-info__section">
          <h2>Statute / Regulation</h2>
          <p className="permit-info__statute">{permit.statuteRegulation}</p>
        </section>
      ) : null}
    </div>
  )
}

function PermitNotFound({ permitId }: { permitId: string }) {
  return (
    <div className="permit-info permit-info--not-found">
      <header className="permit-info__header">
        <Link to="/portal" className="permit-info__back">
          &larr; Back to Project Portal
        </Link>
        <h1>Permit Not Found</h1>
      </header>
      <p>
        No permit information found for ID: <code>{permitId}</code>
      </p>
      <p>
        <Link to="/portal">Return to the Project Portal</Link> to continue working on your project.
      </p>
    </div>
  )
}

export function PermitInfoPage() {
  const { permitId } = useParams<{ permitId: string }>()
  const permit = permitInventory.find((p) => p.id === permitId)

  return (
    <main className="permit-info-page">
      {permit ? <PermitInfoContent permit={permit} /> : <PermitNotFound permitId={permitId ?? ""} />}
    </main>
  )
}
