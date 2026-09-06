import {
  fetchPublishedAnalytics,
  fetchPublishedCatalog,
  fetchPublishedProjectProgress
} from "./publishedIntegration"
import type { ProjectContact, ProjectFormData } from "../schema/projectSchema"
import type { GeospatialResultsState } from "../types/geospatial"
import { getPermitflowAnonKey, getPermitflowTenantId, getPermitflowUrl } from "../runtimeConfig"
import {
  ProjectPersistenceError,
  type DecisionElementRecord,
  type ProcessInformation,
  type ProjectProcessSummary,
  type ProjectSummary
} from "./projectPersistence"

type PermitflowFetchOptions = {
  supabaseUrl: string
  supabaseAnonKey: string
  tenantId: string
  accessToken?: string
}

type PermitflowAuthSession = {
  accessToken: string
  userId: string
  expiresIn?: number
  refreshToken?: string
}

type PermitflowProjectRow = {
  id?: number | string | null
  title?: string | null
  last_updated?: string | null
  current_status?: string | null
  other?: unknown
}

type PermitflowProcessInstanceRow = {
  id?: number | null
  parent_project_id?: number | null
  description?: string | null
  last_updated?: string | null
  created_at?: string | null
  process_model?: number | null
  status?: string | null
}


type PermitflowDecisionPayloadRow = {
  id?: number | null
  process_decision_element?: number | null
  process?: number | null
  project?: number | null
  evaluation_data?: unknown
  result_notes?: string | null
  result_bool?: boolean | null
}

export const ROW_AUTHORIZATION_LABEL = "Right of Way Authorization"
// PermitFast's title for this process model — the phased digitization of Standard Form 299.
// Resolve by title at runtime; numeric process model IDs are not stable across environments.
const SF299_PROCESS_MODEL_TITLE = "Basic Permit (SF-299)"
const SF299_PROCESS_MODEL_FALLBACK_ID = 3
// SF-299 section ordering, keyed by decision_element.process_model_internal_reference_id.
export const SF299_SECTION_REFERENCE_IDS = [
  "sf299-v2-project-info",
  "sf299-v2-applicant-info",
  "sf299-v2-row-description",
  "sf299-v2-location-survey",
  "sf299-v2-agency-context",
  "sf299-v2-tech-financial",
  "sf299-v2-alternatives",
  "sf299-v2-population-social",
  "sf299-v2-environmental",
  "sf299-v2-fish-wildlife-hazmat",
  "sf299-v2-certification"
] as const
const SF299_PROJECT_INFO_REFERENCE_ID = "sf299-v2-project-info"
const SF299_LOCATION_SURVEY_REFERENCE_ID = "sf299-v2-location-survey"
const PERMIT_DOCUMENTS_BUCKET = "permit-documents"
const TENANT_ID_COLUMN = "tenant_id"
const permitflowProcessModelIdCache = new Map<string, number>()
const permitflowSectionElementsCache = new Map<string, DecisionElementRecord[]>()
const PORTAL_SOURCE_KEY = "_project_portal"
const PORTAL_SOURCE_ID_KEY = "source_project_id"

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

function parseNumericId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function normalizeString(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeNumber(value?: number | null): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }
  return value
}

function normalizeContact(value?: ProjectContact): ProjectContact | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const contact: ProjectContact = {
    name: normalizeString(value.name),
    organization: normalizeString(value.organization),
    email: normalizeString(value.email),
    phone: normalizeString(value.phone)
  }

  return Object.values(contact).some((entry) => entry !== undefined) ? contact : undefined
}

function normalizeTitle(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseTimestampMillis(value?: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? undefined : timestamp
}

function compareByTimestampDesc(a?: string | null, b?: string | null): number {
  const aTime = parseTimestampMillis(a)
  const bTime = parseTimestampMillis(b)
  if (typeof aTime === "number" && typeof bTime === "number") {
    return bTime - aTime
  }
  if (typeof aTime === "number") {
    return -1
  }
  if (typeof bTime === "number") {
    return 1
  }
  if (a && b) {
    return b.localeCompare(a)
  }
  if (a) {
    return -1
  }
  if (b) {
    return 1
  }
  return 0
}



async function resolveSf299ProcessModelId(options: PermitflowFetchOptions): Promise<number> {
  const cacheKey = `${options.supabaseUrl}::${options.tenantId}`
  const cached = permitflowProcessModelIdCache.get(cacheKey)
  if (typeof cached === "number") {
    return cached
  }

  const rows = await fetchPermitflowList<{ id?: number | string | null }>(
    options,
    "/rest/v1/process_model",
    (endpoint) => {
      endpoint.searchParams.set("select", "id,title")
      endpoint.searchParams.set("title", `eq.${SF299_PROCESS_MODEL_TITLE}`)
      endpoint.searchParams.set("limit", "1")
    }
  )

  let resolvedId = parseNumericId(rows[0]?.id)

  if (typeof resolvedId !== "number") {
    // Numeric IDs are not stable across environments; use the known live-tenant ID only as
    // a fallback when the title lookup finds nothing.
    const fallbackRows = await fetchPermitflowList<{ id?: number | string | null }>(
      options,
      "/rest/v1/process_model",
      (endpoint) => {
        endpoint.searchParams.set("select", "id,title")
        endpoint.searchParams.set("id", `eq.${SF299_PROCESS_MODEL_FALLBACK_ID}`)
        endpoint.searchParams.set("limit", "1")
      }
    )
    resolvedId = parseNumericId(fallbackRows[0]?.id)
  }

  if (typeof resolvedId !== "number") {
    throw new ProjectPersistenceError(
      `PermitFast process model "${SF299_PROCESS_MODEL_TITLE}" was not found.`
    )
  }

  permitflowProcessModelIdCache.set(cacheKey, resolvedId)
  return resolvedId
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined)
  return Object.fromEntries(entries) as T
}

function normalizeObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}


function sf299SectionOrder(element: DecisionElementRecord): number {
  const referenceId = normalizeString(element.processModelInternalReferenceId)
  const index = referenceId
    ? (SF299_SECTION_REFERENCE_IDS as readonly string[]).indexOf(referenceId)
    : -1
  return index === -1 ? SF299_SECTION_REFERENCE_IDS.length : index
}

function sortSf299SectionElements(elements: DecisionElementRecord[]): DecisionElementRecord[] {
  return [...elements].sort((a, b) => {
    const orderDelta = sf299SectionOrder(a) - sf299SectionOrder(b)
    return orderDelta !== 0 ? orderDelta : a.id - b.id
  })
}

