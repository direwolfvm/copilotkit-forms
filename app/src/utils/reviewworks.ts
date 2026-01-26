import type { ProjectFormData } from "../schema/projectSchema"
import { getReviewworksAnonKey, getReviewworksUrl } from "../runtimeConfig"
import {
  ProjectPersistenceError,
  type CaseEventSummary,
  type DecisionElementRecord,
  type ProcessInformation,
  type ProjectProcessSummary,
  type ProjectSummary
} from "./projectPersistence"

type ReviewworksFetchOptions = {
  supabaseUrl: string
  supabaseAnonKey: string
  accessToken?: string
}

type ReviewworksAuthSession = {
  accessToken: string
  userId: string
  expiresIn?: number
  refreshToken?: string
}

type ReviewworksProjectRow = {
  id?: number | string | null
  title?: string | null
  last_updated?: string | null
}

type ReviewworksProcessInstanceRow = {
  id?: number | null
  parent_project_id?: number | null
  description?: string | null
  last_updated?: string | null
  created_at?: string | null
  process_model?: number | null
  status?: string | null
  stage?: string | null
  other?: unknown
}

type ReviewworksCaseEventRow = {
  id?: number | null
  parent_process_id?: number | null
  name?: string | null
  type?: string | null
  status?: string | null
  last_updated?: string | null
  other?: unknown
}

