import type { ReactNode } from "react"

import type { ProjectFormData, ProjectContact, SimpleProjectField } from "../schema/projectSchema"
import { formatProjectSummary } from "../schema/projectSchema"
import { CollapsibleCard } from "./CollapsibleCard"

const overviewFields: Array<{ key: SimpleProjectField; label: string }> = [
  { key: "title", label: "Title" },
  { key: "id", label: "Identifier" },
  { key: "sector", label: "Sector" }
]

const agencyFields: Array<{ key: SimpleProjectField; label: string }> = [
  { key: "lead_agency", label: "Lead agency" },
  { key: "participating_agencies", label: "Participating agencies" },
  { key: "sponsor", label: "Sponsor" }
]

function renderValue(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") {
    return <span className="summary-placeholder">Not provided</span>
  }
  if (typeof value === "number") {
    return value.toString()
  }
  return value
}

function hasContact(contact?: ProjectContact) {
  if (!contact) {
    return false
  }
  return Boolean(contact.name || contact.organization || contact.email || contact.phone)
}

interface ProjectSummaryProps {
  data: ProjectFormData
  actions?: ReactNode
}

export function ProjectSummary({ data, actions }: ProjectSummaryProps) {
  const summaryText = formatProjectSummary(data)
  const contact = data.sponsor_contact
  const showContact = hasContact(contact)
  const hasCoordinates =
    typeof data.location_lat === "number" || typeof data.location_lon === "number"

  return (
    <CollapsibleCard
      className="summary-panel"
      title="Project snapshot"
      description="As you populate the form, this summary updates so it can be copied into status reports or sent to collaborators."
      actions={actions ? <div className="summary-panel__actions">{actions}</div> : null}
      defaultExpanded
      dataAttributes={{
        "data-tour-id": "portal-summary",
        "data-tour-title": "Snapshot updates",
        "data-tour-intro":
          "Key fields and a quick narrative update in this card as you or the Copilot provide more project details."
      }}
    >
      <div className="summary-grid">
        <div className="summary-card">
          <h3>Overview</h3>
          <dl>
            {overviewFields.map((field) => (
              <div className="summary-row" key={field.key as string}>
                <dt>{field.label}</dt>
                <dd>{renderValue(data[field.key])}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="summary-card">
          <h3>Agencies &amp; sponsor</h3>
          <dl>
            {agencyFields.map((field) => (
              <div className="summary-row" key={field.key as string}>
                <dt>{field.label}</dt>
                <dd>{renderValue(data[field.key])}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="summary-card">
          <h3>Location</h3>
          <dl>
            <div className="summary-row">
              <dt>Description</dt>
              <dd>{renderValue(data.location_text)}</dd>
            </div>
            {hasCoordinates ? (
              <div className="summary-row">
                <dt>Coordinates</dt>
                <dd>
                  {typeof data.location_lat === "number" && typeof data.location_lon === "number"
                    ? `${data.location_lat}, ${data.location_lon}`
                    : renderValue(data.location_lat ?? data.location_lon)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {showContact ? (
          <div className="summary-card">
            <h3>Sponsor contact</h3>
            <dl>
              <div className="summary-row">
                <dt>Name</dt>
                <dd>{renderValue(contact?.name)}</dd>
              </div>
              <div className="summary-row">
                <dt>Organization</dt>
                <dd>{renderValue(contact?.organization)}</dd>
              </div>
              <div className="summary-row">
                <dt>Email</dt>
                <dd>{renderValue(contact?.email)}</dd>
              </div>
              <div className="summary-row">
                <dt>Phone</dt>
                <dd>{renderValue(contact?.phone)}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="summary-card summary-card--full">
          <h3>Quick narrative</h3>
          <div className="summary-narrative">{summaryText}</div>
        </div>
      </div>
    </CollapsibleCard>
  )
}