async function resolveSf299SectionElements(
  options: PermitflowFetchOptions,
  processModelId: number
): Promise<DecisionElementRecord[]> {
  const cacheKey = `${options.supabaseUrl}::${options.tenantId}::${processModelId}`
  const cached = permitflowSectionElementsCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const elements = sortSf299SectionElements(await fetchDecisionElements(options, processModelId))
  if (elements.length === 0) {
    throw new ProjectPersistenceError(
      "PermitFast returned no decision elements for the SF-299 process model."
    )
  }

  permitflowSectionElementsCache.set(cacheKey, elements)
  return elements
}

function getSchemaProperties(schema: unknown): Record<string, unknown> | undefined {
  const schemaRecord = normalizeObjectRecord(schema)
  return schemaRecord ? normalizeObjectRecord(schemaRecord.properties) : undefined
}

function getOneOfConstValues(property: unknown): unknown[] | undefined {
  const propertyRecord = normalizeObjectRecord(property)
  const oneOf = propertyRecord?.oneOf
  if (!Array.isArray(oneOf) || oneOf.length === 0) {
    return undefined
  }
  const values = oneOf
    .map((option) => normalizeObjectRecord(option)?.const)
    .filter((value) => value !== undefined)
  return values.length > 0 ? values : undefined
}

function isBooleanProperty(property: unknown): boolean {
  return normalizeObjectRecord(property)?.type === "boolean"
}

const SUPPLEMENTAL_ENTITY_TYPES = new Set(["corporation", "partnership"])

/**
 * Enforce the SF-299 `evaluation_data` encodings before writing a section payload:
 * - `oneOf`/`const` selects must store a valid `const` value; empty strings and unknown
 *   values are omitted (an empty string fails PermitFast's `oneOf` validation).
 * - boolean fields must be real booleans.
 * - `suppl_*` supplemental fields only apply when `entity_type` is corporation/partnership.
 * Keys not described by the schema pass through untouched.
 */
export function sanitizeEvaluationDataForSchema(
  schema: unknown,
  data: Record<string, unknown>
): Record<string, unknown> {
  const properties = getSchemaProperties(schema)
  const entityTypeValue = typeof data.entity_type === "string" ? data.entity_type : undefined
  const supplementalApplies =
    !properties?.entity_type ||
    (typeof entityTypeValue === "string" && SUPPLEMENTAL_ENTITY_TYPES.has(entityTypeValue))

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue
    }
    if (key.startsWith("suppl_") && !supplementalApplies) {
      continue
    }
    const property = properties?.[key]
    if (!property) {
      sanitized[key] = value
      continue
    }
    const constValues = getOneOfConstValues(property)
    if (constValues) {
      if (constValues.includes(value)) {
        sanitized[key] = value
      }
      continue
    }
    if (isBooleanProperty(property)) {
      if (typeof value === "boolean") {
        sanitized[key] = value
      }
      continue
    }
    sanitized[key] = value
  }
  return sanitized
}

const GEOJSON_GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon"
])

function extractGeoJsonGeometry(value: unknown): Record<string, unknown> | undefined {
  const record = normalizeObjectRecord(value)
  if (!record) {
    return undefined
  }
  if (record.type === "Feature") {
    return extractGeoJsonGeometry(record.geometry)
  }
  if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
    return extractGeoJsonGeometry(record.features[0])
  }
  if (
    typeof record.type === "string" &&
    GEOJSON_GEOMETRY_TYPES.has(record.type) &&
    Array.isArray(record.coordinates)
  ) {
    return record
  }
  return undefined
}

/**
 * Project the portal's screening state onto PermitFast's `properties.screening` shape:
 * per-service status + summary only. Raw payloads, meta, the environmental map, and
 * messages are deliberately omitted — PermitFast ignores them and the raw responses run
 * to hundreds of KB.
 */
export function buildLocationMapScreening(
  results?: GeospatialResultsState
): Record<string, unknown> | undefined {
  if (!results) {
    return undefined
  }
  const ipacSummary = results.ipac?.summary
  const nepassistSummary = results.nepassist?.summary
  if (!ipacSummary && !nepassistSummary) {
    return undefined
  }
  return stripUndefined({
    lastRunAt: normalizeString(results.lastRunAt),
    ipac: ipacSummary ? { status: results.ipac.status, summary: ipacSummary } : undefined,
    nepassist: nepassistSummary
      ? { status: results.nepassist.status, summary: nepassistSummary }
      : undefined
  })
}

/**
 * Build the SF-299 `location_map` value: a JSON-stringified GeoJSON Feature. The geometry
 * comes from the portal's stored GeoJSON (`location_object`; Feature/FeatureCollection
 * wrappers unwrapped), falling back to a Point from `location_lat`/`location_lon`.
 * Screening summaries travel in `properties.screening`.
 */
export function buildLocationMapFeature(
  formData: ProjectFormData,
  geospatialResults?: GeospatialResultsState
): string | undefined {
  let geometry: Record<string, unknown> | undefined
  const locationObject = normalizeString(formData.location_object)
  if (locationObject) {
    geometry = extractGeoJsonGeometry(safeJsonParse(locationObject))
  }
  if (!geometry) {
    const lat = normalizeNumber(formData.location_lat)
    const lon = normalizeNumber(formData.location_lon)
    if (typeof lat === "number" && typeof lon === "number") {
      geometry = { type: "Point", coordinates: [lon, lat] }
    }
  }
  if (!geometry) {
    return undefined
  }

  return JSON.stringify({
    type: "Feature",
    geometry,
    properties: stripUndefined({
      zoom: 12,
      screening: buildLocationMapScreening(geospatialResults)
    })
  })
}

/**
 * Seed a section's initial `evaluation_data` from the portal project profile. Only fields
 * that the section's `form_data` schema actually declares are written — the schema is the
 * contract and its field names can change over time.
 */
function seedSf299SectionEvaluationData(
  element: DecisionElementRecord,
  formData: ProjectFormData,
  geospatialResults?: GeospatialResultsState
): Record<string, unknown> {
  const referenceId = normalizeString(element.processModelInternalReferenceId)
  const properties = getSchemaProperties(element.formData)
  if (!properties) {
    return {}
  }

  const candidates: Record<string, unknown> = {}
  if (referenceId === SF299_PROJECT_INFO_REFERENCE_ID) {
    Object.assign(candidates, {
      title: normalizeString(formData.title),
      project_title: normalizeString(formData.title),
      description: normalizeString(formData.description),
      project_description: normalizeString(formData.description),
      sector: normalizeString(formData.sector),
      lead_agency: normalizeString(formData.lead_agency),
      location_text: normalizeString(formData.location_text),
      location_description: normalizeString(formData.location_text)
    })
  } else if (referenceId === SF299_LOCATION_SURVEY_REFERENCE_ID) {
    candidates.location_map = buildLocationMapFeature(formData, geospatialResults)
  }

  const seeded: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== undefined && properties[key]) {
      seeded[key] = value
    }
  }
  return sanitizeEvaluationDataForSchema(element.formData, seeded)
}

