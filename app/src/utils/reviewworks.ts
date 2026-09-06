import {
  fetchPublishedAnalytics,
  fetchPublishedCatalog,
  fetchPublishedProjectProgress
} from "./publishedIntegration"
import type { ProjectFormData } from "../schema/projectSchema"
import { getReviewworksAnonKey, getReviewworksTenantId, getReviewworksUrl } from "../runtimeConfig"
import {
  ProjectPersistenceError,
  type ProcessInformation,
  type ProjectProcessSummary,
  type ProjectSummary
} from "./projectPersistence"

type ReviewworksFetchOptions = {
  supabaseUrl: string
  supabaseAnonKey: string
  tenantId: string
  accessToken?: string
}

type ReviewworksAuthSession = {
  accessToken: string
  userId: string
  expiresIn?: number
  refreshToken?: string
}




const COMPLEX_REVIEW_PROCESS_MODEL_TITLE = "Complex Environmental Review"
export const COMPLEX_REVIEW_PROCESS_MODEL_ID = 1
const TENANT_ID_COLUMN = "tenant_id"
let reviewworksProcessModelIdCache: number | undefined

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






async function resolveComplexReviewProcessModelId(
  options: ReviewworksFetchOptions
): Promise<number> {
  if (typeof reviewworksProcessModelIdCache === "number") {
    return reviewworksProcessModelIdCache
  }

  const rows = await fetchReviewworksList<Record<string, unknown>>(
    options,
    "/rest/v1/process_model",
    (endpoint) => {
      endpoint.searchParams.set("select", "id,title")
      endpoint.searchParams.set("title", `eq.${COMPLEX_REVIEW_PROCESS_MODEL_TITLE}`)
      endpoint.searchParams.set("limit", "1")
    }
  )

  const processModelId = parseNumericId(rows[0]?.id)
  if (typeof processModelId !== "number") {
    throw new ProjectPersistenceError(
      `ReviewWorks process model "${COMPLEX_REVIEW_PROCESS_MODEL_TITLE}" was not found.`
    )
  }

  reviewworksProcessModelIdCache = processModelId
  return processModelId
}

const PORTAL_SOURCE_KEY = "_project_portal"
const PORTAL_SOURCE_ID_KEY = "source_project_id"

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined)
  return Object.fromEntries(entries) as T
}

function buildReviewworksProjectPayload(
  formData: ProjectFormData,
  userId?: string
): Record<string, unknown> {
  const normalizedId = normalizeString(formData.id)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined
  const timestamp = new Date().toISOString()

  const other = stripUndefined({
    // The published progress contract only returns a ReviewWorks project when this marker
    // identifies an existing HelpPermitMe project, so every write has to carry it. PermitFlow
    // already did; ReviewWorks rows written before this are deliberately excluded upstream.
    [PORTAL_SOURCE_KEY]:
      typeof numericId === "number" && Number.isFinite(numericId)
        ? { [PORTAL_SOURCE_ID_KEY]: numericId }
        : undefined,
    applicant_user_id: normalizeString(userId),
    nepa_categorical_exclusion_code: normalizeString(formData.nepa_categorical_exclusion_code),
    nepa_conformance_conditions: normalizeString(formData.nepa_conformance_conditions),
    nepa_extraordinary_circumstances: normalizeString(formData.nepa_extraordinary_circumstances),
    additional_notes: normalizeString(formData.other)
  })

  return stripUndefined({
    id: Number.isFinite(numericId) ? numericId : undefined,
    title: normalizeString(formData.title),
    description: normalizeString(formData.description),
    sector: normalizeString(formData.sector),
    lead_agency: normalizeString(formData.lead_agency),
    type: normalizeString(formData.sector),
    location_lat: normalizeNumber(formData.location_lat),
    location_lon: normalizeNumber(formData.location_lon),
    location_text: normalizeString(formData.location_text),
    current_status: "draft",
    other: Object.keys(other).length > 0 ? other : undefined,
    last_updated: timestamp
  })
}

