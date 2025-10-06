import type { ProjectContact, ProjectFormData } from "../schema/projectSchema"
import type { GeospatialResultsState, GeospatialServiceState } from "../types/geospatial"
import type { PermittingChecklistItem } from "../components/PermittingChecklistSection"
import { getSupabaseAnonKey, getSupabaseUrl } from "../runtimeConfig"

const DATA_SOURCE_SYSTEM = "project-portal"
const PRE_SCREENING_PROCESS_MODEL_ID = 1
const PRE_SCREENING_TITLE_SUFFIX = "Pre-Screening"

const DECISION_ELEMENT_TITLES = [
  "Provide complete project details",
  "Confirm or upload NEPA Assist results if auto fetch fails",
  "Confirm or upload IPaC results if auto fetch fails",
  "Provide permit applicability notes",
  "Enter CE references and rationale",
  "List applicable conditions and notes",
  "Provide resource-by-resource notes"
] as const

type DecisionElementTitle = (typeof DECISION_ELEMENT_TITLES)[number]

export class ProjectPersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ProjectPersistenceError"
  }
}

type SaveProjectSnapshotArgs = {
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
}

type BuildProjectRecordArgs = {
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
  numericId: number | undefined
  normalizedTitle: string | null
  locationResult: LocationParseResult
}

type SubmitDecisionPayloadArgs = {
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
}

type DecisionElementRecord = {
  id: number
  title: string
}

type DecisionElementMap = Map<DecisionElementTitle, DecisionElementRecord>

export async function saveProjectSnapshot({
  formData,
  geospatialResults
}: SaveProjectSnapshotArgs): Promise<number> {
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "Supabase credentials are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    )
  }

  const normalizedId = normalizeString(formData.id)
  const normalizedTitle = normalizeString(formData.title)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined

  if (normalizedId && (Number.isNaN(numericId) || !Number.isFinite(numericId))) {
    throw new ProjectPersistenceError("Project identifier must be numeric to save to Supabase.")
  }

  const locationResult = parseLocationObject(formData.location_object)

  const timestamp = new Date().toISOString()

  const projectRecord = buildProjectRecord({
    formData,
    geospatialResults,
    numericId,
    normalizedTitle,
    locationResult
  })

  const sanitizedRecord = stripUndefined({
    ...projectRecord,
    data_source_system: DATA_SOURCE_SYSTEM,
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })

  const endpoint = `/api/supabase/rest/v1/project?${new URLSearchParams({ on_conflict: "id" }).toString()}`

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(sanitizedRecord)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)

    throw new ProjectPersistenceError(
      errorDetail
        ? `Supabase request failed (${response.status}): ${errorDetail}`
        : `Supabase request failed (${response.status}).`
    )
  }

  const responsePayload = responseText ? safeJsonParse(responseText) : undefined
  const projectId = determineProjectId(numericId, responsePayload)

  const processInstanceId = await createPreScreeningProcessInstance({
    supabaseUrl,
    supabaseAnonKey,
    projectId,
    projectTitle: normalizedTitle
  })

  return processInstanceId
}

function buildProjectRecord({
  formData,
  geospatialResults,
  numericId,
  normalizedTitle,
  locationResult
}: BuildProjectRecordArgs): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: numericId,
    title: normalizedTitle,
    description: normalizeString(formData.description),
    sector: normalizeString(formData.sector),
    lead_agency: normalizeString(formData.lead_agency),
    participating_agencies: normalizeString(formData.participating_agencies),
    sponsor: normalizeString(formData.sponsor),
    funding: normalizeString(formData.funding),
    location_text: normalizeString(formData.location_text),
    location_lat: normalizeNumber(formData.location_lat),
    location_lon: normalizeNumber(formData.location_lon),
    location_object: locationResult.value,
    sponsor_contact: normalizeContact(formData.sponsor_contact),
    other: buildOtherPayload(formData, geospatialResults, locationResult)
  }

  return stripUndefined(record)
}