function buildPermitflowProjectPayload(
  formData: ProjectFormData,
  userId?: string,
  portalProjectId?: number,
  existingOther?: unknown
): Record<string, unknown> {
  const timestamp = new Date().toISOString()
  const existingOtherRecord = normalizeObjectRecord(existingOther) ?? {}
  const existingPortalSource = normalizeObjectRecord(existingOtherRecord[PORTAL_SOURCE_KEY]) ?? {}

  const other = stripUndefined({
    ...existingOtherRecord,
    nepa_categorical_exclusion_code: normalizeString(formData.nepa_categorical_exclusion_code),
    nepa_conformance_conditions: normalizeString(formData.nepa_conformance_conditions),
    nepa_extraordinary_circumstances: normalizeString(formData.nepa_extraordinary_circumstances),
    additional_notes: normalizeString(formData.other),
    applicant_user_id: normalizeString(userId),
    [PORTAL_SOURCE_KEY]:
      typeof portalProjectId === "number"
        ? { ...existingPortalSource, [PORTAL_SOURCE_ID_KEY]: portalProjectId }
        : Object.keys(existingPortalSource).length > 0
          ? existingPortalSource
          : undefined
  })

  return stripUndefined({
    title: normalizeString(formData.title),
    description: normalizeString(formData.description),
    sector: normalizeString(formData.sector),
    lead_agency: normalizeString(formData.lead_agency),
    participating_agencies: normalizeString(formData.participating_agencies),
    sponsor: normalizeString(formData.sponsor),
    funding: normalizeString(formData.funding),
    location_text: normalizeString(formData.location_text),
    location_lat: normalizeNumber(formData.location_lat),
    location_lon: normalizeNumber(formData.location_lon),
    location_object: normalizeString(formData.location_object),
    sponsor_contact: normalizeContact(formData.sponsor_contact),
    other: Object.keys(other).length > 0 ? other : undefined,
    current_status: "draft",
    data_source_system: "project-portal",
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })
}

async function fetchPermitflowList<T>(
  { supabaseUrl, supabaseAnonKey, tenantId, accessToken }: PermitflowFetchOptions,
  path: string,
  configure?: (endpoint: URL) => void
): Promise<T[]> {
  const endpoint = new URL(path, supabaseUrl)
  if (configure) {
    configure(endpoint)
  }
  applyTenantFilter(endpoint, tenantId)

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
      Accept: "application/json"
    }
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast request failed (${response.status}): ${errorDetail}`
        : `PermitFast request failed (${response.status}).`
    )
  }

  if (!responseText) {
    return []
  }

  const payload = safeJsonParse(responseText)
  if (!Array.isArray(payload)) {
    return []
  }

  return payload as T[]
}

async function resolvePermitflowProjectByPortalProjectId(
  options: PermitflowFetchOptions,
  portalProjectId: number
): Promise<PermitflowProjectRow | undefined> {
  if (!Number.isFinite(portalProjectId)) {
    return undefined
  }

  const linkedRows = await fetchPermitflowList<PermitflowProjectRow>(
    options,
    "/rest/v1/project",
    (endpoint) => {
      endpoint.searchParams.set("select", "id,title,last_updated,current_status,other")
      endpoint.searchParams.set(
        `other->${PORTAL_SOURCE_KEY}->>${PORTAL_SOURCE_ID_KEY}`,
        `eq.${portalProjectId}`
      )
      endpoint.searchParams.set("limit", "1")
    }
  )
  if (linkedRows.length > 0) {
    return linkedRows[0]
  }

  const migrationRows = await fetchPermitflowList<PermitflowProjectRow>(
    options,
    "/rest/v1/project",
    (endpoint) => {
      endpoint.searchParams.set("select", "id,title,last_updated,current_status,other")
      endpoint.searchParams.set("other->_permitflow_migration->>source_id", `eq.${portalProjectId}`)
      endpoint.searchParams.set("limit", "1")
    }
  )
  if (migrationRows.length > 0) {
    return migrationRows[0]
  }

  // Legacy fallback where project IDs were reused across systems.
  const legacyRows = await fetchPermitflowList<PermitflowProjectRow>(
    options,
    "/rest/v1/project",
    (endpoint) => {
      endpoint.searchParams.set("select", "id,title,last_updated,current_status,other")
      endpoint.searchParams.set("id", `eq.${portalProjectId}`)
      endpoint.searchParams.set("limit", "1")
    }
  )
  return legacyRows[0]
}

function applyTenantFilter(endpoint: URL, tenantId: string) {
  if (!endpoint.pathname.startsWith("/rest/v1/")) {
    return
  }
  if (!endpoint.searchParams.has(TENANT_ID_COLUMN)) {
    endpoint.searchParams.set(TENANT_ID_COLUMN, `eq.${tenantId}`)
  }
}

function withTenantId(
  payload: Record<string, unknown>,
  tenantId: string
): Record<string, unknown> {
  if (typeof payload[TENANT_ID_COLUMN] === "string" && String(payload[TENANT_ID_COLUMN]).trim()) {
    return payload
  }
  return { ...payload, [TENANT_ID_COLUMN]: tenantId }
}

function withTenantIdBatch(
  payloads: Record<string, unknown>[],
  tenantId: string
): Record<string, unknown>[] {
  return payloads.map((payload) => withTenantId(payload, tenantId))
}



async function fetchDecisionElements(
  options: PermitflowFetchOptions,
  processModelId: number
): Promise<DecisionElementRecord[]> {
  const parseOptionalString = (value: unknown): string | null =>
    typeof value === "string" ? value : null
  const parseOptionalBoolean = (value: unknown): boolean | null =>
    typeof value === "boolean" ? value : null
  const parseOptionalNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value.trim())
      return Number.isFinite(parsed) ? parsed : null
    }

    return null
  }

  const parseDecisionElementRecord = (entry: unknown): DecisionElementRecord | undefined => {
    if (!entry || typeof entry !== "object") {
      return undefined
    }

    const raw = entry as Record<string, unknown>
    const id = parseNumericId(raw.id)

    if (typeof id !== "number") {
      return undefined
    }

    return {
      id,
      createdAt: parseOptionalString(raw.created_at),
      processModelId: parseNumericId(raw.process_model) ?? null,
      legalStructureId: parseNumericId(raw.legal_structure_id) ?? null,
      title: parseOptionalString(raw.title),
      description: parseOptionalString(raw.description),
      measure: parseOptionalString(raw.measure),
      threshold: parseOptionalNumber(raw.threshold),
      spatial: parseOptionalBoolean(raw.spatial),
      intersect: parseOptionalBoolean(raw.intersect),
      spatialReference: raw.spatial_reference ?? null,
      formText: parseOptionalString(raw.form_text),
      formResponseDescription: parseOptionalString(raw.form_response_desc),
      formData: raw.form_data ?? null,
      evaluationMethod: parseOptionalString(raw.evaluation_method),
      evaluationDmn: raw.evaluation_dmn ?? null,
      category: parseOptionalString(raw.category),
      processModelInternalReferenceId: parseOptionalString(
        raw.process_model_internal_reference_id
      ),
      parentDecisionElementId: parseNumericId(raw.parent_decision_element_id) ?? null,
      other: raw.other ?? null,
      expectedEvaluationData: raw.expected_evaluation_data ?? null,
      responseData: raw.response_data ?? null,
      recordOwnerAgency: parseOptionalString(raw.record_owner_agency),
      dataSourceAgency: parseOptionalString(raw.data_source_agency),
      dataSourceSystem: parseOptionalString(raw.data_source_system),
      dataRecordVersion: parseOptionalString(raw.data_record_version),
      lastUpdated: parseOptionalString(raw.last_updated),
      retrievedTimestamp: parseOptionalString(raw.retrieved_timestamp)
    }
  }

  const rows = await fetchPermitflowList<Record<string, unknown>>(
    options,
    "/rest/v1/decision_element",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        [
          "id",
          "created_at",
          "process_model",
          "legal_structure_id",
          "title",
          "description",
          "measure",
          "threshold",
          "spatial",
          "intersect",
          "spatial_reference",
          "form_text",
          "form_response_desc",
          "form_data",
          "evaluation_method",
          "evaluation_dmn",
          "category",
          "process_model_internal_reference_id",
          "parent_decision_element_id",
          "other",
          "expected_evaluation_data",
          "response_data",
          "record_owner_agency",
          "data_source_agency",
          "data_source_system",
          "data_record_version",
          "last_updated",
          "retrieved_timestamp"
        ].join(",")
      )
      endpoint.searchParams.set("process_model", `eq.${processModelId}`)
    }
  )

  const elements: DecisionElementRecord[] = []
  for (const entry of rows) {
    const record = parseDecisionElementRecord(entry)
    if (record) {
      elements.push(record)
    }
  }

  return elements
}

export async function loadPermitflowProcessInformation(): Promise<ProcessInformation> {
  const info = await fetchPublishedCatalog("permitflow")
  if (!info) {
    throw new ProjectPersistenceError(
      "The PermitFast published catalog is unavailable. Check portal_published_integration_catalog."
    )
  }
  return info
}

export async function authenticatePermitflowUser({
  email,
  password
}: {
  email: string
  password: string
}): Promise<PermitflowAuthSession> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL and PERMITFLOW_SUPABASE_ANON_KEY."
    )
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({ email, password })
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast authentication failed (${response.status}): ${errorDetail}`
        : `PermitFast authentication failed (${response.status}).`
    )
  }

  const payload = responseText ? safeJsonParse(responseText) : undefined
  if (!payload || typeof payload !== "object") {
    throw new ProjectPersistenceError("PermitFast authentication response was empty.")
  }

  const accessToken =
    typeof (payload as Record<string, unknown>).access_token === "string"
      ? ((payload as Record<string, unknown>).access_token as string)
      : undefined
  const refreshToken =
    typeof (payload as Record<string, unknown>).refresh_token === "string"
      ? ((payload as Record<string, unknown>).refresh_token as string)
      : undefined
  const expiresIn =
    typeof (payload as Record<string, unknown>).expires_in === "number"
      ? ((payload as Record<string, unknown>).expires_in as number)
      : undefined
  const user =
    (payload as Record<string, unknown>).user &&
    typeof (payload as Record<string, unknown>).user === "object"
      ? ((payload as Record<string, unknown>).user as Record<string, unknown>)
      : undefined
  const userId = user && typeof user.id === "string" ? user.id : undefined

  if (!accessToken || !userId) {
    throw new ProjectPersistenceError(
      "PermitFast authentication response was missing required fields."
    )
  }

  return {
    accessToken,
    userId,
    expiresIn,
    refreshToken
  }
}