async function fetchReviewworksList<T>(
  { supabaseUrl, supabaseAnonKey, tenantId, accessToken }: ReviewworksFetchOptions,
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
        ? `ReviewWorks request failed (${response.status}): ${errorDetail}`
        : `ReviewWorks request failed (${response.status}).`
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




export async function loadReviewworksProcessInformation(): Promise<ProcessInformation> {
  const info = await fetchPublishedCatalog("reviewworks")
  if (!info) {
    throw new ProjectPersistenceError(
      "The ReviewWorks published catalog is unavailable. Check portal_published_integration_catalog."
    )
  }
  return info
}

export async function authenticateReviewworksUser({
  email,
  password
}: {
  email: string
  password: string
}): Promise<ReviewworksAuthSession> {
  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL and REVIEWWORKS_SUPABASE_ANON_KEY."
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
        ? `ReviewWorks authentication failed (${response.status}): ${errorDetail}`
        : `ReviewWorks authentication failed (${response.status}).`
    )
  }

  const payload = responseText ? safeJsonParse(responseText) : undefined
  if (!payload || typeof payload !== "object") {
    throw new ProjectPersistenceError("ReviewWorks authentication response was empty.")
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
      "ReviewWorks authentication response was missing required fields."
    )
  }

  return {
    accessToken,
    userId,
    expiresIn,
    refreshToken
  }
}

type ReviewworksSubmitResult = {
  projectId: number
  processInstanceId: number
}

async function createReviewworksRecord<T>(
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
        ? `ReviewWorks ${table} creation failed (${response.status}): ${errorDetail}`
        : `ReviewWorks ${table} creation failed (${response.status}).`
    )
  }

  const parsed = responseText ? safeJsonParse(responseText) : undefined
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed[0] as T
  }
  if (parsed && typeof parsed === "object") {
    return parsed as T
  }
  throw new ProjectPersistenceError(`ReviewWorks ${table} creation returned empty response.`)
}

async function createReviewworksRecordsBatch<T>(
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
        ? `ReviewWorks ${table} batch creation failed (${response.status}): ${errorDetail}`
        : `ReviewWorks ${table} batch creation failed (${response.status}).`
    )
  }

  const parsed = responseText ? safeJsonParse(responseText) : undefined
  if (Array.isArray(parsed)) {
    return parsed as T[]
  }
  return []
}