const COMPLEX_REVIEW_LABEL = "Complex Review"
export const COMPLEX_REVIEW_PROCESS_MODEL_ID = 1

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

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`
}

function isComplexReviewProcess(row: ReviewworksProcessInstanceRow): boolean {
  return row.process_model === COMPLEX_REVIEW_PROCESS_MODEL_ID
}

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
  { supabaseUrl, supabaseAnonKey, accessToken }: ReviewworksFetchOptions,
  path: string,
  configure?: (endpoint: URL) => void
): Promise<T[]> {
  const endpoint = new URL(path, supabaseUrl)
  if (configure) {
    configure(endpoint)
  }

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

async function fetchProcessModelRecord(
  options: ReviewworksFetchOptions,
  processModelId: number
): Promise<ProcessInformation["processModel"] | undefined> {
  const rows = await fetchReviewworksList<Record<string, unknown>>(
    options,
    "/rest/v1/process_model",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        [
          "id",
          "title",
          "description",
          "notes",
          "screening_description",
          "agency",
          "legal_structure_id",
          "legal_structure_text",
          "last_updated"
        ].join(",")
      )
      endpoint.searchParams.set("id", `eq.${processModelId}`)
      endpoint.searchParams.set("limit", "1")
    }
  )

  const raw = rows[0]
  if (!raw || typeof raw !== "object") {
    return undefined
  }

  const parseOptionalString = (value: unknown): string | null =>
    typeof value === "string" ? value : null

  const id = parseNumericId((raw as Record<string, unknown>).id)
  if (typeof id !== "number") {
    return undefined
  }

  return {
    id,
    title: parseOptionalString((raw as Record<string, unknown>).title),
    description: parseOptionalString((raw as Record<string, unknown>).description),
    notes: parseOptionalString((raw as Record<string, unknown>).notes),
    screeningDescription: parseOptionalString(
      (raw as Record<string, unknown>).screening_description
    ),
    agency: parseOptionalString((raw as Record<string, unknown>).agency),
    legalStructureId: parseNumericId((raw as Record<string, unknown>).legal_structure_id) ?? null,
    legalStructureText: parseOptionalString(
      (raw as Record<string, unknown>).legal_structure_text
    ),
    lastUpdated: parseOptionalString((raw as Record<string, unknown>).last_updated)
  }
}

async function fetchLegalStructureRecord(
  options: ReviewworksFetchOptions,
  legalStructureId: number
): Promise<ProcessInformation["legalStructure"] | undefined> {
  const rows = await fetchReviewworksList<Record<string, unknown>>(
    options,
    "/rest/v1/legal_structure",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        [
          "id",
          "title",
          "citation",
          "description",
          "issuing_authority",
          "url",
          "effective_date"
        ].join(",")
      )
      endpoint.searchParams.set("id", `eq.${legalStructureId}`)
      endpoint.searchParams.set("limit", "1")
    }
  )

  const raw = rows[0]
  if (!raw || typeof raw !== "object") {
    return undefined
  }

  const parseOptionalString = (value: unknown): string | null =>
    typeof value === "string" ? value : null

  const id = parseNumericId((raw as Record<string, unknown>).id)
  if (typeof id !== "number") {
    return undefined
  }

  return {
    id,
    title: parseOptionalString((raw as Record<string, unknown>).title),
    citation: parseOptionalString((raw as Record<string, unknown>).citation),
    description: parseOptionalString((raw as Record<string, unknown>).description),
    issuingAuthority: parseOptionalString(
      (raw as Record<string, unknown>).issuing_authority
    ),
    url: parseOptionalString((raw as Record<string, unknown>).url),
    effectiveDate: parseOptionalString((raw as Record<string, unknown>).effective_date)
  }
}

async function fetchDecisionElements(
  options: ReviewworksFetchOptions,
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

  const rows = await fetchReviewworksList<Record<string, unknown>>(
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

export async function loadReviewworksProcessInformation(
  processModelId: number
): Promise<ProcessInformation> {
  if (!Number.isFinite(processModelId)) {
    throw new ProjectPersistenceError("Process model identifier must be numeric.")
  }

  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL and REVIEWWORKS_SUPABASE_ANON_KEY."
    )
  }

  const options = { supabaseUrl, supabaseAnonKey }
  const processModel = await fetchProcessModelRecord(options, processModelId)

  if (!processModel) {
    throw new ProjectPersistenceError(`Process model ${processModelId} was not found.`)
  }

  let legalStructure: ProcessInformation["legalStructure"] | undefined
  if (typeof processModel.legalStructureId === "number") {
    legalStructure = await fetchLegalStructureRecord(options, processModel.legalStructureId)
  }

  const decisionElements = await fetchDecisionElements(options, processModelId)
  decisionElements.sort((a, b) => a.id - b.id)

  return {
    processModel,
    legalStructure,
    decisionElements
  }
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
    body: JSON.stringify(payload)
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
    body: JSON.stringify(payloads)
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
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL and REVIEWWORKS_SUPABASE_ANON_KEY."
    )
  }

  const timestamp = new Date().toISOString()
  const options = { supabaseUrl, supabaseAnonKey, accessToken }

  // Create or update project record
  const projectPayload = buildReviewworksProjectPayload(formData, userId)
  const projectResult = await createReviewworksRecord<{ id: number }>(
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
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
      endpoint.searchParams.set("process_model", `eq.${COMPLEX_REVIEW_PROCESS_MODEL_ID}`)
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
    process_model: COMPLEX_REVIEW_PROCESS_MODEL_ID,
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
  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL and REVIEWWORKS_SUPABASE_ANON_KEY."
    )
  }

  if (!Number.isFinite(projectId)) {
    throw new ProjectPersistenceError("ReviewWorks project identifiers must be numeric.")
  }

  const options = { supabaseUrl, supabaseAnonKey }
  const projectRows = await fetchReviewworksList<ReviewworksProjectRow>(
    options,
    "/rest/v1/project",
    (endpoint) => {
      endpoint.searchParams.set("select", "id,title,last_updated")
      endpoint.searchParams.set("id", `eq.${projectId}`)
    }
  )

  if (projectRows.length === 0) {
    return { exists: false, projectId }
  }

  const projectRow = projectRows[0]
  const processRows = await fetchReviewworksList<ReviewworksProcessInstanceRow>(
    options,
    "/rest/v1/process_instance",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        "id,parent_project_id,description,last_updated,created_at,process_model,status,stage,other"
      )
      endpoint.searchParams.set("parent_project_id", `eq.${projectId}`)
      endpoint.searchParams.set("process_model", `eq.${COMPLEX_REVIEW_PROCESS_MODEL_ID}`)
    }
  )

  const complexReviewProcesses = processRows.filter((row) => isComplexReviewProcess(row))
  let complexReviewProcess: ProjectProcessSummary | undefined

  if (complexReviewProcesses.length > 0) {
    complexReviewProcesses.sort((a, b) => compareByTimestampDesc(a.last_updated, b.last_updated))
    const row = complexReviewProcesses[0]
    const id = parseNumericId(row.id)
    if (typeof id === "number") {
      const description = typeof row.description === "string" ? row.description : null
      complexReviewProcess = {
        id,
        title: COMPLEX_REVIEW_LABEL,
        description,
        lastUpdated: typeof row.last_updated === "string" ? row.last_updated : null,
        createdTimestamp: typeof row.created_at === "string" ? row.created_at : null,
        caseEvents: []
      }
    }
  }

  return {
    exists: true,
    projectId,
    title: normalizeTitle(projectRow.title),
    lastUpdated: typeof projectRow.last_updated === "string" ? projectRow.last_updated : undefined,
    complexReviewProcess
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
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "ReviewWorks credentials are not configured. Set REVIEWWORKS_SUPABASE_URL and REVIEWWORKS_SUPABASE_ANON_KEY."
    )
  }

  const normalizedId = normalizeString(formData.id)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined

  if (!numericId || Number.isNaN(numericId) || !Number.isFinite(numericId)) {
    throw new ProjectPersistenceError("A numeric project identifier is required to update ReviewWorks.")
  }

  const payload = buildReviewworksProjectPayload(formData, userId)

  const response = await fetch(`${supabaseUrl}/rest/v1/project?id=eq.${numericId}`, {
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

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseTimestampMillisLocal(value?: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const timestamp = Date.parse(value)
  if (Number.isFinite(timestamp)) {
    return timestamp
  }
  return undefined
}

function dayKeyFromMillisLocal(millis: number): string {
  const date = new Date(millis)
  return date.toISOString().slice(0, 10)
}

export async function loadComplexReviewAnalytics(): Promise<ComplexReviewAnalyticsPoint[]> {
  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[analytics] ReviewWorks credentials not configured")
    return []
  }

  const options = { supabaseUrl, supabaseAnonKey }

  try {
    // Load all Complex Review process instances
    const processRows = await fetchReviewworksList<ReviewworksProcessInstanceRow>(
      options,
      "/rest/v1/process_instance",
      (endpoint) => {
        endpoint.searchParams.set(
          "select",
          "id,created_at,last_updated,process_model,status"
        )
        endpoint.searchParams.set("process_model", `eq.${COMPLEX_REVIEW_PROCESS_MODEL_ID}`)
      }
    )

    const processIds = processRows
      .map((row) => parseNumericId(row.id))
      .filter((id): id is number => typeof id === "number")

    if (processIds.length === 0) {
      return []
    }

    // Load all case events for those processes
    const caseEvents = await fetchReviewworksList<ReviewworksCaseEventRow>(
      options,
      "/rest/v1/case_event",
      (endpoint) => {
        endpoint.searchParams.set("select", "id,parent_process_id,name,type,status,last_updated,other")
        endpoint.searchParams.set("parent_process_id", `in.(${processIds.join(",")})`)
      }
    )

    // Group events by process
    const eventsByProcess = new Map<number, ReviewworksCaseEventRow[]>()
    for (const event of caseEvents) {
      const processId = parseNumericId(event.parent_process_id)
      if (typeof processId !== "number") {
        continue
      }
      const events = eventsByProcess.get(processId) ?? []
      events.push(event)
      eventsByProcess.set(processId, events)
    }

    // Build a map from process ID to created_at timestamp
    const processCreatedAt = new Map<number, number | undefined>()
    for (const row of processRows) {
      const id = parseNumericId(row.id)
      if (typeof id === "number") {
        processCreatedAt.set(id, parseTimestampMillisLocal(row.created_at))
      }
    }

    // Aggregate completions by date
    const aggregatesByDate = new Map<
      string,
      { count: number; durationSum: number; durationCount: number }
    >()

    for (const [processId, events] of eventsByProcess.entries()) {
      // Sort events by timestamp
      const sorted = [...events].sort((a, b) => {
        const aTime = parseTimestampMillisLocal(a.last_updated)
        const bTime = parseTimestampMillisLocal(b.last_updated)
        if (typeof aTime !== "number" && typeof bTime !== "number") {
          return 0
        }
        if (typeof aTime !== "number") {
          return 1
        }
        if (typeof bTime !== "number") {
          return -1
        }
        return aTime - bTime
      })

      // Find the completion event (status = 'complete', 'completed', or 'done', or outcome = 'approved')
      const completionEvent = sorted.find((event) => {
        const status = typeof event.status === "string" ? event.status.toLowerCase() : ""
        const other = event.other as Record<string, unknown> | undefined
        const outcome = other && typeof other.outcome === "string" ? other.outcome.toLowerCase() : ""
        return status === "complete" || status === "completed" || status === "done" || outcome === "approved"
      })

      if (!completionEvent) {
        continue
      }

      const completionMillis = parseTimestampMillisLocal(completionEvent.last_updated)
      if (typeof completionMillis !== "number") {
        continue
      }

      const completionDateKey = dayKeyFromMillisLocal(completionMillis)
      const aggregate = aggregatesByDate.get(completionDateKey) ?? {
        count: 0,
        durationSum: 0,
        durationCount: 0
      }

      aggregate.count += 1

      // Calculate duration from process creation to completion
      const startMillis = processCreatedAt.get(processId)
      if (typeof startMillis === "number" && startMillis <= completionMillis) {
        const durationDays = (completionMillis - startMillis) / MS_PER_DAY
        if (Number.isFinite(durationDays) && durationDays >= 0) {
          aggregate.durationSum += durationDays
          aggregate.durationCount += 1
        }
      }

      aggregatesByDate.set(completionDateKey, aggregate)
    }

    if (aggregatesByDate.size === 0) {
      return []
    }

    // Generate continuous date range
    const sortedDateKeys = [...aggregatesByDate.keys()].sort()
    const points: ComplexReviewAnalyticsPoint[] = []

    const firstDate = sortedDateKeys[0]
    const lastDate = sortedDateKeys[sortedDateKeys.length - 1]
    const cursor = new Date(`${firstDate}T00:00:00Z`)
    const end = new Date(`${lastDate}T00:00:00Z`)

    while (cursor.getTime() <= end.getTime()) {
      const dateKey = cursor.toISOString().slice(0, 10)
      const aggregate = aggregatesByDate.get(dateKey)

      if (aggregate) {
        const average =
          aggregate.durationCount > 0
            ? Math.round((aggregate.durationSum / aggregate.durationCount) * 100) / 100
            : null

        points.push({
          date: dateKey,
          completionCount: aggregate.count > 0 ? aggregate.count : null,
          averageCompletionDays: average,
          durationSampleSize: aggregate.durationCount,
          durationTotalDays: aggregate.durationCount > 0 ? aggregate.durationSum : null
        })
      } else {
        points.push({
          date: dateKey,
          completionCount: null,
          averageCompletionDays: null,
          durationSampleSize: 0,
          durationTotalDays: null
        })
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    return points
  } catch (error) {
    console.warn("[analytics] Failed to load Complex Review analytics.", error)
    return []
  }
}

export async function loadComplexReviewProcessesForProjects(
  projects: ProjectSummary[]
): Promise<Map<number, ProjectProcessSummary[]>> {
  const supabaseUrl = getReviewworksUrl()
  const supabaseAnonKey = getReviewworksAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Map()
  }

  const projectTitleEntries = projects
    .map((project) => ({
      id: project.id,
      title: normalizeTitle(project.title),
      rawTitle: project.title ?? undefined
    }))
    .filter((project) => project.title)

  if (projectTitleEntries.length === 0) {
    return new Map()
  }

  const uniqueTitles = Array.from(
    new Set(projectTitleEntries.map((project) => project.title))
  ).filter((title): title is string => typeof title === "string")

  if (uniqueTitles.length === 0) {
    return new Map()
  }

  try {
    const options = { supabaseUrl, supabaseAnonKey }
    const titleFilters = uniqueTitles.map((title) => `title.ilike.${quotePostgrestValue(title)}`)

    const reviewworksProjects = await fetchReviewworksList<ReviewworksProjectRow>(
      options,
      "/rest/v1/project",
      (endpoint) => {
        endpoint.searchParams.set("select", "id,title")
        endpoint.searchParams.set("or", `(${titleFilters.join(",")})`)
      }
    )

    const reviewworksProjectsByTitle = new Map<string, ReviewworksProjectRow[]>()
    for (const row of reviewworksProjects) {
      const normalized = normalizeTitle(row.title)?.toLowerCase()
      if (!normalized) {
        continue
      }
      const matches = reviewworksProjectsByTitle.get(normalized) ?? []
      matches.push(row)
      reviewworksProjectsByTitle.set(normalized, matches)
    }

    const portalToReviewworksProjectId = new Map<number, number>()
    for (const entry of projectTitleEntries) {
      const normalizedTitle = entry.title?.toLowerCase()
      if (!normalizedTitle) {
        continue
      }
      const matchedProjects = reviewworksProjectsByTitle.get(normalizedTitle)
      if (!matchedProjects || matchedProjects.length === 0) {
        continue
      }
      const matchedProject = matchedProjects[0]
      const reviewworksProjectId = parseNumericId(matchedProject.id)
      if (typeof reviewworksProjectId !== "number") {
        continue
      }
      portalToReviewworksProjectId.set(entry.id, reviewworksProjectId)
    }

    const reviewworksProjectIds = Array.from(
      new Set(Array.from(portalToReviewworksProjectId.values()))
    )

    if (reviewworksProjectIds.length === 0) {
      return new Map()
    }

    const processRows = await fetchReviewworksList<ReviewworksProcessInstanceRow>(
      options,
      "/rest/v1/process_instance",
      (endpoint) => {
        endpoint.searchParams.set(
          "select",
          "id,parent_project_id,description,last_updated,created_at,process_model,status"
        )
        endpoint.searchParams.set("parent_project_id", `in.(${reviewworksProjectIds.join(",")})`)
        endpoint.searchParams.set("process_model", `eq.${COMPLEX_REVIEW_PROCESS_MODEL_ID}`)
      }
    )

    const complexReviewProcesses = processRows.filter((row) => isComplexReviewProcess(row))
    const processIds = complexReviewProcesses
      .map((row) => parseNumericId(row.id))
      .filter((id): id is number => typeof id === "number")

    const caseEvents = processIds.length
      ? await fetchReviewworksList<ReviewworksCaseEventRow>(
          options,
          "/rest/v1/case_event",
          (endpoint) => {
            endpoint.searchParams.set("select", "id,parent_process_id,name,type,status,last_updated,other")
            endpoint.searchParams.set("parent_process_id", `in.(${processIds.join(",")})`)
          }
        )
      : []

    const caseEventsByProcess = new Map<number, CaseEventSummary[]>()
    for (const row of caseEvents) {
      const processId = parseNumericId(row.parent_process_id)
      const id = parseNumericId(row.id)
      if (typeof processId !== "number" || typeof id !== "number") {
        continue
      }
      const events = caseEventsByProcess.get(processId) ?? []
      events.push({
        id,
        name: typeof row.name === "string" ? row.name : null,
        eventType: typeof row.type === "string" ? row.type : null,
        status: typeof row.status === "string" ? row.status : null,
        lastUpdated: typeof row.last_updated === "string" ? row.last_updated : null,
        data: row.other ?? undefined
      })
      caseEventsByProcess.set(processId, events)
    }

    const processesByReviewworksProject = new Map<number, ProjectProcessSummary[]>()
    for (const row of complexReviewProcesses) {
      const projectId = parseNumericId(row.parent_project_id)
      const id = parseNumericId(row.id)
      if (typeof projectId !== "number" || typeof id !== "number") {
        continue
      }
      const description = typeof row.description === "string" ? row.description : null
      const summary: ProjectProcessSummary = {
        id,
        title: COMPLEX_REVIEW_LABEL,
        description,
        lastUpdated: typeof row.last_updated === "string" ? row.last_updated : null,
        createdTimestamp: typeof row.created_at === "string" ? row.created_at : null,
        caseEvents: []
      }
      const events = caseEventsByProcess.get(id)
      if (events && events.length > 0) {
        events.sort((a, b) => compareByTimestampDesc(a.lastUpdated, b.lastUpdated))
        summary.caseEvents = events
      }
      const existing = processesByReviewworksProject.get(projectId)
      if (existing) {
        existing.push(summary)
      } else {
        processesByReviewworksProject.set(projectId, [summary])
      }
    }

    for (const processes of processesByReviewworksProject.values()) {
      processes.sort((a, b) => compareByTimestampDesc(a.lastUpdated, b.lastUpdated))
    }

    const results = new Map<number, ProjectProcessSummary[]>()
    for (const [portalProjectId, reviewworksProjectId] of portalToReviewworksProjectId.entries()) {
      const processes = processesByReviewworksProject.get(reviewworksProjectId)
      if (processes && processes.length > 0) {
        results.set(portalProjectId, processes)
      }
    }

    return results
  } catch (error) {
    console.warn("[projects] Failed to load ReviewWorks complex review processes.", error)
    return new Map()
  }
}