type PermitflowSubmitResult = {
  projectId: number
  processInstanceId: number
}

async function patchPermitflowProjectById({
  supabaseUrl,
  supabaseAnonKey,
  tenantId,
  accessToken,
  projectId,
  payload
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  tenantId: string
  accessToken: string
  projectId: number
  payload: Record<string, unknown>
}): Promise<void> {
  const endpoint = new URL("/rest/v1/project", supabaseUrl)
  endpoint.searchParams.set("id", `eq.${projectId}`)
  endpoint.searchParams.set(TENANT_ID_COLUMN, `eq.${tenantId}`)

  const response = await fetch(endpoint.toString(), {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast update failed (${response.status}): ${errorDetail}`
        : `PermitFast update failed (${response.status}).`
    )
  }
}

async function createPermitflowRecord<T>(
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken: string,
  tenantId: string,
  table: string,
  payload: Record<string, unknown>,
  options?: { upsert?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    Prefer: options?.upsert
      ? "resolution=merge-duplicates,return=representation"
      : "return=representation"
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(withTenantId(payload, tenantId))
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast ${table} creation failed (${response.status}): ${errorDetail}`
        : `PermitFast ${table} creation failed (${response.status}).`
    )
  }

  const parsed = responseText ? safeJsonParse(responseText) : undefined
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed[0] as T
  }
  if (parsed && typeof parsed === "object") {
    return parsed as T
  }
  throw new ProjectPersistenceError(`PermitFast ${table} creation returned empty response.`)
}

