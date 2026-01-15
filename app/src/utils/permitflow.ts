import type { ProjectContact, ProjectFormData } from "../schema/projectSchema"
import { getPermitflowAnonKey, getPermitflowUrl } from "../runtimeConfig"
import type { PermittingChecklistItem } from "../components/PermittingChecklistSection"
import {
  PRE_SCREENING_PROCESS_MODEL_ID,
  ProjectPersistenceError,
  buildDecisionPayloadRecords,
  buildProjectRecordForDecisionPayloads,
  type DecisionElementMap,
  type DecisionElementRecord,
  type LoadedProjectPortalState,
  type ProcessInformation
} from "./projectPersistence"

type PermitflowFetchOptions = {
  supabaseUrl: string
  supabaseAnonKey: string
}

type PermitflowAuthSession = {
  accessToken: string
  userId: string
  expiresIn?: number
  refreshToken?: string
}

type PermitflowDecisionPayloadContext = {
  portalState: LoadedProjectPortalState
  processInstanceId: number
  projectRecord: Record<string, unknown>
  processModelId: number
  timestamp: string
}

type PermitflowProjectSubmissionArgs = {
  portalState: LoadedProjectPortalState
  accessToken: string
  userId: string
  processModelId?: number
}

const DATA_SOURCE_SYSTEM = "project-portal"

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

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined)
  return Object.fromEntries(entries) as T
}

function buildPermitflowProjectPayload({
  formData,
  userId
}: {
  formData: ProjectFormData
  userId?: string
}): Record<string, unknown> {
  const normalizedId = normalizeString(formData.id)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined
  const timestamp = new Date().toISOString()

  const other = stripUndefined({
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
    participating_agencies: normalizeString(formData.participating_agencies),
    sponsor: normalizeString(formData.sponsor),
    funding: normalizeString(formData.funding),
    location_text: normalizeString(formData.location_text),
    location_lat: normalizeNumber(formData.location_lat),
    location_lon: normalizeNumber(formData.location_lon),
    location_object: normalizeString(formData.location_object),
    sponsor_contact: normalizeContact(formData.sponsor_contact),
    other: Object.keys(other).length > 0 ? other : undefined,
    user_id: normalizeString(userId),
    data_source_system: "project-portal",
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })
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

function buildProcessInstanceDescription(projectTitle: string | null): string {
  if (projectTitle && projectTitle.length > 0) {
    return `${projectTitle} Pre-Screening`
  }
  return "Pre-Screening"
}

function buildCaseEventData(
  processInstanceId: number,
  eventData?: Record<string, unknown> | null
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    process: processInstanceId
  }

  if (eventData && typeof eventData === "object") {
    for (const [key, value] of Object.entries(eventData)) {
      if (typeof value === "undefined") {
        continue
      }
      base[key] = value
    }
  }

  return base
}

function normalizePermittingChecklist(
  checklist: LoadedProjectPortalState["permittingChecklist"]
): PermittingChecklistItem[] {
  return checklist.map((item, index) => ({
    id: `permitflow-${index}`,
    ...item
  }))
}

async function fetchPermitflowList<T>(
  { supabaseUrl, supabaseAnonKey }: PermitflowFetchOptions,
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
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: "application/json"
    }
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFlow request failed (${response.status}): ${errorDetail}`
        : `PermitFlow request failed (${response.status}).`
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
  options: PermitflowFetchOptions,
  processModelId: number
): Promise<ProcessInformation["processModel"] | undefined> {
  const rows = await fetchPermitflowList<Record<string, unknown>>(
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
  options: PermitflowFetchOptions,
  legalStructureId: number
): Promise<ProcessInformation["legalStructure"] | undefined> {
  const rows = await fetchPermitflowList<Record<string, unknown>>(
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

async function createPermitflowProject({
  options,
  formData,
  accessToken,
  userId
}: {
  options: PermitflowFetchOptions
  formData: ProjectFormData
  accessToken: string
  userId: string
}): Promise<number> {
  const payload = buildPermitflowProjectPayload({ formData, userId })

  const response = await fetch(`${options.supabaseUrl}/rest/v1/project`, {
    method: "POST",
    headers: {
      apikey: options.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFlow submit failed (${response.status}): ${errorDetail}`
        : `PermitFlow submit failed (${response.status}).`
    )
  }

  const payloadResponse = responseText ? safeJsonParse(responseText) : undefined
  const projectId = extractNumericId(payloadResponse)
  if (typeof projectId !== "number") {
    throw new ProjectPersistenceError("PermitFlow response did not include a project identifier.")
  }

  return projectId
}