export async function submitDecisionPayload({
  formData,
  geospatialResults,
  permittingChecklist
}: SubmitDecisionPayloadArgs): Promise<void> {
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "Supabase credentials are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    )
  }

  const normalizedId = normalizeString(formData.id)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined

  if (!numericId || Number.isNaN(numericId) || !Number.isFinite(numericId)) {
    throw new ProjectPersistenceError(
      "A numeric project identifier is required to submit pre-screening data. Save the project snapshot first."
    )
  }

  const normalizedTitle = normalizeString(formData.title)
  const locationResult = parseLocationObject(formData.location_object)

  const projectRecord = buildProjectRecord({
    formData,
    geospatialResults,
    numericId,
    normalizedTitle,
    locationResult
  })

  const processInstanceId = await getLatestProcessInstanceId({
    supabaseUrl,
    supabaseAnonKey,
    projectId: numericId,
    projectTitle: normalizedTitle
  })

  const decisionElements = await fetchDecisionElements({ supabaseUrl, supabaseAnonKey })

  const missingElements = DECISION_ELEMENT_TITLES.filter((title) => !decisionElements.has(title))
  if (missingElements.length > 0) {
    console.warn(
      "Decision elements are not configured for:",
      missingElements.join(", "),
      "— proceeding with available configuration."
    )
  }

  const timestamp = new Date().toISOString()

  const records = buildDecisionPayloadRecords({
    processInstanceId,
    timestamp,
    projectRecord,
    decisionElements,
    geospatialResults,
    permittingChecklist,
    formData
  })

  if (!records.length) {
    return
  }

  const endpoint = new URL("/rest/v1/decision_payload", supabaseUrl)
  endpoint.searchParams.set("on_conflict", "process_instance,decision_element")

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(records)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)

    throw new ProjectPersistenceError(
      errorDetail
        ? `Failed to submit pre-screening data (${response.status}): ${errorDetail}`
        : `Failed to submit pre-screening data (${response.status}).`
    )
  }
}

type CreatePreScreeningProcessInstanceArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
  projectTitle: string | null
}

async function createPreScreeningProcessInstance({
  supabaseUrl,
  supabaseAnonKey,
  projectId,
  projectTitle
}: CreatePreScreeningProcessInstanceArgs): Promise<number> {
  const endpoint = new URL("/rest/v1/process_instance", supabaseUrl)
  const timestamp = new Date().toISOString()

  const processInstancePayload = stripUndefined({
    description: buildProcessInstanceDescription(projectTitle),
    process_model: PRE_SCREENING_PROCESS_MODEL_ID,
    parent_project_id: projectId,
    data_source_system: DATA_SOURCE_SYSTEM,
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: "return=representation"
    },
    body: JSON.stringify(processInstancePayload)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)

    throw new ProjectPersistenceError(
      errorDetail
        ? `Failed to create process instance (${response.status}): ${errorDetail}`
        : `Failed to create process instance (${response.status}).`
    )
  }

  const payload = responseText ? safeJsonParse(responseText) : undefined
  const processInstanceId = extractNumericId(payload)
  if (typeof processInstanceId !== "number" || !Number.isFinite(processInstanceId)) {
    throw new ProjectPersistenceError("Supabase response did not include a process instance identifier.")
  }

  return processInstanceId
}

type GetLatestProcessInstanceIdArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
  projectTitle: string | null
}

async function getLatestProcessInstanceId({
  supabaseUrl,
  supabaseAnonKey,
  projectId,
  projectTitle
}: GetLatestProcessInstanceIdArgs): Promise<number> {
  const existingId = await fetchExistingProcessInstanceId({
    supabaseUrl,
    supabaseAnonKey,
    projectId
  })

  if (typeof existingId === "number") {
    return existingId
  }

  return createPreScreeningProcessInstance({
    supabaseUrl,
    supabaseAnonKey,
    projectId,
    projectTitle
  })
}

type FetchExistingProcessInstanceIdArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
}

