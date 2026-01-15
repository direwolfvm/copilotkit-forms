import type { ProjectContact, ProjectFormData } from "../schema/projectSchema"
import { getPermitflowAnonKey, getPermitflowUrl } from "../runtimeConfig"
import {
  ProjectPersistenceError,
  type CaseEventSummary,
  type DecisionElementRecord,
  type ProcessInformation,
  type ProjectProcessSummary,
  type ProjectSummary
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

type PermitflowProjectRow = {
  id?: number | string | null
  title?: string | null
  last_updated?: string | null
}

type PermitflowProcessInstanceRow = {
  id?: number | null
  parent_project_id?: number | null
  title?: string | null
  description?: string | null
  last_updated?: string | null
  created_at?: string | null
  process_model?: number | null
}

type PermitflowCaseEventRow = {
  id?: number | null
  parent_process_id?: number | null
  type?: string | null
  last_updated?: string | null
  other?: unknown
}

const BASIC_PERMIT_LABEL = "Basic Permit"

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

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`
}

function isBasicPermitProcess(row: PermitflowProcessInstanceRow): boolean {
  const haystack = `${row.title ?? ""} ${row.description ?? ""}`.toLowerCase()
  return haystack.includes(BASIC_PERMIT_LABEL.toLowerCase())
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined)
  return Object.fromEntries(entries) as T
}

function buildPermitflowProjectPayload(formData: ProjectFormData): Record<string, unknown> {
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
    data_source_system: "project-portal",
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })
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
  formData,
  accessToken
}: {
  formData: ProjectFormData
  accessToken: string
}): Promise<void> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "PermitFlow credentials are not configured. Set PERMITFLOW_SUPABASE_URL and PERMITFLOW_SUPABASE_ANON_KEY."
    )
  }

  const payload = buildPermitflowProjectPayload(formData)

  const response = await fetch(`${supabaseUrl}/rest/v1/project`, {
    method: "POST",
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
        ? `PermitFlow submit failed (${response.status}): ${errorDetail}`
        : `PermitFlow submit failed (${response.status}).`
    )
  }
}

export type PermitflowProjectStatus = {
  exists: boolean
  projectId: number
  title?: string
  lastUpdated?: string
  basicPermitProcess?: ProjectProcessSummary
}

export async function loadPermitflowProjectStatus(
  projectId: number
): Promise<PermitflowProjectStatus> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "PermitFlow credentials are not configured. Set PERMITFLOW_SUPABASE_URL and PERMITFLOW_SUPABASE_ANON_KEY."
    )
  }

  if (!Number.isFinite(projectId)) {
    throw new ProjectPersistenceError("PermitFlow project identifiers must be numeric.")
  }

  const options = { supabaseUrl, supabaseAnonKey }
  const projectRows = await fetchPermitflowList<PermitflowProjectRow>(
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
  const processRows = await fetchPermitflowList<PermitflowProcessInstanceRow>(
    options,
    "/rest/v1/process_instance",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        "id,parent_project_id,title,description,last_updated,created_at,process_model"
      )
      endpoint.searchParams.set("parent_project_id", `eq.${projectId}`)
      endpoint.searchParams.set(
        "or",
        [
          `title.ilike.*${BASIC_PERMIT_LABEL}*`,
          `description.ilike.*${BASIC_PERMIT_LABEL}*`
        ].join(",")
      )
    }
  )

  const basicPermitProcesses = processRows.filter((row) => isBasicPermitProcess(row))
  let basicPermitProcess: ProjectProcessSummary | undefined

  if (basicPermitProcesses.length > 0) {
    basicPermitProcesses.sort((a, b) => compareByTimestampDesc(a.last_updated, b.last_updated))
    const row = basicPermitProcesses[0]
    const id = parseNumericId(row.id)
    if (typeof id === "number") {
      const description = typeof row.description === "string" ? row.description : null
      const title = typeof row.title === "string" ? row.title : description
      basicPermitProcess = {
        id,
        title,
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
    basicPermitProcess
  }
}

export async function updatePermitflowProject({
  formData,
  accessToken
}: {
  formData: ProjectFormData
  accessToken: string
}): Promise<void> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "PermitFlow credentials are not configured. Set PERMITFLOW_SUPABASE_URL and PERMITFLOW_SUPABASE_ANON_KEY."
    )
  }

  const normalizedId = normalizeString(formData.id)
  const numericId = normalizedId ? Number.parseInt(normalizedId, 10) : undefined

  if (!numericId || Number.isNaN(numericId) || !Number.isFinite(numericId)) {
    throw new ProjectPersistenceError("A numeric project identifier is required to update PermitFlow.")
  }

  const payload = buildPermitflowProjectPayload(formData)

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
        ? `PermitFlow update failed (${response.status}): ${errorDetail}`
        : `PermitFlow update failed (${response.status}).`
    )
  }
}

export async function loadBasicPermitProcessesForProjects(
  projects: ProjectSummary[]
): Promise<Map<number, ProjectProcessSummary[]>> {
  const supabaseUrl = getPermitflowUrl()
  const supabaseAnonKey = getPermitflowAnonKey()
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

    const permitflowProjects = await fetchPermitflowList<PermitflowProjectRow>(
      options,
      "/rest/v1/project",
      (endpoint) => {
        endpoint.searchParams.set("select", "id,title")
        endpoint.searchParams.set("or", titleFilters.join(","))
      }
    )

    const permitflowProjectsByTitle = new Map<string, PermitflowProjectRow[]>()
    for (const row of permitflowProjects) {
      const normalized = normalizeTitle(row.title)?.toLowerCase()
      if (!normalized) {
        continue
      }
      const matches = permitflowProjectsByTitle.get(normalized) ?? []
      matches.push(row)
      permitflowProjectsByTitle.set(normalized, matches)
    }

    const portalToPermitflowProjectId = new Map<number, number>()
    for (const entry of projectTitleEntries) {
      const normalizedTitle = entry.title?.toLowerCase()
      if (!normalizedTitle) {
        continue
      }
      const matchedProjects = permitflowProjectsByTitle.get(normalizedTitle)
      if (!matchedProjects || matchedProjects.length === 0) {
        continue
      }
      if (matchedProjects.length > 1) {
        console.warn("[projects] Multiple PermitFlow projects share a title.", {
          title: entry.rawTitle ?? entry.title,
          permitflowProjectIds: matchedProjects
            .map((project) => parseNumericId(project.id))
            .filter((id): id is number => typeof id === "number")
        })
      }
      const matchedProject = matchedProjects[0]
      const permitflowProjectId = parseNumericId(matchedProject.id)
      if (typeof permitflowProjectId !== "number") {
        continue
      }
      if (permitflowProjectId !== entry.id) {
        console.warn("[projects] PermitFlow project id mismatch for title match.", {
          title: entry.rawTitle ?? entry.title,
          portalProjectId: entry.id,
          permitflowProjectId
        })
      }
      portalToPermitflowProjectId.set(entry.id, permitflowProjectId)
    }

    const permitflowProjectIds = Array.from(
      new Set(Array.from(portalToPermitflowProjectId.values()))
    )

    if (permitflowProjectIds.length === 0) {
      return new Map()
    }

    const processRows = await fetchPermitflowList<PermitflowProcessInstanceRow>(
      options,
      "/rest/v1/process_instance",
      (endpoint) => {
        endpoint.searchParams.set(
          "select",
          "id,parent_project_id,title,description,last_updated,created_at,process_model"
        )
        endpoint.searchParams.set("parent_project_id", `in.(${permitflowProjectIds.join(",")})`)
        endpoint.searchParams.set(
          "or",
          [
            `title.ilike.*${BASIC_PERMIT_LABEL}*`,
            `description.ilike.*${BASIC_PERMIT_LABEL}*`
          ].join(",")
        )
      }
    )

    const basicPermitProcesses = processRows.filter((row) => isBasicPermitProcess(row))
    const processIds = basicPermitProcesses
      .map((row) => parseNumericId(row.id))
      .filter((id): id is number => typeof id === "number")

    const caseEvents = processIds.length
      ? await fetchPermitflowList<PermitflowCaseEventRow>(
          options,
          "/rest/v1/case_event",
          (endpoint) => {
            endpoint.searchParams.set("select", "id,parent_process_id,type,last_updated,other")
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
        eventType: typeof row.type === "string" ? row.type : null,
        lastUpdated: typeof row.last_updated === "string" ? row.last_updated : null,
        data: row.other ?? undefined
      })
      caseEventsByProcess.set(processId, events)
    }

    const processesByPermitflowProject = new Map<number, ProjectProcessSummary[]>()
    for (const row of basicPermitProcesses) {
      const projectId = parseNumericId(row.parent_project_id)
      const id = parseNumericId(row.id)
      if (typeof projectId !== "number" || typeof id !== "number") {
        continue
      }
      const description = typeof row.description === "string" ? row.description : null
      const title = typeof row.title === "string" ? row.title : description
      const summary: ProjectProcessSummary = {
        id,
        title,
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
      const existing = processesByPermitflowProject.get(projectId)
      if (existing) {
        existing.push(summary)
      } else {
        processesByPermitflowProject.set(projectId, [summary])
      }
    }

    for (const processes of processesByPermitflowProject.values()) {
      processes.sort((a, b) => compareByTimestampDesc(a.lastUpdated, b.lastUpdated))
    }

    const results = new Map<number, ProjectProcessSummary[]>()
    for (const [portalProjectId, permitflowProjectId] of portalToPermitflowProjectId.entries()) {
      const processes = processesByPermitflowProject.get(permitflowProjectId)
      if (processes && processes.length > 0) {
        results.set(portalProjectId, processes)
      }
    }

    return results
  } catch (error) {
    console.warn("[projects] Failed to load PermitFlow basic permit processes.", error)
    return new Map()
  }
}