async function createPermitflowProcessInstance({
  options,
  accessToken,
  projectId,
  projectTitle,
  processModelId
}: {
  options: PermitflowFetchOptions
  accessToken: string
  projectId: number
  projectTitle: string | null
  processModelId: number
}): Promise<number> {
  const timestamp = new Date().toISOString()
  const processInstancePayload = stripUndefined({
    description: buildProcessInstanceDescription(projectTitle),
    process_model: processModelId,
    parent_project_id: projectId,
    data_source_system: DATA_SOURCE_SYSTEM,
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })

  const response = await fetch(`${options.supabaseUrl}/rest/v1/process_instance`, {
    method: "POST",
    headers: {
      apikey: options.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(processInstancePayload)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFlow process instance submit failed (${response.status}): ${errorDetail}`
        : `PermitFlow process instance submit failed (${response.status}).`
    )
  }

  const payloadResponse = responseText ? safeJsonParse(responseText) : undefined
  const processInstanceId = extractNumericId(payloadResponse)
  if (typeof processInstanceId !== "number") {
    throw new ProjectPersistenceError(
      "PermitFlow response did not include a process instance identifier."
    )
  }

  return processInstanceId
}

function buildDecisionElementMap(elements: DecisionElementRecord[]): DecisionElementMap {
  const map: DecisionElementMap = new Map()
  for (const element of elements) {
    map.set(element.id, element)
  }
  return map
}

async function buildPermitflowDecisionPayloads({
  portalState,
  processInstanceId,
  projectRecord,
  processModelId,
  timestamp
}: PermitflowDecisionPayloadContext): Promise<Array<Record<string, unknown>>> {
  const options = {
    supabaseUrl: getPermitflowUrl() ?? "",
    supabaseAnonKey: getPermitflowAnonKey() ?? ""
  }

  const elements = await fetchDecisionElements(options, processModelId)
  const decisionElements = buildDecisionElementMap(elements)

  return buildDecisionPayloadRecords({
    processInstanceId,
    timestamp,
    projectRecord,
    decisionElements,
    geospatialResults: portalState.geospatialResults,
    permittingChecklist: normalizePermittingChecklist(portalState.permittingChecklist),
    formData: portalState.formData
  })
}

async function submitPermitflowDecisionPayloads({
  options,
  accessToken,
  records
}: {
  options: PermitflowFetchOptions
  accessToken: string
  records: Array<Record<string, unknown>>
}): Promise<void> {
  if (records.length === 0) {
    return
  }

  const response = await fetch(`${options.supabaseUrl}/rest/v1/process_decision_payload`, {
    method: "POST",
    headers: {
      apikey: options.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(records)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFlow decision payload submit failed (${response.status}): ${errorDetail}`
        : `PermitFlow decision payload submit failed (${response.status}).`
    )
  }
}

async function submitPermitflowCaseEvents({
  options,
  accessToken,
  records
}: {
  options: PermitflowFetchOptions
  accessToken: string
  records: Array<Record<string, unknown>>
}): Promise<void> {
  if (records.length === 0) {
    return
  }

  const response = await fetch(`${options.supabaseUrl}/rest/v1/case_event`, {
    method: "POST",
    headers: {
      apikey: options.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(records)
  })

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `PermitFlow case event submit failed (${response.status}): ${errorDetail}`
        : `PermitFlow case event submit failed (${response.status}).`
    )
  }
}

export async function loadPermitflowProcessInformation(
  processModelId: number
): Promise<ProcessInformation> {
  if (!Number.isFinite(processModelId)) {
    throw new ProjectPersistenceError("Process model identifier must be numeric.")
  }

  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "PermitFlow credentials are not configured. Set PERMITFLOW_SUPABASE_URL and PERMITFLOW_SUPABASE_ANON_KEY."
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
      "PermitFlow credentials are not configured. Set PERMITFLOW_SUPABASE_URL and PERMITFLOW_SUPABASE_ANON_KEY."
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
        ? `PermitFlow authentication failed (${response.status}): ${errorDetail}`
        : `PermitFlow authentication failed (${response.status}).`
    )
  }

  const payload = responseText ? safeJsonParse(responseText) : undefined
  if (!payload || typeof payload !== "object") {
    throw new ProjectPersistenceError("PermitFlow authentication response was empty.")
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
      "PermitFlow authentication response was missing required fields."
    )
  }

  return {
    accessToken,
    userId,
    expiresIn,
    refreshToken
  }
}