async function fetchExistingProcessInstanceId({
  supabaseUrl,
  supabaseAnonKey,
  projectId
}: FetchExistingProcessInstanceIdArgs): Promise<number | undefined> {
  const endpoint = new URL("/rest/v1/process_instance", supabaseUrl)
  endpoint.searchParams.set("select", "id,parent_project_id,process_model,last_updated")
  endpoint.searchParams.set("parent_project_id", `eq.${projectId}`)
  endpoint.searchParams.set("process_model", `eq.${PRE_SCREENING_PROCESS_MODEL_ID}`)
  endpoint.searchParams.append("order", "last_updated.desc.nullslast")
  endpoint.searchParams.append("order", "id.desc")
  endpoint.searchParams.set("limit", "1")

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`
    }
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)

    throw new ProjectPersistenceError(
      errorDetail
        ? `Failed to look up process instance (${response.status}): ${errorDetail}`
        : `Failed to look up process instance (${response.status}).`
    )
  }

  const payload = responseText ? safeJsonParse(responseText) : undefined
  const processInstanceId = extractNumericId(payload)

  return typeof processInstanceId === "number" && Number.isFinite(processInstanceId)
    ? processInstanceId
    : undefined
}

type FetchDecisionElementsArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
}

async function fetchDecisionElements({
  supabaseUrl,
  supabaseAnonKey
}: FetchDecisionElementsArgs): Promise<DecisionElementMap> {
  const endpoint = new URL("/rest/v1/decision_element", supabaseUrl)
  endpoint.searchParams.set("select", "id,title")
  endpoint.searchParams.set("process_model", `eq.${PRE_SCREENING_PROCESS_MODEL_ID}`)

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`
    }
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)

    throw new ProjectPersistenceError(
      errorDetail
        ? `Failed to load decision elements (${response.status}): ${errorDetail}`
        : `Failed to load decision elements (${response.status}).`
    )
  }

  const payload = responseText ? safeJsonParse(responseText) : undefined
  const map: DecisionElementMap = new Map()

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") {
        continue
      }
      const title = (entry as { title?: unknown }).title
      const id = (entry as { id?: unknown }).id
      if (typeof title !== "string" || typeof id !== "number" || !Number.isFinite(id)) {
        continue
      }
      if ((DECISION_ELEMENT_TITLES as readonly string[]).includes(title)) {
        map.set(title as DecisionElementTitle, { id, title })
      }
    }
  }

  return map
}

type BuildDecisionPayloadRecordsArgs = {
  processInstanceId: number
  timestamp: string
  projectRecord: Record<string, unknown>
  decisionElements: DecisionElementMap
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
  formData: ProjectFormData
}

type DecisionPayloadBuilderContext = {
  elementId: number
  projectRecord: Record<string, unknown>
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
  formData: ProjectFormData
}

type DecisionElementBuilder = {
  title: DecisionElementTitle
  build: (context: DecisionPayloadBuilderContext) => Record<string, unknown>
}

const DECISION_ELEMENT_BUILDERS: DecisionElementBuilder[] = [
  {
    title: "Provide complete project details",
    build: buildProjectDetailsPayload
  },
  {
    title: "Confirm or upload NEPA Assist results if auto fetch fails",
    build: buildNepaAssistPayload
  },
  {
    title: "Confirm or upload IPaC results if auto fetch fails",
    build: buildIpacPayload
  },
  {
    title: "Provide permit applicability notes",
    build: buildPermitNotesPayload
  },
  {
    title: "Enter CE references and rationale",
    build: buildCategoricalExclusionPayload
  },
  {
    title: "List applicable conditions and notes",
    build: buildConditionsPayload
  },
  {
    title: "Provide resource-by-resource notes",
    build: buildResourceNotesPayload
  }
]

