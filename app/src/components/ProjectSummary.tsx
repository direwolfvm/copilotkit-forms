import type { ProjectFormData, ProjectContact, SimpleProjectField } from "../schema/projectSchema"
import { formatProjectSummary } from "../schema/projectSchema"

const overviewFields: Array<{ key: SimpleProjectField; label: string }> = [
  { key: "title", label: "Title" },
  { key: "id", label: "Identifier" },
  { key: "type", label: "Type" },
  { key: "sector", label: "Sector" }
]

const agencyFields: Array<{ key: SimpleProjectField; label: string }> = [
  { key: "lead_agency", label: "Lead agency" },
  { key: "participating_agencies", label: "Participating agencies" },
  { key: "sponsor", label: "Sponsor" }
]

const dataManagementFields: Array<{ key: SimpleProjectField; label: string }> = [
  { key: "data_source_system", label: "Source system" },
  { key: "record_owner_agency", label: "Record owner" },
  { key: "data_record_version", label: "Record version" },
  { key: "last_updated", label: "Last updated" }
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
}

export function ProjectSummary({ data }: ProjectSummaryProps) {
  const summaryText = formatProjectSummary(data)
  const contact = data.sponsor_contact
  const showContact = hasContact(contact)
  const hasCoordinates =
    typeof data.location_lat === "number" || typeof data.location_lon === "number"

  return (
    <aside className="summary-panel" aria-label="Project snapshot">
      <h2>Project snapshot</h2>
      <p className="summary-intro">
        As you populate the form, this summary updates so it can be copied into status
        reports or sent to collaborators.
      </p>

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
        <h3>Data management</h3>
        <dl>
          {dataManagementFields.map((field) => (
            <div className="summary-row" key={field.key as string}>
              <dt>{field.label}</dt>
              <dd>{renderValue(data[field.key])}</dd>
            </div>
          ))}
          <div className="summary-row">
            <dt>Retrieved</dt>
            <dd>{renderValue(data.retrieved_timestamp)}</dd>
          </div>
          <div className="summary-row">
            <dt>Record created</dt>
            <dd>{renderValue(data.created_at)}</dd>
          </div>
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
          {data.location_object ? (
            <div className="summary-row">
              <dt>Geometry</dt>
              <dd>
                <pre className="summary-geojson">{data.location_object}</pre>
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

      <div className="summary-card">
        <h3>Quick narrative</h3>
        <pre className="summary-narrative">{summaryText}</pre>
      </div>
    </aside>
  )
}