export async function submitPermitflowProject({
  portalState,
  accessToken,
  userId,
  processModelId = PRE_SCREENING_PROCESS_MODEL_ID
}: PermitflowProjectSubmissionArgs): Promise<void> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "PermitFlow credentials are not configured. Set PERMITFLOW_SUPABASE_URL and PERMITFLOW_SUPABASE_ANON_KEY."
    )
  }

  const options = { supabaseUrl, supabaseAnonKey }

  const projectId = await createPermitflowProject({
    options,
    formData: portalState.formData,
    accessToken,
    userId
  })

  const normalizedTitle = normalizeString(portalState.formData.title) ?? null
  const processInstanceId = await createPermitflowProcessInstance({
    options,
    accessToken,
    projectId,
    projectTitle: normalizedTitle,
    processModelId
  })

  const timestamp = new Date().toISOString()
  const projectRecord = buildProjectRecordForDecisionPayloads({
    formData: portalState.formData,
    geospatialResults: portalState.geospatialResults
  })

  const decisionPayloads = await buildPermitflowDecisionPayloads({
    portalState,
    processInstanceId,
    projectRecord,
    processModelId,
    timestamp
  })

  const decisionPayloadRecords = decisionPayloads.map((record) =>
    stripUndefined({
      ...record,
      process: processInstanceId,
      project: projectId,
      data_source_system: DATA_SOURCE_SYSTEM,
      last_updated: timestamp,
      retrieved_timestamp: timestamp
    })
  )

  await submitPermitflowDecisionPayloads({
    options,
    accessToken,
    records: decisionPayloadRecords
  })

  const eventRecords: Array<Record<string, unknown>> = []
  const projectInitiatedAt = portalState.portalProgress.projectSnapshot.initiatedAt ?? timestamp
  eventRecords.push(
    stripUndefined({
      parent_process_id: processInstanceId,
      type: "Project initiated",
      data_source_system: DATA_SOURCE_SYSTEM,
      last_updated: projectInitiatedAt,
      retrieved_timestamp: projectInitiatedAt,
      datetime: projectInitiatedAt,
      other: buildCaseEventData(processInstanceId, {
        process: processInstanceId,
        project_id: projectId,
        project_title: normalizedTitle,
        project_snapshot: projectRecord
      })
    })
  )

  const preScreeningInitiatedAt =
    portalState.portalProgress.preScreening.initiatedAt ??
    (decisionPayloadRecords.length > 0 ? timestamp : undefined)
  if (preScreeningInitiatedAt) {
    eventRecords.push(
      stripUndefined({
        parent_process_id: processInstanceId,
        type: "Pre-screening initiated",
        data_source_system: DATA_SOURCE_SYSTEM,
        last_updated: preScreeningInitiatedAt,
        retrieved_timestamp: preScreeningInitiatedAt,
        datetime: preScreeningInitiatedAt,
        other: buildCaseEventData(processInstanceId, {
          process: processInstanceId,
          project_id: projectId,
          total_payloads: decisionPayloadRecords.length
        })
      })
    )
  }

  const preScreeningCompletedAt = portalState.portalProgress.preScreening.completedAt
  if (preScreeningCompletedAt) {
    eventRecords.push(
      stripUndefined({
        parent_process_id: processInstanceId,
        type: "Pre-screening complete",
        data_source_system: DATA_SOURCE_SYSTEM,
        last_updated: preScreeningCompletedAt,
        retrieved_timestamp: preScreeningCompletedAt,
        datetime: preScreeningCompletedAt,
        other: buildCaseEventData(processInstanceId, {
          process: processInstanceId,
          project_id: projectId,
          total_payloads: decisionPayloadRecords.length
        })
      })
    )
  }

  await submitPermitflowCaseEvents({
    options,
    accessToken,
    records: eventRecords
  })
}