export async function submitReviewworksProject({
  formData,
  accessToken,
  userId,
  userEmail: _userEmail
}: {
  formData: ProjectFormData
  accessToken: string
  userId: string
  userEmail: string
}): Promise<ReviewworksSubmitResult> {
  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()
  const tenantId = getReviewworksTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL, REVIEWWORKS_SUPABASE_ANON_KEY, and REVIEWWORKS_TENANT_ID."
    )
  }

  const timestamp = new Date().toISOString()
  const options = { supabaseUrl, supabaseAnonKey, tenantId, accessToken }
  const complexReviewProcessModelId = await resolveComplexReviewProcessModelId(options)

  // Create or update project record
  const projectPayload = buildReviewworksProjectPayload(formData, userId)
  const projectResult = await createReviewworksRecord<{ id: number }>(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "project",
    projectPayload,
    { upsert: true }
  )
  const projectId = parseNumericId(projectResult.id)
  if (typeof projectId !== "number") {
    throw new ProjectPersistenceError("ReviewWorks project creation did not return a valid ID.")
  }

  // Check if a Complex Review process_instance already exists for this project
  const existingProcesses = await fetchReviewworksList<{ id: number }>(
    options,
    "/rest/v1/process_instance",
    (endpoint) => {
      endpoint.searchParams.set("select", "id")
      endpoint.searchParams.set("parent_project_id", `eq.${projectId}`)
      endpoint.searchParams.set("process_model", `eq.${complexReviewProcessModelId}`)
      endpoint.searchParams.set("limit", "1")
    }
  )

  if (existingProcesses.length > 0) {
    // Process instance already exists, return early
    const existingId = parseNumericId(existingProcesses[0].id)
    if (typeof existingId === "number") {
      return { projectId, processInstanceId: existingId }
    }
  }

  // Create process_instance record
  const processInstancePayload = {
    parent_project_id: projectId,
    process_model: complexReviewProcessModelId,
    status: "underway",
    stage: "Step 2: Project Information",
    start_date: timestamp.split("T")[0],
    other: {
      current_step: 2,
      workflow_status: "draft"
    }
  }
  const processResult = await createReviewworksRecord<{ id: number }>(
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
      "ReviewWorks process instance creation did not return a valid ID."
    )
  }

  // Create process_decision_payload records
  const decisionPayloads = [
    {
      process_decision_element: 1,
      process: processInstanceId,
      project: projectId,
      result: "completed",
      result_bool: true,
      evaluation_data: {
        user_id: userId,
        authenticated_at: timestamp
      }
    },
    {
      process_decision_element: 2,
      process: processInstanceId,
      project: projectId,
      evaluation_data: {
        title: normalizeString(formData.title),
        description: normalizeString(formData.description),
        sector: normalizeString(formData.sector),
        lead_agency: normalizeString(formData.lead_agency),
        location_text: normalizeString(formData.location_text)
      }
    }
  ]
  await createReviewworksRecordsBatch(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "process_decision_payload",
    decisionPayloads
  )

  // Create case_event records
  const caseEvents = [
    {
      parent_process_id: processInstanceId,
      name: "Project Started",
      description: `Complex Review application started for project: ${formData.title ?? "Untitled"}`,
      type: "task",
      tier: 1,
      status: "completed",
      outcome: "completed",
      other: {
        step_number: 1,
        decision_element_id: 1,
        task_type: "form",
        completed_by: userId,
        completed_at: timestamp
      }
    },
    {
      parent_process_id: processInstanceId,
      name: "Complete Project Information",
      description: "Fill out the project information form to proceed",
      type: "task",
      tier: 2,
      status: "pending",
      assigned_entity: userId,
      other: {
        step_number: 2,
        decision_element_id: 2,
        assigned_user_id: userId,
        assigned_role_id: 1,
        task_type: "form"
      }
    }
  ]
  await createReviewworksRecordsBatch(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    tenantId,
    "case_event",
    caseEvents
  )

  return { projectId, processInstanceId }
}

export type ReviewworksProjectStatus = {
  exists: boolean
  projectId: number
  title?: string
  lastUpdated?: string
  complexReviewProcess?: ProjectProcessSummary
}

export async function loadReviewworksProjectStatus(
  projectId: number
): Promise<ReviewworksProjectStatus> {
  if (!Number.isFinite(projectId)) {
    throw new ProjectPersistenceError("Project identifier must be numeric.")
  }

  const progress = await fetchPublishedProjectProgress("reviewworks", [projectId])
  const entry = progress.get(projectId)
  if (!entry) {
    return { exists: false, projectId }
  }

  return {
    exists: true,
    projectId: entry.targetProjectId ?? projectId,
    lastUpdated: entry.lastUpdated,
    complexReviewProcess: entry.processes[0]
  }
}

export async function updateReviewworksProject({
  formData,
  accessToken,
  userId
}: {
  formData: ProjectFormData
  accessToken: string
  userId: string
}): Promise<void> {
  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()
  const tenantId = getReviewworksTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL, REVIEWWORKS_SUPABASE_ANON_KEY, and REVIEWWORKS_TENANT_ID."
    )
  }

  const normalizedId = normalizeString(formData.id)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined

  if (!numericId || Number.isNaN(numericId) || !Number.isFinite(numericId)) {
    throw new ProjectPersistenceError("A numeric project identifier is required to update ReviewWorks.")
  }

  const payload = buildReviewworksProjectPayload(formData, userId)

  const endpoint = new URL("/rest/v1/project", supabaseUrl)
  endpoint.searchParams.set("id", `eq.${numericId}`)
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
        ? `ReviewWorks update failed (${response.status}): ${errorDetail}`
        : `ReviewWorks update failed (${response.status}).`
    )
  }
}

