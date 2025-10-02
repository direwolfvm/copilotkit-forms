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
  fiscal_year?: string
  participating_agencies?: string
  sponsor?: string
  sponsor_contact?: ProjectContact
  funding?: string
  location_text?: string
  location_lat?: number
  location_lon?: number
  location_object?: string
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
    key: "fiscal_year",
    title: "Fiscal Year",
    description: "Fiscal year associated with this project record (e.g., 2025).",
    jsonType: "string",
    placeholder: "2025"
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

schemaProperties.id = {
  type: "string",
  title: "Project Identifier",
  description: "Auto-generated identifier used to track this project across systems.",
  readOnly: true
}

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
  required: ["title", "lead_agency", "fiscal_year"]
}

const order: Array<SimpleProjectField | "sponsor_contact"> = [
  "title",
  "type",
  "sector",
  "current_status",
  "start_date",
  "lead_agency",
  "fiscal_year",
  "participating_agencies",
  "sponsor",
  "sponsor_contact",
  "description",
  "funding",
  "location_text",
  "location_lat",
  "location_lon",
  "location_object",
  "other"
]

export const projectUiSchema: UiSchema<ProjectFormData> = {
  "ui:order": order,
  id: {
    "ui:widget": "hidden"
  },
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
  if (data.fiscal_year) {
    summaryLines.push(`Fiscal year: ${data.fiscal_year}`)
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
