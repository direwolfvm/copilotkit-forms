import { getSupabaseAnonKey, getSupabaseUrl } from "../runtimeConfig"
import type {
  CaseEventSummary,
  DecisionElementRecord,
  LegalStructureRecord,
  ProcessInformation,
  ProcessModelRecord,
  ProjectProcessSummary
} from "./projectPersistence"

/**
 * Published integration contract for PermitFlow and ReviewWorks.
 *
 * The portal used to read those tenants' tables directly with the anon key. The shared project is
 * removing anonymous cross-tenant reads (migration 014), and a generic table broker was rejected
 * for good reason: it would have returned fields the UI never needs, including ReviewWorks event
 * metadata carrying user ids and review comments.
 *
 * These three security-definer RPCs publish exactly what the UI renders and nothing more. They are
 * called through the same-origin /api/supabase proxy, so the anon key stays server-side.
 */
export type IntegrationSlug = "permitflow" | "reviewworks"

const RPC_PREFIX = "/rest/v1/rpc"
const SUPABASE_PROXY_PREFIX = "/api/supabase"
/** The progress RPC accepts at most 100 source ids per call. */
const PROGRESS_ID_LIMIT = 100

export type PublishedAnalyticsPoint = {
  date: string
  completionCount: number | null
  averageCompletionDays: number | null
  durationSampleSize: number
  durationTotalDays: number | null
}

/** The published process carries a status the shared ProjectProcessSummary does not model. */
export type PublishedProcess = ProjectProcessSummary & { status?: string }

export type PublishedProjectProgress = {
  sourceProjectId: number
  targetProjectId?: number
  currentStatus?: string
  lastUpdated?: string
  processes: PublishedProcess[]
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

async function callPublishedRpc<T>(name: string, body: Record<string, unknown>): Promise<T | undefined> {
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  if (!supabaseUrl || !anonKey) {
    return undefined
  }

  const headers: Record<string, string> = { "content-type": "application/json" }
  let target: string

  if (typeof window === "undefined") {
    headers.apikey = anonKey
    headers.Authorization = `Bearer ${anonKey}`
    target = new URL(`${RPC_PREFIX}/${name}`, supabaseUrl).toString()
  } else {
    target = `${SUPABASE_PROXY_PREFIX}${RPC_PREFIX}/${name}`
  }

  const response = await fetch(target, { method: "POST", headers, body: JSON.stringify(body) })
  if (!response.ok) {
    console.warn(`[published] ${name} failed (${response.status}).`)
    return undefined
  }

  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as T
  } catch {
    console.warn(`[published] ${name} returned unparseable JSON.`)
    return undefined
  }
}

function toProcessModel(raw: Record<string, unknown>): ProcessModelRecord | undefined {
  const id = num(raw.id)
  if (typeof id !== "number") return undefined
  return {
    id,
    title: str(raw.title) ?? null,
    description: str(raw.description) ?? null,
    notes: str(raw.notes) ?? null,
    screeningDescription: str(raw.screening_description) ?? null,
    agency: str(raw.agency) ?? null,
    legalStructureId: num(raw.legal_structure_id) ?? null,
    legalStructureText: str(raw.legal_structure_text) ?? null,
    lastUpdated: str(raw.last_updated) ?? null
  }
}

function toLegalStructure(raw: unknown): LegalStructureRecord | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const record = raw as Record<string, unknown>
  const id = num(record.id)
  if (typeof id !== "number") return undefined
  return {
    id,
    title: str(record.title) ?? null,
    citation: str(record.citation) ?? null,
    description: str(record.description) ?? null,
    issuingAuthority: str(record.issuing_authority) ?? null,
    url: str(record.url) ?? null,
    effectiveDate: str(record.effective_date) ?? null
  }
}