function buildDecisionPayloadRecords({
  processInstanceId,
  timestamp,
  projectRecord,
  decisionElements,
  geospatialResults,
  permittingChecklist,
  formData
}: BuildDecisionPayloadRecordsArgs): Array<Record<string, unknown>> {
  const records: Array<Record<string, unknown>> = []

  for (const builder of DECISION_ELEMENT_BUILDERS) {
    const element = decisionElements.get(builder.title)
    if (!element) {
      console.warn(
        `Skipping decision payload for "${builder.title}" because the decision element is not configured.`
      )
      continue
    }

    const data = builder.build({
      elementId: element.id,
      projectRecord,
      geospatialResults,
      permittingChecklist,
      formData
    })

    records.push(
      stripUndefined({
        process_instance: processInstanceId,
        decision_element: element.id,
        data_source_system: DATA_SOURCE_SYSTEM,
        last_updated: timestamp,
        retrieved_timestamp: timestamp,
        data
      })
    )
  }

  return records
}

function buildProjectDetailsPayload({
  elementId,
  projectRecord
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const hasDetails = hasAnyKeys(projectRecord)
  return stripUndefined({
    id: elementId,
    project: hasDetails ? projectRecord : null
  })
}

function buildNepaAssistPayload({
  elementId,
  geospatialResults
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const nepassist = geospatialResults.nepassist
  const raw = nepassist ? emptyToNull(nepassist.raw) : null
  const summary = nepassist ? emptyToNull(nepassist.summary) : null

  return stripUndefined({
    id: elementId,
    nepa_assist_raw: raw,
    nepa_assist_summary: summary
  })
}

function buildIpacPayload({
  elementId,
  geospatialResults
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const ipac = geospatialResults.ipac
  const raw = ipac ? emptyToNull(ipac.raw) : null
  const summary = ipac ? emptyToNull(ipac.summary) : null

  return stripUndefined({
    id: elementId,
    ipac_raw: raw,
    ipac_summary: summary
  })
}

function buildPermitNotesPayload({
  elementId,
  permittingChecklist,
  formData
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const permits = permittingChecklist
    .map((item) =>
      stripUndefined({
        label: normalizeString(item.label) ?? item.label,
        completed: item.completed,
        notes: normalizeString(item.notes),
        source: item.source
      })
    )
    .filter((entry) => hasAnyKeys(entry))

  const notes = normalizeString(formData.other)

  return stripUndefined({
    id: elementId,
    permits: permits.length > 0 ? permits : null,
    notes
  })
}

function buildCategoricalExclusionPayload({
  elementId,
  formData
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const candidates = parseDelimitedList(formData.nepa_categorical_exclusion_code)
  const rationale = buildCategoricalRationale(formData)

  return stripUndefined({
    id: elementId,
    ce_candidates: candidates.length > 0 ? candidates : null,
    rationale
  })
}

function buildCategoricalRationale(formData: ProjectFormData): string | null {
  const sections: string[] = []

  const extraordinary = normalizeString(formData.nepa_extraordinary_circumstances)
  if (extraordinary) {
    sections.push(extraordinary)
  }

  const conformance = normalizeString(formData.nepa_conformance_conditions)
  if (conformance && !sections.includes(conformance)) {
    sections.push(conformance)
  }

  if (sections.length === 0) {
    return null
  }

  return sections.join("\n\n")
}

function buildConditionsPayload({
  elementId,
  formData
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const conditions = parseDelimitedList(formData.nepa_conformance_conditions)
  const notes = normalizeString(formData.nepa_extraordinary_circumstances)

  return stripUndefined({
    id: elementId,
    conditions: conditions.length > 0 ? conditions : null,
    notes
  })
}

function buildResourceNotesPayload({
  elementId,
  geospatialResults
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const resources = buildResourceEntries(geospatialResults)
  const summary = buildResourceSummary(geospatialResults)

  return stripUndefined({
    id: elementId,
    resources: resources.length > 0 ? resources : null,
    summary
  })
}

function hasAnyKeys(value: Record<string, unknown> | null | undefined): boolean {
  if (!value) {
    return false
  }
  return Object.keys(value).length > 0
}

function emptyToNull<T>(value: T | null | undefined): T | null {
  if (value === null || typeof value === "undefined") {
    return null
  }
  if (typeof value === "string") {
    return normalizeString(value) as T | null
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? (value as T) : null
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0 ? (value as T) : null
  }
  return value
}

function parseDelimitedList(value?: string | null): string[] {
  const normalized = normalizeString(value)
  if (!normalized) {
    return []
  }
  return normalized
    .split(/[\r\n;,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function buildResourceEntries(results: GeospatialResultsState): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = []

  const nepassist = results.nepassist
  if (shouldIncludeService(nepassist)) {
    entries.push(
      stripUndefined({
        name: "NEPA Assist",
        status: nepassist?.status,
        summary: emptyToNull(nepassist?.summary),
        error: normalizeString(nepassist?.error),
        meta: isNonEmptyObject(nepassist?.meta) ? nepassist?.meta : undefined
      })
    )
  }

  const ipac = results.ipac
  if (shouldIncludeService(ipac)) {
    entries.push(
      stripUndefined({
        name: "IPaC",
        status: ipac?.status,
        summary: emptyToNull(ipac?.summary),
        error: normalizeString(ipac?.error),
        meta: isNonEmptyObject(ipac?.meta) ? ipac?.meta : undefined
      })
    )
  }

  return entries
}

function buildResourceSummary(results: GeospatialResultsState): string | null {
  const sections: string[] = []

  if (results.lastRunAt) {
    const date = new Date(results.lastRunAt)
    const formatted = Number.isNaN(date.getTime()) ? results.lastRunAt : date.toLocaleString()
    sections.push(`Last screening run: ${formatted}`)
  }

  const nepaStatus = formatServiceStatus("NEPA Assist", results.nepassist)
  if (nepaStatus) {
    sections.push(nepaStatus)
  }

  const ipacStatus = formatServiceStatus("IPaC", results.ipac)
  if (ipacStatus) {
    sections.push(ipacStatus)
  }

  if (Array.isArray(results.messages) && results.messages.length > 0) {
    sections.push(results.messages.join("\n"))
  }

  if (!sections.length) {
    return null
  }

  return sections.join("\n\n")
}

function shouldIncludeService(service?: GeospatialServiceState<unknown>): boolean {
  if (!service) {
    return false
  }

  if (service.status && service.status !== "idle") {
    return true
  }

  if (service.summary !== undefined && service.summary !== null) {
    if (Array.isArray(service.summary)) {
      if (service.summary.length > 0) {
        return true
      }
    } else if (typeof service.summary === "object") {
      if (isNonEmptyObject(service.summary)) {
        return true
      }
    } else {
      return true
    }
  }

  if (service.raw !== undefined && service.raw !== null) {
    return true
  }

  if (service.error) {
    return true
  }

  if (service.meta && isNonEmptyObject(service.meta)) {
    return true
  }

  return false
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return Object.keys(value as Record<string, unknown>).length > 0
}

function formatServiceStatus(
  name: string,
  service: GeospatialServiceState<unknown> | undefined
): string | null {
  if (!service) {
    return null
  }

  switch (service.status) {
    case "success":
      return `${name}: results available`
    case "error": {
      const detail = normalizeString(service.error)
      return detail ? `${name}: ${detail}` : `${name}: error`
    }
    case "loading":
      return `${name}: running`
    default:
      return null
  }
}

function buildProcessInstanceDescription(projectTitle: string | null): string {
  if (projectTitle && projectTitle.length > 0) {
    return `${projectTitle} ${PRE_SCREENING_TITLE_SUFFIX}`
  }
  return PRE_SCREENING_TITLE_SUFFIX
}

function determineProjectId(
  explicitId: number | undefined,
  payload: unknown
): number {
  if (typeof explicitId === "number" && Number.isFinite(explicitId)) {
    return explicitId
  }

  const derivedId = extractNumericId(payload)
  if (typeof derivedId === "number" && Number.isFinite(derivedId)) {
    return derivedId
  }

  throw new ProjectPersistenceError("Supabase response did not include a project identifier.")
}

function extractNumericId(payload: unknown): number | undefined {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const id = extractNumericId(entry)
      if (typeof id === "number") {
        return id
      }
    }
    return undefined
  }

  if (payload && typeof payload === "object") {
    const candidate = (payload as Record<string, unknown>).id
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate
    }
  }

  return undefined
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function extractErrorDetail(responseText: string): string | undefined {
  if (!responseText) {
    return undefined
  }

  const parsed = safeJsonParse(responseText)
  if (parsed && typeof parsed === "object" && "message" in parsed) {
    const message = (parsed as { message?: unknown }).message
    if (typeof message === "string") {
      return message
    }
  }

  if (parsed && typeof parsed === "object") {
    try {
      return JSON.stringify(parsed)
    } catch {
      // ignore JSON stringify errors and fall back to raw text
    }
  }

  return responseText
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeNumber(value: number | undefined): number | null {
  if (typeof value !== "number") {
    return null
  }

  return Number.isFinite(value) ? value : null
}

function normalizeContact(contact?: ProjectContact | null): ProjectContact | null {
  if (!contact || typeof contact !== "object") {
    return null
  }

  const normalized: ProjectContact = {}

  const name = normalizeString(contact.name)
  if (name) {
    normalized.name = name
  }

  const organization = normalizeString(contact.organization)
  if (organization) {
    normalized.organization = organization
  }

  const email = normalizeString(contact.email)
  if (email) {
    normalized.email = email
  }

  const phone = normalizeString(contact.phone)
  if (phone) {
    normalized.phone = phone
  }

  return Object.keys(normalized).length > 0 ? normalized : null
}

type LocationParseResult = {
  value: unknown | null
  raw?: string
}

function parseLocationObject(value: string | undefined): LocationParseResult {
  const normalized = normalizeString(value)
  if (!normalized) {
    return { value: null }
  }

  try {
    const parsed = JSON.parse(normalized)
    if (parsed && typeof parsed === "object") {
      return { value: parsed }
    }
    return { value: parsed }
  } catch {
    return { value: null, raw: value }
  }
}

function buildOtherPayload(
  formData: ProjectFormData,
  geospatialResults: GeospatialResultsState,
  locationResult: LocationParseResult
): Record<string, unknown> | null {
  const other: Record<string, unknown> = {}

  const notes = normalizeString(formData.other)
  if (notes) {
    other.notes = notes
  }

  if (hasMeaningfulGeospatialResults(geospatialResults)) {
    other.geospatial = {
      lastRunAt: normalizeString(geospatialResults.lastRunAt) ?? undefined,
      messages: Array.isArray(geospatialResults.messages) && geospatialResults.messages.length > 0
        ? geospatialResults.messages
        : undefined,
      nepassist: sanitizeGeospatialService(geospatialResults.nepassist),
      ipac: sanitizeGeospatialService(geospatialResults.ipac)
    }
  }

  if (locationResult.raw) {
    other.invalidLocationObject = locationResult.raw
  }

  return Object.keys(other).length > 0 ? other : null
}

function hasMeaningfulGeospatialResults(results: GeospatialResultsState): boolean {
  if (results.lastRunAt) {
    return true
  }

  if (Array.isArray(results.messages) && results.messages.length > 0) {
    return true
  }

  const nepassist = results.nepassist
  if (nepassist.status !== "idle") {
    return true
  }

  if (Array.isArray(nepassist.summary) && nepassist.summary.length > 0) {
    return true
  }

  if (nepassist.error) {
    return true
  }

  const ipac = results.ipac
  if (ipac.status !== "idle") {
    return true
  }

  if (ipac.summary) {
    return true
  }

  if (ipac.error) {
    return true
  }

  return false
}

function sanitizeGeospatialService<T>(service: GeospatialServiceState<T>): GeospatialServiceState<T> {
  const sanitized: GeospatialServiceState<T> = { status: service.status }

  if (typeof service.summary !== "undefined") {
    sanitized.summary = service.summary
  }

  if (typeof service.error === "string" && service.error.length > 0) {
    sanitized.error = service.error
  }

  if (service.meta && Object.keys(service.meta).length > 0) {
    sanitized.meta = service.meta
  }

  return sanitized
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "undefined") {
      continue
    }
    result[key] = entry
  }
  return result as T
}