async function createPermitflowRecordsBatch<T>(
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken: string,
  tenantId: string,
  table: string,
  payloads: Record<string, unknown>[]
): Promise<T[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(withTenantIdBatch(payloads, tenantId))
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast ${table} batch creation failed (${response.status}): ${errorDetail}`
        : `PermitFast ${table} batch creation failed (${response.status}).`
    )
  }

  const parsed = responseText ? safeJsonParse(responseText) : undefined
  if (Array.isArray(parsed)) {
    return parsed as T[]
  }
  return []
}

export async function submitPermitflowProject({
  formData,
  accessToken,
  userId,
  geospatialResults
}: {
  formData: ProjectFormData
  accessToken: string
  userId: string
  geospatialResults?: GeospatialResultsState
}): Promise<PermitflowSubmitResult> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  const tenantId = getPermitflowTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL, PERMITFLOW_SUPABASE_ANON_KEY, and PERMITFLOW_TENANT_ID."
    )
  }

  const timestamp = new Date().toISOString()
  const options = { supabaseUrl, supabaseAnonKey, tenantId, accessToken }
  const sf299ProcessModelId = await resolveSf299ProcessModelId(options)
  const sectionElements = await resolveSf299SectionElements(options, sf299ProcessModelId)
  const portalProjectId = parseNumericId(formData.id)
  if (typeof portalProjectId !== "number") {
    throw new ProjectPersistenceError("A numeric portal project identifier is required.")
  }

  // Step 2: Create or update tenant-local project copy (never overwrite portal project PKs).
  const existingProject = await resolvePermitflowProjectByPortalProjectId(options, portalProjectId)
  let permitflowProjectId = parseNumericId(existingProject?.id)
  if (typeof permitflowProjectId === "number") {
    const projectPayload = buildPermitflowProjectPayload(
      formData,
      userId,
      portalProjectId,
      existingProject?.other
    )
    await patchPermitflowProjectById({
      supabaseUrl,
      supabaseAnonKey,
      tenantId,
      accessToken,
      projectId: permitflowProjectId,
      payload: projectPayload
    })
  } else {
    const projectPayload = buildPermitflowProjectPayload(formData, userId, portalProjectId)
    const projectResult = await createPermitflowRecord<{ id: number }>(
      supabaseUrl,
      supabaseAnonKey,
      accessToken,
      tenantId,
      "project",
      projectPayload
    )
    permitflowProjectId = parseNumericId(projectResult.id)
    if (typeof permitflowProjectId !== "number") {
      throw new ProjectPersistenceError("PermitFast project creation did not return a valid ID.")
    }
  }

  // Check if an SF-299 process_instance already exists for this project
  const existingProcesses = await fetchPermitflowList<{ id: number }>(
    options,
    "/rest/v1/process_instance",
    (endpoint) => {
      endpoint.searchParams.set("select", "id")
      endpoint.searchParams.set("parent_project_id", `eq.${permitflowProjectId}`)
      endpoint.searchParams.set("process_model", `eq.${sf299ProcessModelId}`)
      endpoint.searchParams.set("limit", "1")
    }
  )

  if (existingProcesses.length > 0) {
    // Process instance already exists, return early
    const existingId = parseNumericId(existingProcesses[0].id)
    if (typeof existingId === "number") {
      return { projectId: permitflowProjectId, processInstanceId: existingId }
    }
  }

  // Step 3: Create process_instance record
  const processInstancePayload = {
    parent_project_id: permitflowProjectId,
    process_model: sf299ProcessModelId,
    status: "draft",
    start_date: timestamp.split("T")[0]
  }
  const processResult = await createPermitflowRecord<{ id: number }>(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "process_instance",
    processInstancePayload
  )
  const processInstanceId = parseNumericId(processResult.id)
  if (typeof processInstanceId !== "number") {
    throw new ProjectPersistenceError(
      "PermitFast process instance creation did not return a valid ID."
    )
  }

  // Step 4: Create one process_decision_payload per SF-299 section. There is no auth
  // element — the applicant is linked via project.other.applicant_user_id. Sections the
  // portal can pre-fill are seeded from the project profile; the rest start empty and are
  // PATCHed as the applicant completes each phase.
  const seededSections = sectionElements.map((element) => ({
    element,
    evaluationData: seedSf299SectionEvaluationData(element, formData, geospatialResults)
  }))
  const decisionPayloads = seededSections.map(({ element, evaluationData }) => ({
    process_decision_element: element.id,
    process: processInstanceId,
    project: permitflowProjectId,
    evaluation_data: evaluationData
  }))
  await createPermitflowRecordsBatch(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "process_decision_payload",
    decisionPayloads
  )

  // Step 5: Create case_event records
  const caseEvents = [
    {
      parent_process_id: processInstanceId,
      name: "Project Started",
      description: `Permit application started for project: ${formData.title ?? "Untitled"}`,
      type: "project_started",
      status: "completed",
      source: "project-portal",
      datetime: timestamp
    },
    ...seededSections
      .filter(({ evaluationData }) => Object.keys(evaluationData).length > 0)
      .map(({ element }) => ({
        parent_process_id: processInstanceId,
        name: "Form Saved",
        description: `${normalizeTitle(element.title) ?? "Section"} form data saved`,
        type: "form_saved",
        status: "completed",
        source: "project-portal",
        datetime: timestamp
      }))
  ]
  await createPermitflowRecordsBatch(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "case_event",
    caseEvents
  )

  return { projectId: permitflowProjectId, processInstanceId }
}

export type PermitflowProjectStatus = {
  exists: boolean
  projectId: number
  title?: string
  lastUpdated?: string
  /** project.current_status — "returned" means a reviewer sent the application back. */
  currentStatus?: string
  rowAuthorizationProcess?: ProjectProcessSummary
}

export type PermitflowSectionFormState = {
  decisionElementId: number
  referenceId?: string
  title?: string
  description?: string
  formSchema?: unknown
  hasForm: boolean
  payloadId?: number
  evaluationData?: Record<string, unknown>
  /** Reviewer feedback for the returned/resubmit loop. */
  resultNotes?: string
  resultBool?: boolean
}

export type PermitflowCustomFormState = {
  exists: boolean
  projectId?: number
  processInstanceId?: number
  processStatus?: string
  projectCurrentStatus?: string
  sections: PermitflowSectionFormState[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasRenderableFormData(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  const properties = value.properties
  return isRecord(properties) && Object.keys(properties).length > 0
}

type Sf299SectionContext = {
  element: DecisionElementRecord
  payload?: PermitflowDecisionPayloadRow
}

async function resolveSf299FormContext(
  options: PermitflowFetchOptions,
  portalProjectId: number
): Promise<{
  permitflowProjectId: number
  processInstanceId: number
  processStatus?: string
  projectCurrentStatus?: string
  sections: Sf299SectionContext[]
}> {
  let permitflowProjectId: number | undefined
  let processInstanceId: number | undefined
  let processStatus: string | undefined
  let projectCurrentStatus: string | undefined
  let elements: DecisionElementRecord[]

  if (options.accessToken) {
    // Authenticated flows keep reading directly; migration 014 only closes anonymous reads.
    const sf299ProcessModelId = await resolveSf299ProcessModelId(options)
    const permitflowProject = await resolvePermitflowProjectByPortalProjectId(options, portalProjectId)
    permitflowProjectId = parseNumericId(permitflowProject?.id)
    if (typeof permitflowProjectId !== "number") {
      throw new ProjectPersistenceError(
        `PermitFast project for portal project ${portalProjectId} was not found. Submit it first.`
      )
    }

    const processRows = await fetchPermitflowList<PermitflowProcessInstanceRow>(
      options,
      "/rest/v1/process_instance",
      (endpoint) => {
        endpoint.searchParams.set("select", "id,status,last_updated,created_at")
        endpoint.searchParams.set("parent_project_id", `eq.${permitflowProjectId}`)
        endpoint.searchParams.set("process_model", `eq.${sf299ProcessModelId}`)
      }
    )
    processRows.sort((a, b) => compareByTimestampDesc(a.last_updated, b.last_updated))
    processInstanceId = parseNumericId(processRows[0]?.id)
    processStatus = normalizeString(processRows[0]?.status)
    projectCurrentStatus = normalizeString(permitflowProject?.current_status)
    elements = await resolveSf299SectionElements(options, sf299ProcessModelId)
  } else {
    // Anonymous: the published contract replaces direct project/process/catalog reads.
    const progress = await fetchPublishedProjectProgress("permitflow", [portalProjectId])
    const entry = progress.get(portalProjectId)
    permitflowProjectId = entry?.targetProjectId
    if (typeof permitflowProjectId !== "number") {
      throw new ProjectPersistenceError(
        `PermitFast project for portal project ${portalProjectId} was not found. Submit it first.`
      )
    }
    const process = entry?.processes[0]
    processInstanceId = process?.id
    processStatus = normalizeString(process?.status)
    projectCurrentStatus = normalizeString(entry?.currentStatus)

    const catalog = await fetchPublishedCatalog("permitflow")
    elements = sortSf299SectionElements(catalog?.decisionElements ?? [])
  }

  if (typeof processInstanceId !== "number") {
    throw new ProjectPersistenceError(
      `No ${ROW_AUTHORIZATION_LABEL} process instance was found for portal project ${portalProjectId}.`
    )
  }

  const payloadRows = await fetchPermitflowList<PermitflowDecisionPayloadRow>(
    options,
    "/rest/v1/process_decision_payload",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        "id,process_decision_element,process,project,evaluation_data,result_notes,result_bool"
      )
      endpoint.searchParams.set("process", `eq.${processInstanceId}`)
    }
  )
  const payloadsByElementId = new Map<number, PermitflowDecisionPayloadRow>()
  for (const row of payloadRows) {
    const elementId = parseNumericId(row.process_decision_element)
    if (typeof elementId === "number" && !payloadsByElementId.has(elementId)) {
      payloadsByElementId.set(elementId, row)
    }
  }

  return {
    permitflowProjectId,
    processInstanceId,
    processStatus,
    projectCurrentStatus,
    sections: elements.map((element) => ({
      element,
      payload: payloadsByElementId.get(element.id)
    }))
  }
}

async function patchPermitflowProcessInstanceById({
  supabaseUrl,
  supabaseAnonKey,
  tenantId,
  accessToken,
  processInstanceId,
  payload
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  tenantId: string
  accessToken: string
  processInstanceId: number
  payload: Record<string, unknown>
}): Promise<void> {
  const endpoint = new URL("/rest/v1/process_instance", supabaseUrl)
  endpoint.searchParams.set("id", `eq.${processInstanceId}`)
  endpoint.searchParams.set(TENANT_ID_COLUMN, `eq.${tenantId}`)

  const response = await fetch(endpoint.toString(), {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  })
  const responseText = await response.text()
  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast process update failed (${response.status}): ${errorDetail}`
        : `PermitFast process update failed (${response.status}).`
    )
  }
}

