import type { ProjectContact, ProjectFormData } from "../schema/projectSchema"
import type { GeospatialResultsState, GeospatialServiceState } from "../types/geospatial"
import { getSupabaseAnonKey, getSupabaseUrl } from "../runtimeConfig"

const DATA_SOURCE_SYSTEM = "project-portal"

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

export async function saveProjectSnapshot({
  formData,
  geospatialResults
}: SaveProjectSnapshotArgs): Promise<void> {
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "Supabase credentials are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    )
  }

  const normalizedId = normalizeString(formData.id)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined

  if (normalizedId && (Number.isNaN(numericId) || !Number.isFinite(numericId))) {
    throw new ProjectPersistenceError("Project identifier must be numeric to save to Supabase.")
  }

  const locationResult = parseLocationObject(formData.location_object)

  const timestamp = new Date().toISOString()

  const record: Record<string, unknown> = {
    id: numericId,
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
    location_object: locationResult.value,
    sponsor_contact: normalizeContact(formData.sponsor_contact),
    other: buildOtherPayload(formData, geospatialResults, locationResult),
    data_source_system: DATA_SOURCE_SYSTEM,
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  }

  const sanitizedRecord = stripUndefined(record)

  const endpoint = new URL("/rest/v1/project", supabaseUrl)
  endpoint.searchParams.set("on_conflict", "id")

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(sanitizedRecord)
  })

  if (!response.ok) {
    let errorDetail: string | undefined
    try {
      const body = await response.json()
      errorDetail = typeof body?.message === "string" ? body.message : JSON.stringify(body)
    } catch (jsonError) {
      try {
        errorDetail = await response.text()
      } catch (textError) {
        errorDetail = jsonError instanceof Error ? jsonError.message : undefined
      }
    }

    throw new ProjectPersistenceError(
      errorDetail
        ? `Supabase request failed (${response.status}): ${errorDetail}`
        : `Supabase request failed (${response.status}).`
    )
  }
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