function toDecisionElement(raw: Record<string, unknown>): DecisionElementRecord | undefined {
  const id = num(raw.id)
  if (typeof id !== "number") return undefined
  return {
    id,
    createdAt: str(raw.created_at) ?? null,
    processModelId: num(raw.process_model) ?? null,
    legalStructureId: num(raw.legal_structure_id) ?? null,
    title: str(raw.title) ?? null,
    description: str(raw.description) ?? null,
    measure: str(raw.measure) ?? null,
    threshold: num(raw.threshold) ?? null,
    spatial: typeof raw.spatial === "boolean" ? raw.spatial : null,
    intersect: typeof raw.intersect === "boolean" ? raw.intersect : null,
    spatialReference: str(raw.spatial_reference) ?? null,
    formText: str(raw.form_text) ?? null,
    formResponseDescription: str(raw.form_response_desc) ?? null,
    formData: raw.form_data ?? null,
    evaluationMethod: str(raw.evaluation_method) ?? null,
    evaluationDmn: str(raw.evaluation_dmn) ?? null,
    category: str(raw.category) ?? null,
    processModelInternalReferenceId: str(raw.process_model_internal_reference_id) ?? null,
    parentDecisionElementId: num(raw.parent_decision_element_id) ?? null,
    other: raw.other ?? null,
    expectedEvaluationData: raw.expected_evaluation_data ?? null,
    responseData: raw.response_data ?? null,
    recordOwnerAgency: str(raw.record_owner_agency) ?? null,
    dataSourceAgency: str(raw.data_source_agency) ?? null,
    dataSourceSystem: str(raw.data_source_system) ?? null,
    dataRecordVersion: str(raw.data_record_version) ?? null,
    lastUpdated: str(raw.last_updated) ?? null,
    retrievedTimestamp: str(raw.retrieved_timestamp) ?? null
  }
}

export async function fetchPublishedCatalog(
  slug: IntegrationSlug
): Promise<ProcessInformation | undefined> {
  const payload = await callPublishedRpc<Record<string, unknown>>(
    "portal_published_integration_catalog",
    { target_slug: slug }
  )
  const modelRaw = payload?.process_model
  if (!modelRaw || typeof modelRaw !== "object") return undefined

  const processModel = toProcessModel(modelRaw as Record<string, unknown>)
  if (!processModel) return undefined

  const elementsRaw = Array.isArray(payload?.decision_elements) ? payload.decision_elements : []
  const decisionElements = elementsRaw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map(toDecisionElement)
    .filter((element): element is DecisionElementRecord => !!element)
    .sort((a, b) => a.id - b.id)

  return { processModel, legalStructure: toLegalStructure(payload?.legal_structure), decisionElements }
}

export async function fetchPublishedAnalytics(
  slug: IntegrationSlug
): Promise<PublishedAnalyticsPoint[]> {
  const payload = await callPublishedRpc<unknown>("portal_published_completion_analytics", {
    target_slug: slug
  })
  if (!Array.isArray(payload)) return []
  return payload.filter((point): point is PublishedAnalyticsPoint => {
    return !!point && typeof point === "object" && typeof (point as { date?: unknown }).date === "string"
  })
}

function toCaseEvents(raw: unknown): CaseEventSummary[] {
  if (!Array.isArray(raw)) return []
  const events: CaseEventSummary[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const id = num(record.id)
    if (typeof id !== "number") continue
    events.push({
      id,
      eventType: str(record.type) ?? null,
      status: str(record.status) ?? null,
      lastUpdated: str(record.lastUpdated) ?? null
    })
  }
  return events
}

function toProcesses(raw: unknown): PublishedProcess[] {
  if (!Array.isArray(raw)) return []
  const processes: PublishedProcess[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const id = num(record.id)
    if (typeof id !== "number") continue
    processes.push({
      id,
      title: str(record.title) ?? null,
      status: str(record.status),
      lastUpdated: str(record.lastUpdated) ?? null,
      createdTimestamp: str(record.createdTimestamp) ?? null,
      caseEvents: toCaseEvents(record.caseEvents)
    })
  }
  return processes
}

export async function fetchPublishedProjectProgress(
  slug: IntegrationSlug,
  sourceProjectIds: number[]
): Promise<Map<number, PublishedProjectProgress>> {
  const results = new Map<number, PublishedProjectProgress>()
  const ids = Array.from(
    new Set(sourceProjectIds.filter((id) => typeof id === "number" && Number.isFinite(id)))
  )
  if (ids.length === 0) return results

  for (let index = 0; index < ids.length; index += PROGRESS_ID_LIMIT) {
    const chunk = ids.slice(index, index + PROGRESS_ID_LIMIT)
    const payload = await callPublishedRpc<unknown>("portal_published_project_progress", {
      target_slug: slug,
      source_project_ids: chunk
    })
    if (!Array.isArray(payload)) continue

    for (const entry of payload) {
      if (!entry || typeof entry !== "object") continue
      const record = entry as Record<string, unknown>
      const sourceProjectId = num(record.sourceProjectId)
      if (typeof sourceProjectId !== "number") continue
      results.set(sourceProjectId, {
        sourceProjectId,
        targetProjectId: num(record.targetProjectId),
        currentStatus: str(record.currentStatus),
        lastUpdated: str(record.lastUpdated),
        processes: toProcesses(record.processes)
      })
    }
  }

  return results
}