async function patchPermitflowDecisionPayloadById({
  supabaseUrl,
  supabaseAnonKey,
  tenantId,
  accessToken,
  payloadId,
  payload
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  tenantId: string
  accessToken: string
  payloadId: number
  payload: Record<string, unknown>
}): Promise<void> {
  const endpoint = new URL("/rest/v1/process_decision_payload", supabaseUrl)
  endpoint.searchParams.set("id", `eq.${payloadId}`)
  endpoint.searchParams.set(TENANT_ID_COLUMN, `eq.${tenantId}`)
  const response = await fetch(endpoint.toString(), {
    method: "PATCH",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  })
  const responseText = await response.text()
  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast decision payload update failed (${response.status}): ${errorDetail}`
        : `PermitFast decision payload update failed (${response.status}).`
    )
  }
}

async function createPermitflowCaseEvent({
  supabaseUrl,
  supabaseAnonKey,
  tenantId,
  accessToken,
  processInstanceId,
  name,
  description,
  type,
  status = "completed",
  source = "project-portal"
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  tenantId: string
  accessToken: string
  processInstanceId: number
  name: string
  description: string
  type: string
  status?: string
  source?: string
}): Promise<void> {
  await createPermitflowRecord(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "case_event",
    {
      parent_process_id: processInstanceId,
      name,
      description,
      type,
      status,
      source,
      datetime: new Date().toISOString()
    }
  )
}

function toSectionFormState({ element, payload }: Sf299SectionContext): PermitflowSectionFormState {
  return {
    decisionElementId: element.id,
    referenceId: normalizeString(element.processModelInternalReferenceId),
    title: normalizeTitle(element.title),
    description: normalizeString(element.description),
    formSchema: element.formData,
    hasForm: hasRenderableFormData(element.formData),
    payloadId: parseNumericId(payload?.id),
    evaluationData: isRecord(payload?.evaluation_data) ? payload.evaluation_data : undefined,
    resultNotes: normalizeString(payload?.result_notes),
    resultBool: typeof payload?.result_bool === "boolean" ? payload.result_bool : undefined
  }
}

export async function loadPermitflowCustomFormState(
  portalProjectId: number
): Promise<PermitflowCustomFormState> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  const tenantId = getPermitflowTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL, PERMITFLOW_SUPABASE_ANON_KEY, and PERMITFLOW_TENANT_ID."
    )
  }
  if (!Number.isFinite(portalProjectId)) {
    throw new ProjectPersistenceError("Project identifiers must be numeric.")
  }

  const options = { supabaseUrl, supabaseAnonKey, tenantId }
  const permitflowProject = await resolvePermitflowProjectByPortalProjectId(options, portalProjectId)
  const permitflowProjectId = parseNumericId(permitflowProject?.id)
  if (typeof permitflowProjectId !== "number") {
    return { exists: false, sections: [] }
  }

  const context = await resolveSf299FormContext(options, portalProjectId)

  return {
    exists: true,
    projectId: context.permitflowProjectId,
    processInstanceId: context.processInstanceId,
    processStatus: context.processStatus,
    projectCurrentStatus: context.projectCurrentStatus,
    sections: context.sections.map(toSectionFormState)
  }
}

async function saveSf299SectionPayload({
  supabaseUrl,
  supabaseAnonKey,
  tenantId,
  accessToken,
  context,
  decisionElementId,
  evaluationData
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  tenantId: string
  accessToken: string
  context: Awaited<ReturnType<typeof resolveSf299FormContext>>
  decisionElementId: number
  evaluationData: Record<string, unknown>
}): Promise<DecisionElementRecord> {
  const section = context.sections.find((entry) => entry.element.id === decisionElementId)
  if (!section) {
    throw new ProjectPersistenceError(
      `Decision element ${decisionElementId} is not part of the SF-299 process model.`
    )
  }

  const sanitized = sanitizeEvaluationDataForSchema(section.element.formData, evaluationData)
  const payloadId = parseNumericId(section.payload?.id)
  if (typeof payloadId === "number") {
    await patchPermitflowDecisionPayloadById({
      supabaseUrl,
      supabaseAnonKey,
      tenantId,
      accessToken,
      payloadId,
      payload: { evaluation_data: sanitized }
    })
  } else {
    await createPermitflowRecord(
      supabaseUrl,
      supabaseAnonKey,
      accessToken,
      tenantId,
      "process_decision_payload",
      {
        process_decision_element: section.element.id,
        process: context.processInstanceId,
        project: context.permitflowProjectId,
        evaluation_data: sanitized
      }
    )
  }

  return section.element
}

export async function savePermitflowCustomForm({
  portalProjectId,
  accessToken,
  decisionElementId,
  evaluationData
}: {
  portalProjectId: number
  accessToken: string
  decisionElementId: number
  evaluationData: Record<string, unknown>
}): Promise<void> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  const tenantId = getPermitflowTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL, PERMITFLOW_SUPABASE_ANON_KEY, and PERMITFLOW_TENANT_ID."
    )
  }
  const options = { supabaseUrl, supabaseAnonKey, tenantId, accessToken }
  const context = await resolveSf299FormContext(options, portalProjectId)
  const element = await saveSf299SectionPayload({
    supabaseUrl,
    supabaseAnonKey,
    tenantId,
    accessToken,
    context,
    decisionElementId,
    evaluationData
  })

  const formName = normalizeTitle(element.title) ?? "Section"
  await createPermitflowCaseEvent({
    supabaseUrl,
    supabaseAnonKey,
    tenantId,
    accessToken,
    processInstanceId: context.processInstanceId,
    name: "Form Saved",
    description: `${formName} form data saved`,
    type: "form_saved"
  })
}

export async function submitPermitflowCustomFormForApproval({
  portalProjectId,
  accessToken,
  sections
}: {
  portalProjectId: number
  accessToken: string
  /** Section drafts to persist before submission, keyed by decision element. */
  sections?: Array<{ decisionElementId: number; evaluationData: Record<string, unknown> }>
}): Promise<void> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  const tenantId = getPermitflowTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL, PERMITFLOW_SUPABASE_ANON_KEY, and PERMITFLOW_TENANT_ID."
    )
  }
  const options = { supabaseUrl, supabaseAnonKey, tenantId, accessToken }
  const context = await resolveSf299FormContext(options, portalProjectId)
  for (const sectionDraft of sections ?? []) {
    await saveSf299SectionPayload({
      supabaseUrl,
      supabaseAnonKey,
      tenantId,
      accessToken,
      context,
      decisionElementId: sectionDraft.decisionElementId,
      evaluationData: sectionDraft.evaluationData
    })
  }

  // Setting both statuses back to "submitted" also handles resubmission after a reviewer
  // returned the application (project.current_status = "returned").
  const wasReturned = context.projectCurrentStatus?.toLowerCase() === "returned"
  await patchPermitflowProcessInstanceById({
    supabaseUrl,
    supabaseAnonKey,
    tenantId,
    accessToken,
    processInstanceId: context.processInstanceId,
    payload: { status: "submitted" }
  })
  await patchPermitflowProjectById({
    supabaseUrl,
    supabaseAnonKey,
    tenantId,
    accessToken,
    projectId: context.permitflowProjectId,
    payload: { current_status: "submitted" }
  })
  const projectTitle = normalizeTitle(
    (await resolvePermitflowProjectByPortalProjectId(options, portalProjectId))?.title
  ) ?? `Project ${portalProjectId}`
  await createPermitflowCaseEvent({
    supabaseUrl,
    supabaseAnonKey,
    tenantId,
    accessToken,
    processInstanceId: context.processInstanceId,
    name: wasReturned ? "Resubmitted for Approval" : "Submitted for Approval",
    description: wasReturned
      ? `Project "${projectTitle}" resubmitted after revision`
      : `Project "${projectTitle}" submitted for approval`,
    type: "submitted_for_approval"
  })
}

export type PermitflowDocumentReference = {
  documentId?: number
  storagePath: string
  originalFilename: string
}

function generateDocumentUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function sanitizeStorageFilename(filename: string): string {
  const trimmed = filename.trim()
  const fallback = trimmed.length > 0 ? trimmed : "upload"
  return fallback.replace(/[^A-Za-z0-9._-]+/g, "_")
}

/**
 * Upload a document for an SF-299 `*_file` field: store the bytes in the
 * `permit-documents` bucket, catalog the file in `permit_document`, and return the
 * JSON-string reference to write into the owning section's `evaluation_data`.
 */
export async function uploadPermitflowDocument({
  accessToken,
  userId,
  processInstanceId,
  permitflowProjectId,
  decisionElementId,
  fieldName,
  file
}: {
  accessToken: string
  userId: string
  processInstanceId: number
  permitflowProjectId: number
  decisionElementId: number
  fieldName: string
  file: File
}): Promise<{ reference: PermitflowDocumentReference; encodedValue: string }> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  const tenantId = getPermitflowTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL, PERMITFLOW_SUPABASE_ANON_KEY, and PERMITFLOW_TENANT_ID."
    )
  }

  const originalFilename = file.name || "upload"
  const storagePath = [
    tenantId,
    processInstanceId,
    fieldName,
    `${generateDocumentUuid()}-${sanitizeStorageFilename(originalFilename)}`
  ].join("/")

  const uploadResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/${PERMIT_DOCUMENTS_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        "content-type": file.type || "application/octet-stream"
      },
      body: file
    }
  )
  if (!uploadResponse.ok) {
    const errorDetail = extractErrorDetail(await uploadResponse.text())
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast document upload failed (${uploadResponse.status}): ${errorDetail}`
        : `PermitFast document upload failed (${uploadResponse.status}).`
    )
  }

  const documentRow = await createPermitflowRecord<{ id?: number | string | null }>(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "permit_document",
    {
      process_id: processInstanceId,
      project_id: permitflowProjectId,
      decision_element_id: decisionElementId,
      field_name: fieldName,
      storage_path: storagePath,
      original_filename: originalFilename,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      uploaded_by: userId
    }
  )

  const reference: PermitflowDocumentReference = {
    documentId: parseNumericId(documentRow.id),
    storagePath,
    originalFilename
  }
  return { reference, encodedValue: JSON.stringify(reference) }
}

