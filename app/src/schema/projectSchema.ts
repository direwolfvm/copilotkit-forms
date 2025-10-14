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
  sector?: string
  lead_agency?: string
  participating_agencies?: string
  sponsor?: string
  sponsor_contact?: ProjectContact
  funding?: string
  location_text?: string
  location_lat?: number
  location_lon?: number
  location_object?: string
  nepa_categorical_exclusion_code?: string
  nepa_conformance_conditions?: string
  nepa_extraordinary_circumstances?: string
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
  includeInForm?: boolean
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
    key: "sector",
    title: "Sector",
    description: "Sector category from the permitting data standard.",
    jsonType: "string",
    placeholder: "Energy"
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
    placeholder: "Spans Lincoln and Dawson counties in Nebraska",
    includeInForm: false
  },
  {
    key: "location_lat",
    title: "Project Centroid Latitude",
    description: "Latitude in decimal degrees for the project centroid.",
    jsonType: "number",
    placeholder: "41.2405",
    includeInForm: false
  },
  {
    key: "location_lon",
    title: "Project Centroid Longitude",
    description: "Longitude in decimal degrees for the project centroid.",
    jsonType: "number",
    placeholder: "-101.0169",
    includeInForm: false
  },
  {
    key: "location_object",
    title: "Location Geometry (GeoJSON)",
    description: "GeoJSON geometry describing the project footprint or corridor.",
    jsonType: "string",
    widget: "textarea",
    rows: 4,
    placeholder: '{"type":"Point","coordinates":[-101.0169,41.2405]}',
    includeInForm: false
  },
  {
    key: "nepa_categorical_exclusion_code",
    title: "Categorical Exclusion",
    description: "Describe the categorical exclusion applied to this project.",
    jsonType: "string",
    widget: "textarea",
    rows: 3,
    placeholder: "Briefly describe the categorical exclusion determination.",
    includeInForm: false
  },
  {
    key: "nepa_conformance_conditions",
    title: "Conditions for Conformance",
    description:
      "Document any conditions that must be met for the project to move through permitting or environmental review.",
    jsonType: "string",
    widget: "textarea",
    rows: 4,
    includeInForm: false
  },
  {
    key: "nepa_extraordinary_circumstances",
    title: "Environmental Narrative",
    description:
      "Summarize analysis of any natural or other resources that could be impacted by the project.  If relevant, evaluate how these might be considered an extraordinary circumstance for a categorical exclusion.",
    jsonType: "string",
    widget: "textarea",
    rows: 5,
    includeInForm: false
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
    if (field.includeInForm === false) {
      return accumulator
    }
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
  title: "Project Information",
  description:
    "Start your project by populating the data fields below and saving the snapshot..",
  type: "object",
  properties: schemaProperties,
  required: ["title", "lead_agency", "description"]
}

const order: Array<SimpleProjectField | "sponsor_contact"> = [
  "id",
  "title",
  "sector",
  "lead_agency",
  "participating_agencies",
  "sponsor",
  "sponsor_contact",
  "description",
  "funding",
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
  if (field.includeInForm === false) {
    continue
  }
  const uiConfig: Record<string, unknown> = {
    ...(projectUiSchema[field.key] as Record<string, unknown> | undefined)
  }
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

export function createEmptyProjectData(): ProjectFormData {
  return {
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
  if (data.sector) {
    summaryLines.push(`Sector: ${data.sector}`)
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
  if (data.location_text) {
    summaryLines.push(`Location: ${data.location_text}`)
  }
  if (typeof data.location_lat === "number" && typeof data.location_lon === "number") {
    summaryLines.push(`Project centroid coordinates: ${data.location_lat}, ${data.location_lon}`)
  }
  if (data.description) {
    summaryLines.push(`Summary: ${data.description}`)
  }
  return summaryLines.join("\n") || "No project details captured yet."
}