export type ComplexReviewAnalyticsPoint = {
  date: string
  completionCount: number | null
  averageCompletionDays: number | null
  durationSampleSize: number
  durationTotalDays: number | null
}




export async function loadComplexReviewAnalytics(): Promise<ComplexReviewAnalyticsPoint[]> {
  return fetchPublishedAnalytics("reviewworks")
}

export async function loadComplexReviewProcessesForProjects(
  projects: ProjectSummary[]
): Promise<Map<number, ProjectProcessSummary[]>> {
  const results = new Map<number, ProjectProcessSummary[]>()
  const progress = await fetchPublishedProjectProgress(
    "reviewworks",
    projects.map((project) => project.id)
  )
  for (const [sourceProjectId, entry] of progress) {
    if (entry.processes.length > 0) {
      results.set(sourceProjectId, entry.processes)
    }
  }
  return results
}

// --- Application deletion ----------------------------------------------------------------

async function deleteReviewworksRows(
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
        ? `ReviewWorks ${resourceDescription} deletion failed (${response.status}): ${errorDetail}`
        : `ReviewWorks ${resourceDescription} deletion failed (${response.status}).`
    )
  }
}

export type ReviewworksDeletionResult = {
  deleted: boolean
  reviewworksProjectId?: number
}

/**
 * Delete the tenant-local ReviewWorks (Complex Review) application for a portal project.
 * ReviewWorks reuses the portal's numeric project id, so resolution is direct. Requires an
 * authenticated ReviewWorks session.
 */
export async function deleteReviewworksProject({
  portalProjectId,
  accessToken
}: {
  portalProjectId: number
  accessToken: string
}): Promise<ReviewworksDeletionResult> {
  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()
  const tenantId = getReviewworksTenantId()
  if (!supabaseUrl || !supabaseAnonKey || !tenantId) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL, REVIEWWORKS_SUPABASE_ANON_KEY, and REVIEWWORKS_TENANT_ID."
    )
  }

  const options = { supabaseUrl, supabaseAnonKey, tenantId, accessToken }
  const projectRows = await fetchReviewworksList<{ id?: number | null }>(
    options,
    "/rest/v1/project",
    (endpoint) => {
      endpoint.searchParams.set("select", "id")
      endpoint.searchParams.set("id", `eq.${portalProjectId}`)
      endpoint.searchParams.set("limit", "1")
    }
  )
  const reviewworksProjectId = parseNumericId(projectRows[0]?.id)
  if (typeof reviewworksProjectId !== "number") {
    return { deleted: false }
  }

  const processRows = await fetchReviewworksList<{ id?: number | null }>(
    options,
    "/rest/v1/process_instance",
    (endpoint) => {
      endpoint.searchParams.set("select", "id")
      endpoint.searchParams.set("parent_project_id", `eq.${reviewworksProjectId}`)
      endpoint.searchParams.set("limit", "200")
    }
  )
  const processIds = processRows
    .map((row) => parseNumericId(row.id))
    .filter((id): id is number => typeof id === "number")

  if (processIds.length > 0) {
    const inFilter = `in.(${processIds.join(",")})`
    await deleteReviewworksRows(options, "/rest/v1/case_event", "case events", (endpoint) => {
      endpoint.searchParams.set("parent_process_id", inFilter)
    })
    await deleteReviewworksRows(
      options,
      "/rest/v1/process_decision_payload",
      "decision payloads",
      (endpoint) => {
        endpoint.searchParams.set("process", inFilter)
      }
    )
  }

  await deleteReviewworksRows(options, "/rest/v1/process_instance", "process instances", (endpoint) => {
    endpoint.searchParams.set("parent_project_id", `eq.${reviewworksProjectId}`)
  })
  await deleteReviewworksRows(options, "/rest/v1/project", "project", (endpoint) => {
    endpoint.searchParams.set("id", `eq.${reviewworksProjectId}`)
  })

  return { deleted: true, reviewworksProjectId }
}