export async function loadPermitflowProjectStatus(
  projectId: number
): Promise<PermitflowProjectStatus> {
  if (!Number.isFinite(projectId)) {
    throw new ProjectPersistenceError("Project identifier must be numeric.")
  }

  const progress = await fetchPublishedProjectProgress("permitflow", [projectId])
  const entry = progress.get(projectId)
  if (!entry) {
    return { exists: false, projectId }
  }

  return {
    exists: true,
    projectId: entry.targetProjectId ?? projectId,
    lastUpdated: entry.lastUpdated,
    currentStatus: entry.currentStatus,
    rowAuthorizationProcess: entry.processes[0]
  }
}

export async function updatePermitflowProject({
  formData,
  accessToken,
  userId
}: {
  formData: ProjectFormData
  accessToken: string
  userId: string
}): Promise<void> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  const tenantId = getPermitflowTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL, PERMITFLOW_SUPABASE_ANON_KEY, and PERMITFLOW_TENANT_ID."
    )
  }

  const normalizedId = normalizeString(formData.id)
  const portalProjectId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined

  if (!portalProjectId || Number.isNaN(portalProjectId) || !Number.isFinite(portalProjectId)) {
    throw new ProjectPersistenceError("A numeric project identifier is required to update PermitFast.")
  }

  const options = { supabaseUrl, supabaseAnonKey, tenantId, accessToken }
  const existingProject = await resolvePermitflowProjectByPortalProjectId(options, portalProjectId)
  const permitflowProjectId = parseNumericId(existingProject?.id)
  if (typeof permitflowProjectId !== "number") {
    throw new ProjectPersistenceError(
      `PermitFast project for portal project ${portalProjectId} was not found. Submit it first.`
    )
  }

  const payload = buildPermitflowProjectPayload(
    formData,
    userId,
    portalProjectId,
    existingProject?.other
  )
  await patchPermitflowProjectById({
    supabaseUrl,
    supabaseAnonKey,
    tenantId,
    accessToken,
    projectId: permitflowProjectId,
    payload
  })
}

