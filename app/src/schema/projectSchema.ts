import type { RJSFSchema, UiSchema } from "@rjsf/utils"

export interface ProjectContact {
  name?: string
  organization?: string
  email?: string
  phone?: string
}

export interface ProjectFormData {
  id?: string
  title?: string
  description?: string
  type?: string
  sector?: string
  current_status?: string
  start_date?: string
  lead_agency?: string
  participating_agencies?: string
  sponsor?: string
  sponsor_contact?: ProjectContact
  funding?: string
  location_text?: string
  location_lat?: number
  location_lon?: number
  location_object?: string
  parent_project_id?: string
  data_source_agency?: string
  data_source_system?: string
  record_owner_agency?: string
  data_record_version?: string
  retrieved_timestamp?: string
  created_at?: string
  last_updated?: string
  other?: string
}

export type SimpleProjectField = Exclude<keyof ProjectFormData, "sponsor_contact">

type FieldJsonType = "string" | "number"

interface FieldDetail {
  key: SimpleProjectField
  title: string
  description: string
  jsonType: FieldJsonType
  format?: "date" | "date-time"
  placeholder?: string
  widget?: "textarea"
  rows?: number
}

export const projectFieldDetails: ReadonlyArray<FieldDetail> = [
  {
    key: "title",
    title: "Project Title",
    description:
      "Plain-language name that agencies and the public use to refer to the project.",
    jsonType: "string",
    placeholder: "River Valley Transmission Line"
  },
  {
    key: "id",
    title: "Project Identifier",
    description: "Unique identifier used to track this project across systems.",
    jsonType: "string",
    placeholder: "RVTL-2025-001"
  },
  {
    key: "type",
    title: "Project Type",
    description: "High-level classification such as transmission line, renewable energy, or broadband.",
    jsonType: "string",
    placeholder: "Electric transmission"
  },
  {
    key: "sector",
    title: "CEQ Sector",
    description: "Sector category from the CEQ permitting data standard.",
    jsonType: "string",
    placeholder: "Energy"
  },
  {
    key: "current_status",
    title: "Current Status",
    description: "Lifecycle stage or milestone the project is currently in.",
    jsonType: "string",
    placeholder: "Draft EIS in progress"
  },
  {
    key: "start_date",
    title: "Record Start Date",
    description: "Date the project record became active in the source system.",
    jsonType: "string",
    format: "date"
  },
  {
    key: "lead_agency",
    title: "Lead Agency",
    description: "Agency responsible for leading the environmental review.",
    jsonType: "string",
    placeholder: "Department of Energy"
  },
  {
    key: "participating_agencies",
    title: "Participating Agencies",
    description: "Additional agencies contributing to the review (comma-separated).",
    jsonType: "string",
    placeholder: "USACE, EPA Region 8"
  },
  {
    key: "sponsor",
    title: "Project Sponsor",
    description: "Organization proposing or funding the project.",
    jsonType: "string",
    placeholder: "River Valley Transmission LLC"
  },
  {
    key: "description",
    title: "Project Description",
    description: "Concise summary of the project's purpose, scope, and major components.",
    jsonType: "string",
    widget: "textarea",
    rows: 5,
    placeholder: "Construct a 230 kV line connecting..."
  },
  {
    key: "funding",
    title: "Funding Summary",
    description: "Key funding sources or authorizations supporting the project.",
    jsonType: "string",
    widget: "textarea",
    rows: 3,
    placeholder: "DOE Grid Resilience Grants; private capital"
  },
  {
    key: "location_text",
    title: "Location Description",
    description: "Narrative description of the project location (state, county, landmarks).",
    jsonType: "string",
    widget: "textarea",
    rows: 3,
    placeholder: "Spans Lincoln and Dawson counties in Nebraska"
  },
  {
    key: "location_lat",
    title: "Representative Latitude",
    description: "Latitude in decimal degrees for a representative project location.",
    jsonType: "number",
    placeholder: "41.2405"
  },
  {
    key: "location_lon",
    title: "Representative Longitude",
    description: "Longitude in decimal degrees for a representative project location.",
    jsonType: "number",
    placeholder: "-101.0169"
  },
  {
    key: "location_object",
    title: "Location Geometry (GeoJSON)",
    description: "GeoJSON geometry describing the project footprint or corridor.",
    jsonType: "string",
    widget: "textarea",
    rows: 4,
    placeholder: '{"type":"Point","coordinates":[-101.0169,41.2405]}'
  },
  {
    key: "parent_project_id",
    title: "Parent Project Identifier",
    description: "Identifier of a related or overarching project, when applicable.",
    jsonType: "string",
    placeholder: "NE-TRANSMISSION-ROOT"
  },
  {
    key: "data_source_agency",
    title: "Data Source Agency",
    description: "Agency providing this record if different from the record owner.",
    jsonType: "string",
    placeholder: "Department of Energy"
  },
  {
    key: "data_source_system",
    title: "Data Source System",
    description: "System of record or application where the data originated.",
    jsonType: "string",
    placeholder: "eNEPA"
  },
  {
    key: "record_owner_agency",
    title: "Record Owner Agency",
    description: "Agency responsible for maintaining the authoritative record.",
    jsonType: "string",
    placeholder: "Federal Permitting Dashboard"
  },
  {
    key: "data_record_version",
    title: "Record Version",
    description: "Version identifier or revision number for this project record.",
    jsonType: "string",
    placeholder: "v2025.02"
  },
  {
    key: "retrieved_timestamp",
    title: "Retrieved Timestamp",
    description: "Timestamp when the data was retrieved from the source system.",
    jsonType: "string",
    format: "date-time"
  },
  {
    key: "created_at",
    title: "Record Created",
    description: "Timestamp when this project record was created.",
    jsonType: "string",
    format: "date-time"
  },
  {
    key: "last_updated",
    title: "Last Updated",
    description: "Timestamp of the most recent update to this project record.",
    jsonType: "string",
    format: "date-time"
  },
  {
    key: "other",
    title: "Other Notes",
    description: "Additional context or data points that do not fit other fields.",
    jsonType: "string",
    widget: "textarea",
    rows: 3
  }
]