export async function loadRowAuthorizationProcessesForProjects(
  projects: ProjectSummary[]
): Promise<Map<number, ProjectProcessSummary[]>> {
  const results = new Map<number, ProjectProcessSummary[]>()
  const progress = await fetchPublishedProjectProgress(
    "permitflow",
    projects.map((project) => project.id)
  )
  for (const [sourceProjectId, entry] of progress) {
    if (entry.processes.length > 0) {
      results.set(sourceProjectId, entry.processes)
    }
  }
  return results
}

export type RowAuthorizationAnalyticsPoint = {
  date: string
  completionCount: number | null
  averageCompletionDays: number | null
  durationSampleSize: number
  durationTotalDays: number | null
}




export async function loadRowAuthorizationAnalytics(): Promise<RowAuthorizationAnalyticsPoint[]> {
  return fetchPublishedAnalytics("permitflow")
}

// --- Application deletion ----------------------------------------------------------------

async function deletePermitflowRows(
  {
    supabaseUrl,
    supabaseAnonKey,
    tenantId,
    accessToken
  }: { supabaseUrl: string; supabaseAnonKey: string; tenantId: string; accessToken: string },
  path: string,
  resourceDescription: string,
  configure: (endpoint: URL) => void
): Promise<void> {
  const endpoint = new URL(path, supabaseUrl)
  configure(endpoint)
  endpoint.searchParams.set(TENANT_ID_COLUMN, `eq.${tenantId}`)
  const response = await fetch(endpoint.toString(), {
    method: "DELETE",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "return=minimal"
    }
  })
  if (!response.ok) {
    const errorDetail = extractErrorDetail(await response.text())
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFast ${resourceDescription} deletion failed (${response.status}): ${errorDetail}`
        : `PermitFast ${resourceDescription} deletion failed (${response.status}).`
    )
  }
}

export type PermitflowDeletionResult = {
  deleted: boolean
  permitflowProjectId?: number
}

/**
 * Delete the tenant-local PermitFast application for a portal project: uploaded documents
 * (storage objects + permit_document rows), case events, decision payloads, process
 * instances, and the tenant's project copy. Requires an authenticated PermitFast session.
 */
export async function deletePermitflowProject({
  portalProjectId,
  accessToken
}: {
  portalProjectId: number
  accessToken: string
}): Promise<PermitflowDeletionResult> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  const tenantId = getPermitflowTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "PermitFast credentials are not configured. Set PERMITFLOW_SUPABASE_URL, PERMITFLOW_SUPABASE_ANON_KEY, and PERMITFLOW_TENANT_ID."
    )
  }

  const options = { supabaseUrl, supabaseAnonKey, tenantId, accessToken }
  const projectRow = await resolvePermitflowProjectByPortalProjectId(options, portalProjectId)
  const permitflowProjectId = parseNumericId(projectRow?.id)
  if (typeof permitflowProjectId !== "number") {
    return { deleted: false }
  }

  const processRows = await fetchPermitflowList<{ id?: number | null }>(
    options,
    "/rest/v1/process_instance",
    (endpoint) => {
      endpoint.searchParams.set("select", "id")
      endpoint.searchParams.set("parent_project_id", `eq.${permitflowProjectId}`)
      endpoint.searchParams.set("limit", "200")
    }
  )
  const processIds = processRows
    .map((row) => parseNumericId(row.id))
    .filter((id): id is number => typeof id === "number")

  if (processIds.length > 0) {
    const inFilter = `in.(${processIds.join(",")})`

    // Remove uploaded documents from storage before dropping their catalog rows.
    const documentRows = await fetchPermitflowList<{ storage_path?: string | null }>(
      options,
      "/rest/v1/permit_document",
      (endpoint) => {
        endpoint.searchParams.set("select", "storage_path")
        endpoint.searchParams.set("process_id", inFilter)
        endpoint.searchParams.set("limit", "500")
      }
    )
    for (const row of documentRows) {
      const storagePath = normalizeString(row.storage_path)
      if (!storagePath) {
        continue
      }
      const storageResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/${PERMIT_DOCUMENTS_BUCKET}/${storagePath}`,
        {
          method: "DELETE",
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` }
        }
      )
      if (!storageResponse.ok && storageResponse.status !== 404) {
        console.warn(
          `[permitflow] Failed to delete stored document ${storagePath} (${storageResponse.status}).`
        )
      }
    }

    await deletePermitflowRows(options, "/rest/v1/permit_document", "document records", (endpoint) => {
      endpoint.searchParams.set("process_id", inFilter)
    })
    await deletePermitflowRows(options, "/rest/v1/case_event", "case events", (endpoint) => {
      endpoint.searchParams.set("parent_process_id", inFilter)
    })
    await deletePermitflowRows(
      options,
      "/rest/v1/process_decision_payload",
      "decision payloads",
      (endpoint) => {
        endpoint.searchParams.set("process", inFilter)
      }
    )
  }

  await deletePermitflowRows(options, "/rest/v1/process_instance", "process instances", (endpoint) => {
    endpoint.searchParams.set("parent_project_id", `eq.${permitflowProjectId}`)
  })
  await deletePermitflowRows(options, "/rest/v1/project", "project", (endpoint) => {
    endpoint.searchParams.set("id", `eq.${permitflowProjectId}`)
  })

  return { deleted: true, permitflowProjectId }
}