const schemaProperties: RJSFSchema["properties"] = projectFieldDetails.reduce(
  (accumulator, field) => {
    accumulator[field.key] = {
      type: field.jsonType,
      title: field.title,
      description: field.description,
      ...(field.format ? { format: field.format } : {})
    }
    return accumulator
  },
  {} as NonNullable<RJSFSchema["properties"]>
)

schemaProperties.sponsor_contact = {
  type: "object",
  title: "Sponsor Point of Contact",
  description: "Primary contact information for the project sponsor.",
  properties: {
    name: {
      type: "string",
      title: "Contact Name"
    },
    organization: {
      type: "string",
      title: "Organization"
    },
    email: {
      type: "string",
      title: "Email",
      format: "email"
    },
    phone: {
      type: "string",
      title: "Phone"
    }
  }
}

export const projectSchema: RJSFSchema = {
  title: "CEQ Project Entity",
  description:
    "Capture the attributes required by the Council on Environmental Quality (CEQ) project entity standard.",
  type: "object",
  properties: schemaProperties,
  required: ["id", "title", "lead_agency"]
}

const order: Array<SimpleProjectField | "sponsor_contact"> = [
  "title",
  "id",
  "type",
  "sector",
  "current_status",
  "start_date",
  "lead_agency",
  "participating_agencies",
  "sponsor",
  "sponsor_contact",
  "description",
  "funding",
  "location_text",
  "location_lat",
  "location_lon",
  "location_object",
  "parent_project_id",
  "data_source_agency",
  "data_source_system",
  "record_owner_agency",
  "data_record_version",
  "created_at",
  "last_updated",
  "retrieved_timestamp",
  "other"
]

export const projectUiSchema: UiSchema<ProjectFormData> = {
  "ui:order": order,
  sponsor_contact: {
    name: {
      "ui:placeholder": "Full name"
    },
    organization: {
      "ui:placeholder": "Organization"
    },
    email: {
      "ui:placeholder": "name@example.gov"
    },
    phone: {
      "ui:placeholder": "###-###-####"
    }
  }
}

for (const field of projectFieldDetails) {
  const uiConfig: Record<string, unknown> = {}
  if (field.widget) {
    uiConfig["ui:widget"] = field.widget
  }
  if (field.placeholder) {
    uiConfig["ui:placeholder"] = field.placeholder
  }
  if (field.rows) {
    uiConfig["ui:options"] = { rows: field.rows }
  }
  if (Object.keys(uiConfig).length > 0) {
    projectUiSchema[field.key] = uiConfig as UiSchema<ProjectFormData>[string]
  }
}

export const defaultProjectData: ProjectFormData = {
  sponsor_contact: {}
}

export function createEmptyProjectData(): ProjectFormData {
  return {
    ...defaultProjectData,
    sponsor_contact: {}
  }
}

const numericFieldArray = projectFieldDetails
  .filter((field) => field.jsonType === "number")
  .map((field) => field.key)

export const numericProjectFields = new Set<SimpleProjectField>(numericFieldArray)

export type NumericProjectField = (typeof numericFieldArray)[number]

export function isNumericProjectField(field: SimpleProjectField): field is NumericProjectField {
  return numericProjectFields.has(field)
}

export function formatProjectSummary(data: ProjectFormData): string {
  const summaryLines: string[] = []
  if (data.title) {
    summaryLines.push(`Title: ${data.title}`)
  }
  if (data.id) {
    summaryLines.push(`Identifier: ${data.id}`)
  }
  if (data.type) {
    summaryLines.push(`Type: ${data.type}`)
  }
  if (data.sector) {
    summaryLines.push(`Sector: ${data.sector}`)
  }
  if (data.current_status) {
    summaryLines.push(`Status: ${data.current_status}`)
  }
  if (data.lead_agency) {
    summaryLines.push(`Lead agency: ${data.lead_agency}`)
  }
  if (data.participating_agencies) {
    summaryLines.push(`Participating agencies: ${data.participating_agencies}`)
  }
  if (data.sponsor) {
    summaryLines.push(`Sponsor: ${data.sponsor}`)
  }
  if (data.start_date) {
    summaryLines.push(`Record start date: ${data.start_date}`)
  }
  if (data.location_text) {
    summaryLines.push(`Location: ${data.location_text}`)
  }
  if (typeof data.location_lat === "number" && typeof data.location_lon === "number") {
    summaryLines.push(`Representative coordinates: ${data.location_lat}, ${data.location_lon}`)
  }
  if (data.description) {
    summaryLines.push(`Summary: ${data.description}`)
  }
  return summaryLines.join("\n") || "No project details captured yet."
}
