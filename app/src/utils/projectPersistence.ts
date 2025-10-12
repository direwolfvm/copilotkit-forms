import { createEmptyProjectData } from "../schema/projectSchema"
import type { ProjectContact, ProjectFormData } from "../schema/projectSchema"
import type {
  GeospatialResultsState,
  GeospatialServiceState,
  NepassistSummaryItem,
  IpacSummary
} from "../types/geospatial"
import type { PermittingChecklistItem } from "../components/PermittingChecklistSection"
import { getSupabaseAnonKey, getSupabaseUrl } from "../runtimeConfig"
import type { GeometrySource, ProjectGisUpload, UploadedGisFile } from "../types/gis"
import { summarizeNepassist, summarizeIpac } from "./geospatial"

const DATA_SOURCE_SYSTEM = "project-portal"
export const PRE_SCREENING_PROCESS_MODEL_ID = 1
const PRE_SCREENING_TITLE_SUFFIX = "Pre-Screening"
const CASE_EVENT_TYPES = {
  PROJECT_INITIATED: "Project initiated",
  PRE_SCREENING_INITIATED: "Pre-screening initiated",
  PRE_SCREENING_COMPLETE: "Pre-screening complete"
} as const

const SUPABASE_PROXY_PREFIX = "/api/supabase"

type CaseEventType = (typeof CASE_EVENT_TYPES)[keyof typeof CASE_EVENT_TYPES]

type SupabaseFetchRequest = {
  url: string
  init: RequestInit
}

function buildSupabaseFetchRequest(
  endpoint: URL,
  supabaseAnonKey: string,
  init: RequestInit
): SupabaseFetchRequest {
  const headers = new Headers(init.headers ?? undefined)

  let url: string
  if (shouldUseSupabaseProxy()) {
    headers.delete("apikey")
    headers.delete("authorization")
    url = `${SUPABASE_PROXY_PREFIX}${endpoint.pathname}${endpoint.search}${endpoint.hash}`
  } else {
    if (!headers.has("apikey")) {
      headers.set("apikey", supabaseAnonKey)
    }
    if (!headers.has("authorization")) {
      headers.set("Authorization", `Bearer ${supabaseAnonKey}`)
    }
    url = endpoint.toString()
  }

  const finalInit: RequestInit = {
    ...init,
    headers
  }

  return { url, init: finalInit }
}

function shouldUseSupabaseProxy(): boolean {
  return typeof window !== "undefined"
}

export class ProjectPersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "ProjectPersistenceError"
  }
}

type SaveProjectSnapshotArgs = {
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
  gisUpload?: ProjectGisUpload
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
  createCompletionEvent?: boolean
}

type EvaluatePreScreeningDataArgs = {
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
}

export type DecisionElementRecord = {
  id: number
  createdAt: string | null
  processModelId: number | null
  legalStructureId: number | null
  title: string | null
  description: string | null
  measure: string | null
  threshold: number | null
  spatial: boolean | null
  intersect: boolean | null
  spatialReference: unknown
  formText: string | null
  formResponseDescription: string | null
  formData: unknown
  evaluationMethod: string | null
  evaluationDmn: unknown
  category: string | null
  processModelInternalReferenceId: string | null
  parentDecisionElementId: number | null
  other: unknown
  expectedEvaluationData: unknown
  responseData: unknown
  recordOwnerAgency: string | null
  dataSourceAgency: string | null
  dataSourceSystem: string | null
  dataRecordVersion: string | null
  lastUpdated: string | null
  retrievedTimestamp: string | null
}

type DecisionElementMap = Map<number, DecisionElementRecord>

type ProcessModelRecord = {
  id: number
  title: string | null
  description: string | null
  notes: string | null
  screeningDescription: string | null
  agency: string | null
  legalStructureId: number | null
  legalStructureText: string | null
  lastUpdated: string | null
}

type LegalStructureRecord = {
  id: number
  title: string | null
  citation: string | null
  description: string | null
  issuingAuthority: string | null
  url: string | null
  effectiveDate: string | null
}

export type ProcessInformation = {
  processModel: ProcessModelRecord
  legalStructure?: LegalStructureRecord
  decisionElements: DecisionElementRecord[]
}

export type CaseEventSummary = {
  id: number
  eventType?: string | null
  lastUpdated?: string | null
  data?: unknown
}

export type ProjectProcessSummary = {
  id: number
  title?: string | null
  description?: string | null
  lastUpdated?: string | null
  createdTimestamp?: string | null
  caseEvents: CaseEventSummary[]
}

export type ProjectSummary = {
  id: number
  title?: string | null
  description?: string | null
  lastUpdated?: string | null
  geometry?: string | null
}

export type ProjectHierarchy = {
  project: ProjectSummary
  processes: ProjectProcessSummary[]
}

export type LoadedPermittingChecklistItem = Omit<PermittingChecklistItem, "id">

export type LoadedProjectPortalState = {
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
  permittingChecklist: LoadedPermittingChecklistItem[]
  lastUpdated?: string
  gisUpload: ProjectGisUpload
}

export async function saveProjectSnapshot({
  formData,
  geospatialResults,
  gisUpload
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

  const processInstanceId = await getLatestProcessInstanceId({
    supabaseUrl,
    supabaseAnonKey,
    projectId,
    projectTitle: normalizedTitle
  })

  await createCaseEvent({
    supabaseUrl,
    supabaseAnonKey,
    processInstanceId,
    eventType: CASE_EVENT_TYPES.PROJECT_INITIATED,
    eventData: buildProjectInitiatedEventData({
      processInstanceId,
      projectId,
      projectTitle: normalizedTitle,
      projectRecord
    })
  })

  const resolvedGisUpload: ProjectGisUpload = {
    geoJson: typeof formData.location_object === "string" ? formData.location_object : undefined,
    arcgisJson: gisUpload?.arcgisJson,
    source: gisUpload?.source,
    uploadedFile: gisUpload?.uploadedFile ?? null
  }

  await upsertProjectGisDataForProject({
    supabaseUrl,
    supabaseAnonKey,
    projectId,
    upload: resolvedGisUpload,
    projectTitle: normalizedTitle,
    centroidLat: formData.location_lat ?? null,
    centroidLon: formData.location_lon ?? null
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
  permittingChecklist,
  createCompletionEvent = true
}: SubmitDecisionPayloadArgs): Promise<DecisionPayloadEvaluation> {
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

  const missingElements = DECISION_ELEMENT_BUILDERS.filter(
    (builder) => !decisionElements.has(builder.decisionElementId)
  ).map((builder) => builder.title)
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

  const evaluation = evaluateDecisionPayloads(records)

  if (!records.length) {
    return evaluation
  }

  const recordsToSubmit = evaluation.isComplete
    ? records.map((record) => ({
        ...record,
        result_bool: true,
        result: "Complete"
      }))
    : records

  await submitDecisionPayloadRecords({
    supabaseUrl,
    supabaseAnonKey,
    processInstanceId,
    records: recordsToSubmit
  })

  await ensureCaseEvent({
    supabaseUrl,
    supabaseAnonKey,
    processInstanceId,
    eventType: CASE_EVENT_TYPES.PRE_SCREENING_INITIATED,
    eventData: buildPreScreeningInitiatedEventData({
      processInstanceId,
      projectId: numericId,
      evaluation
    })
  })

  if (createCompletionEvent && evaluation.isComplete) {
    await ensureCaseEvent({
      supabaseUrl,
      supabaseAnonKey,
      processInstanceId,
      eventType: CASE_EVENT_TYPES.PRE_SCREENING_COMPLETE,
      eventData: buildPreScreeningCompleteEventData({
        processInstanceId,
        projectId: numericId,
        evaluation
      })
    })
  }

  return evaluation
}

type SubmitDecisionPayloadRecordsArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  processInstanceId: number
  records: Array<Record<string, unknown>>
}

async function submitDecisionPayloadRecords({
  supabaseUrl,
  supabaseAnonKey,
  processInstanceId,
  records
}: SubmitDecisionPayloadRecordsArgs): Promise<void> {
  const endpoint = new URL("/rest/v1/process_decision_payload", supabaseUrl)
  endpoint.searchParams.set("on_conflict", "process,process_decision_element")

  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(records)
  })
  const response = await fetch(url, init)

  const responseText = await response.text()

  if (response.ok) {
    return
  }

  const errorDetail = extractErrorDetail(responseText)

  if (response.status === 400 && isMissingOnConflictConstraintError(errorDetail)) {
    await replaceProcessDecisionPayloadRecords({
      supabaseUrl,
      supabaseAnonKey,
      processInstanceId,
      records
    })
    return
  }

  throw new ProjectPersistenceError(
    errorDetail
      ? `Failed to submit pre-screening data (${response.status}): ${errorDetail}`
      : `Failed to submit pre-screening data (${response.status}).`
  )
}

type ReplaceProcessDecisionPayloadRecordsArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  processInstanceId: number
  records: Array<Record<string, unknown>>
}

async function replaceProcessDecisionPayloadRecords({
  supabaseUrl,
  supabaseAnonKey,
  processInstanceId,
  records
}: ReplaceProcessDecisionPayloadRecordsArgs): Promise<void> {
  await deleteExistingProcessDecisionPayloadRecords({
    supabaseUrl,
    supabaseAnonKey,
    processInstanceId
  })

  const insertEndpoint = new URL("/rest/v1/process_decision_payload", supabaseUrl)

  const { url, init } = buildSupabaseFetchRequest(insertEndpoint, supabaseAnonKey, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(records)
  })
  const insertResponse = await fetch(url, init)

  const insertResponseText = await insertResponse.text()

  if (insertResponse.ok) {
    return
  }

  const errorDetail = extractErrorDetail(insertResponseText)

  throw new ProjectPersistenceError(
    errorDetail
      ? `Failed to submit pre-screening data (${insertResponse.status}): ${errorDetail}`
      : `Failed to submit pre-screening data (${insertResponse.status}).`
  )
}

type DeleteProcessDecisionPayloadRecordsArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  processInstanceId: number
}

async function deleteExistingProcessDecisionPayloadRecords({
  supabaseUrl,
  supabaseAnonKey,
  processInstanceId
}: DeleteProcessDecisionPayloadRecordsArgs): Promise<void> {
  const deleteEndpoint = new URL("/rest/v1/process_decision_payload", supabaseUrl)
  deleteEndpoint.searchParams.set("process", `eq.${processInstanceId}`)
  deleteEndpoint.searchParams.set("data_source_system", `eq.${DATA_SOURCE_SYSTEM}`)

  const { url, init } = buildSupabaseFetchRequest(deleteEndpoint, supabaseAnonKey, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      Prefer: "return=minimal"
    }
  })
  const deleteResponse = await fetch(url, init)

  const deleteResponseText = await deleteResponse.text()

  if (deleteResponse.ok) {
    return
  }

  const errorDetail = extractErrorDetail(deleteResponseText)

  throw new ProjectPersistenceError(
    errorDetail
      ? `Failed to remove existing pre-screening data (${deleteResponse.status}): ${errorDetail}`
      : `Failed to remove existing pre-screening data (${deleteResponse.status}).`
  )
}

function isMissingOnConflictConstraintError(errorDetail?: string): boolean {
  if (!errorDetail) {
    return false
  }

  // Supabase/PostgREST error messages differ slightly depending on the underlying
  // Postgres version and configuration. Normalize the message and search for the
  // common fragments that indicate the ON CONFLICT clause could not be matched to
  // a unique constraint so we can fall back to the delete-and-insert workflow.
  const normalizedDetail = errorDetail.toLowerCase()

  if (normalizedDetail.includes("no unique or exclusion constraint")) {
    return true
  }

  return (
    normalizedDetail.includes("on conflict") && normalizedDetail.includes("unique constraint")
  )
}

type BuildProjectInitiatedEventDataArgs = {
  processInstanceId: number
  projectId: number
  projectTitle: string | null
  projectRecord: Record<string, unknown>
}

function buildProjectInitiatedEventData({
  processInstanceId,
  projectId,
  projectTitle,
  projectRecord
}: BuildProjectInitiatedEventDataArgs): Record<string, unknown> {
  return stripUndefined({
    process: processInstanceId,
    project_id: projectId,
    project_title: projectTitle,
    project_snapshot: projectRecord
  })
}

type BuildPreScreeningEventDataArgs = {
  processInstanceId: number
  projectId: number
  evaluation: DecisionPayloadEvaluation
}

function buildPreScreeningInitiatedEventData({
  processInstanceId,
  projectId,
  evaluation
}: BuildPreScreeningEventDataArgs): Record<string, unknown> {
  return stripUndefined({
    process: processInstanceId,
    project_id: projectId,
    total_payloads: evaluation.total,
    payloads_with_content: evaluation.completedTitles,
    payloads_with_content_count: evaluation.completedTitles.length
  })
}

export type DecisionPayloadEvaluation = {
  total: number
  completedTitles: string[]
  isComplete: boolean
}

function evaluateDecisionPayloads(
  records: Array<Record<string, unknown>>
): DecisionPayloadEvaluation {
  const titles = DECISION_ELEMENT_BUILDERS.map((builder) => builder.title)
  const completedTitles: string[] = []
  const evaluationDataByTitle: Map<string, Record<string, unknown>> = new Map()

  for (let index = 0; index < titles.length; index += 1) {
    const record = records[index]
    if (!record) {
      continue
    }

    const evaluationData = extractDecisionPayloadData(record)
    if (!evaluationData) {
      continue
    }

    evaluationDataByTitle.set(titles[index], evaluationData)

    if (hasMeaningfulDecisionPayloadData(evaluationData)) {
      completedTitles.push(titles[index])
    }
  }

  return {
    total: titles.length,
    completedTitles,
    isComplete: isPreScreeningComplete(evaluationDataByTitle)
  }
}

function buildDecisionPayloadEvaluationRecords({
  projectRecord,
  geospatialResults,
  permittingChecklist,
  formData
}: {
  projectRecord: Record<string, unknown>
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
  formData: ProjectFormData
}): Array<Record<string, unknown>> {
  return DECISION_ELEMENT_BUILDERS.map((builder) => ({
    evaluation_data: builder.build({
      elementId: undefined,
      projectRecord,
      geospatialResults,
      permittingChecklist,
      formData
    })
  }))
}

export function evaluatePreScreeningData({
  formData,
  geospatialResults,
  permittingChecklist
}: EvaluatePreScreeningDataArgs): DecisionPayloadEvaluation {
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

  const evaluationRecords = buildDecisionPayloadEvaluationRecords({
    projectRecord,
    geospatialResults,
    permittingChecklist,
    formData
  })

  return evaluateDecisionPayloads(evaluationRecords)
}

function extractDecisionPayloadData(
  record: Record<string, unknown>
): Record<string, unknown> | null {
  const evaluationData = (record as { evaluation_data?: unknown }).evaluation_data
  if (evaluationData && typeof evaluationData === "object") {
    return evaluationData as Record<string, unknown>
  }

  const data = (record as { data?: unknown }).data
  if (data && typeof data === "object") {
    return data as Record<string, unknown>
  }

  return null
}

function isPreScreeningComplete(
  evaluationDataByTitle: Map<string, Record<string, unknown>>
): boolean {
  const projectDetails = evaluationDataByTitle.get(DECISION_ELEMENT_TITLES.PROJECT_DETAILS)
  if (!hasProjectDetails(projectDetails)) {
    return false
  }

  const nepaAssistPayload = evaluationDataByTitle.get(DECISION_ELEMENT_TITLES.NEPA_ASSIST)
  if (!hasNepaAssistResults(nepaAssistPayload)) {
    return false
  }

  const ipacPayload = evaluationDataByTitle.get(DECISION_ELEMENT_TITLES.IPAC)
  if (!hasIpacResults(ipacPayload)) {
    return false
  }

  const permitNotesPayload = evaluationDataByTitle.get(DECISION_ELEMENT_TITLES.PERMIT_NOTES)
  if (!hasPermitNotesText(permitNotesPayload)) {
    return false
  }

  const categoricalExclusionPayload = evaluationDataByTitle.get(
    DECISION_ELEMENT_TITLES.CE_REFERENCES
  )
  if (!hasCategoricalExclusionText(categoricalExclusionPayload)) {
    return false
  }

  const conditionsPayload = evaluationDataByTitle.get(DECISION_ELEMENT_TITLES.CONDITIONS)
  if (!hasConditionsText(conditionsPayload)) {
    return false
  }

  const resourceNotesPayload = evaluationDataByTitle.get(DECISION_ELEMENT_TITLES.RESOURCE_NOTES)
  if (!hasResourceNotesText(resourceNotesPayload)) {
    return false
  }

  return true
}

function hasProjectDetails(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false
  }

  const project = (payload as { project?: unknown }).project
  if (!project || typeof project !== "object") {
    return false
  }

  if (Array.isArray(project)) {
    return project.length > 0
  }

  return Object.keys(project as Record<string, unknown>).length > 0
}

function hasNepaAssistResults(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false
  }

  const raw = (payload as { nepa_assist_raw?: unknown }).nepa_assist_raw
  const summary = (payload as { nepa_assist_summary?: unknown }).nepa_assist_summary

  return hasNonEmptyValue(raw) || hasNonEmptyValue(summary)
}

function hasIpacResults(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false
  }

  const raw = (payload as { ipac_raw?: unknown }).ipac_raw
  const summary = (payload as { ipac_summary?: unknown }).ipac_summary

  return hasNonEmptyValue(raw) || hasNonEmptyValue(summary)
}

function hasPermitNotesText(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false
  }

  const notes = (payload as { notes?: unknown }).notes
  if (containsMeaningfulText(notes)) {
    return true
  }

  const permits = (payload as { permits?: unknown }).permits
  if (!Array.isArray(permits)) {
    return false
  }

  const ignoredPermitKeys = new Set(["label", "source", "completed"])
  return permits.some((entry) => containsMeaningfulText(entry, ignoredPermitKeys))
}

function hasCategoricalExclusionText(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false
  }

  const rationale = normalizeString(
    (payload as { rationale?: unknown }).rationale as string | null | undefined
  )
  if (rationale) {
    return true
  }

  const candidates = (payload as { ce_candidates?: unknown }).ce_candidates
  if (!Array.isArray(candidates)) {
    return false
  }

  return candidates.some((candidate) =>
    Boolean(normalizeString(candidate as string | null | undefined))
  )
}

function hasConditionsText(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false
  }

  const conditions = (payload as { conditions?: unknown }).conditions
  if (!Array.isArray(conditions)) {
    return false
  }

  return conditions.some((condition) =>
    Boolean(normalizeString(condition as string | null | undefined))
  )
}

function hasResourceNotesText(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false
  }

  const summary = (payload as { summary?: unknown }).summary
  if (containsMeaningfulText(summary)) {
    return true
  }

  const notes = (payload as { notes?: unknown }).notes
  if (containsMeaningfulText(notes)) {
    return true
  }

  const resources = (payload as { resources?: unknown }).resources
  if (!Array.isArray(resources)) {
    return false
  }

  const ignoredResourceKeys = new Set(["name", "status", "meta"])
  return resources.some((resource) => containsMeaningfulText(resource, ignoredResourceKeys))
}

function hasNonEmptyValue(value: unknown): boolean {
  if (value === null || typeof value === "undefined") {
    return false
  }

  if (typeof value === "string") {
    return value.trim().length > 0
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
  }

  if (typeof value === "boolean") {
    return value
  }

  if (Array.isArray(value)) {
    return value.some((entry) => hasNonEmptyValue(entry))
  }

  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0
  }

  return true
}

function containsMeaningfulText(
  value: unknown,
  ignoredKeys: ReadonlySet<string> = new Set()
): boolean {
  if (value === null || typeof value === "undefined") {
    return false
  }

  if (typeof value === "string") {
    return value.trim().length > 0
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsMeaningfulText(entry, ignoredKeys))
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (ignoredKeys.has(key)) {
        continue
      }
      if (containsMeaningfulText(entry, ignoredKeys)) {
        return true
      }
    }
    return false
  }

  return false
}

function hasMeaningfulDecisionPayloadData(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false
  }

  return containsMeaningfulValue(data, new Set(["id", "process"]))
}

function containsMeaningfulValue(value: unknown, ignoredKeys: ReadonlySet<string>): boolean {
  if (value === null || typeof value === "undefined") {
    return false
  }

  if (typeof value === "string") {
    return value.trim().length > 0
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
  }

  if (typeof value === "boolean") {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsMeaningfulValue(entry, ignoredKeys))
  }

  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (ignoredKeys.has(key)) {
        continue
      }
      if (containsMeaningfulValue(entry, ignoredKeys)) {
        return true
      }
    }
    return false
  }

  return true
}

type CaseEventArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  processInstanceId: number
  eventType: CaseEventType
  eventData?: Record<string, unknown> | null
}

async function ensureCaseEvent({
  supabaseUrl,
  supabaseAnonKey,
  processInstanceId,
  eventType,
  eventData
}: CaseEventArgs): Promise<void> {
  const exists = await caseEventExists({
    supabaseUrl,
    supabaseAnonKey,
    processInstanceId,
    eventType
  })

  if (exists) {
    return
  }

  await createCaseEvent({
    supabaseUrl,
    supabaseAnonKey,
    processInstanceId,
    eventType,
    eventData
  })
}

type CaseEventIdentifier = {
  supabaseUrl: string
  supabaseAnonKey: string
  processInstanceId: number
  eventType: CaseEventType
}

async function caseEventExists({
  supabaseUrl,
  supabaseAnonKey,
  processInstanceId,
  eventType
}: CaseEventIdentifier): Promise<boolean> {
  const endpoint = new URL("/rest/v1/case_event", supabaseUrl)
  endpoint.searchParams.set("select", "id")
  endpoint.searchParams.set("parent_process_id", `eq.${processInstanceId}`)
  endpoint.searchParams.set("type", `eq.${eventType}`)
  endpoint.searchParams.set("limit", "1")

  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "GET"
  })
  const response = await fetch(url, init)

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)

    throw new ProjectPersistenceError(
      errorDetail
        ? `Failed to check case events (${response.status}): ${errorDetail}`
        : `Failed to check case events (${response.status}).`
    )
  }

  if (!responseText) {
    return false
  }

  const payload = safeJsonParse(responseText)

  if (!Array.isArray(payload)) {
    return false
  }

  return payload.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false
    }
    const id = (entry as { id?: unknown }).id
    return typeof id === "number" && Number.isFinite(id)
  })
}

async function createCaseEvent({
  supabaseUrl,
  supabaseAnonKey,
  processInstanceId,
  eventType,
  eventData
}: CaseEventArgs): Promise<void> {
  const endpoint = new URL("/rest/v1/case_event", supabaseUrl)
  const timestamp = new Date().toISOString()

  const payload = stripUndefined({
    parent_process_id: processInstanceId,
    type: eventType,
    data_source_system: DATA_SOURCE_SYSTEM,
    last_updated: timestamp,
    retrieved_timestamp: timestamp,
    other: buildCaseEventData(processInstanceId, eventData)
  })

  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  })
  const response = await fetch(url, init)

  const responseText = await response.text()

  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)

    throw new ProjectPersistenceError(
      errorDetail
        ? `Failed to record "${eventType}" case event (${response.status}): ${errorDetail}`
        : `Failed to record "${eventType}" case event (${response.status}).`
    )
  }
}

type UpsertProjectGisDataArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
  upload: ProjectGisUpload
  projectTitle?: string | null
  centroidLat?: number | null
  centroidLon?: number | null
}

async function upsertProjectGisDataForProject({
  supabaseUrl,
  supabaseAnonKey,
  projectId,
  upload,
  projectTitle,
  centroidLat,
  centroidLon
}: UpsertProjectGisDataArgs): Promise<void> {
  const file = upload.uploadedFile
  const hasUploadedFile =
    !!file && typeof file.base64Data === "string" && file.base64Data.trim().length > 0
  const hasGeoJson = typeof upload.geoJson === "string" && upload.geoJson.trim().length > 0
  const hasArcgisJson =
    typeof upload.arcgisJson === "string" && upload.arcgisJson.trim().length > 0

  if (!hasUploadedFile && !hasGeoJson && !hasArcgisJson) {
    await deleteProjectGisDataForProject({ supabaseUrl, supabaseAnonKey, projectId })
    return
  }

  const normalizedUpload: ProjectGisUpload = { ...upload }
  if (!hasUploadedFile) {
    normalizedUpload.uploadedFile = null
  }
  if (hasGeoJson) {
    normalizedUpload.geoJson = upload.geoJson!.trim()
  } else {
    delete normalizedUpload.geoJson
  }
  if (hasArcgisJson) {
    normalizedUpload.arcgisJson = upload.arcgisJson!.trim()
  } else {
    delete normalizedUpload.arcgisJson
  }

  const timestamp = new Date().toISOString()
  const container = buildGisDataContainer(normalizedUpload, timestamp)
  const metadata = buildProjectBoundaryMetadata({
    upload: normalizedUpload,
    timestamp,
    projectTitle,
    centroidLat,
    centroidLon
  })

  const payload = stripUndefined({
    parent_project_id: projectId,
    description: metadata.description,
    container_inventory: metadata.containerInventory,
    data_container: container,
    centroid_lat: metadata.centroidLat,
    centroid_lon: metadata.centroidLon,
    extent: metadata.extentText,
    data_source_system: DATA_SOURCE_SYSTEM,
    updated_last: timestamp,
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })

  const updateEndpoint = new URL("/rest/v1/gis_data", supabaseUrl)
  updateEndpoint.searchParams.set("parent_project_id", `eq.${projectId}`)

  const updateRequest = buildSupabaseFetchRequest(updateEndpoint, supabaseAnonKey, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  })

  const updateResponse = await fetch(updateRequest.url, updateRequest.init)
  const updateResponseText = await updateResponse.text()

  if (!updateResponse.ok) {
    const detail = extractErrorDetail(updateResponseText)
    throw new ProjectPersistenceError(
      detail
        ? `Failed to update existing GIS data (${updateResponse.status}): ${detail}`
        : `Failed to update existing GIS data (${updateResponse.status}).`
    )
  }

  const updatedRecords = updateResponseText ? safeJsonParse(updateResponseText) : undefined
  if (Array.isArray(updatedRecords) && updatedRecords.length > 0) {
    return
  }

  const insertEndpoint = new URL("/rest/v1/gis_data", supabaseUrl)

  const { url, init } = buildSupabaseFetchRequest(insertEndpoint, supabaseAnonKey, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  })

  const response = await fetch(url, init)
  if (!response.ok) {
    const responseText = await response.text()
    const detail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      detail
        ? `Failed to store uploaded GIS data (${response.status}): ${detail}`
        : `Failed to store uploaded GIS data (${response.status}).`
    )
  }
}

type DeleteProjectGisDataArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
}

async function deleteProjectGisDataForProject({
  supabaseUrl,
  supabaseAnonKey,
  projectId
}: DeleteProjectGisDataArgs): Promise<void> {
  const endpoint = new URL("/rest/v1/gis_data", supabaseUrl)
  endpoint.searchParams.set("parent_project_id", `eq.${projectId}`)

  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "DELETE",
    headers: { Prefer: "count=exact" }
  })

  const response = await fetch(url, init)
  if (!response.ok) {
    const responseText = await response.text()
    const detail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      detail
        ? `Failed to remove GIS data (${response.status}): ${detail}`
        : `Failed to remove GIS data (${response.status}).`
    )
  }
}

type FetchProjectGisDataArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
}

type FetchedGisUpload = {
  upload: ProjectGisUpload
  updatedAt?: string
}

async function fetchProjectGisDataUpload({
  supabaseUrl,
  supabaseAnonKey,
  projectId
}: FetchProjectGisDataArgs): Promise<FetchedGisUpload | null> {
  const endpoint = new URL("/rest/v1/gis_data", supabaseUrl)
  endpoint.searchParams.set("select", "id,data_container,updated_last,last_updated,retrieved_timestamp")
  endpoint.searchParams.set("parent_project_id", `eq.${projectId}`)
  endpoint.searchParams.set("order", "updated_last.desc.nullslast")
  endpoint.searchParams.set("limit", "1")

  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "GET"
  })

  const response = await fetch(url, init)
  const responseText = await response.text()

  if (!response.ok) {
    const detail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      detail
        ? `Failed to fetch GIS data (${response.status}): ${detail}`
        : `Failed to fetch GIS data (${response.status}).`
    )
  }

  const payload = responseText ? safeJsonParse(responseText) : undefined
  if (!Array.isArray(payload) || payload.length === 0) {
    return null
  }

  const record = payload[0] as {
    data_container?: unknown
    updated_last?: string | null
    last_updated?: string | null
    retrieved_timestamp?: string | null
  }

  const upload: ProjectGisUpload = {}
  const container = record?.data_container

  if (container && typeof container === "object") {
    const containerObj = container as Record<string, unknown>

    const geoJsonCandidate = containerObj.geoJson
    if (typeof geoJsonCandidate === "string") {
      upload.geoJson = geoJsonCandidate
    } else if (geoJsonCandidate && typeof geoJsonCandidate === "object") {
      try {
        upload.geoJson = JSON.stringify(geoJsonCandidate)
      } catch {
        // ignore serialization errors
      }
    }

    const arcgisCandidate = containerObj.arcgisJson
    if (typeof arcgisCandidate === "string") {
      upload.arcgisJson = arcgisCandidate
    } else if (arcgisCandidate && typeof arcgisCandidate === "object") {
      try {
        upload.arcgisJson = JSON.stringify(arcgisCandidate)
      } catch {
        // ignore serialization errors
      }
    }

    const sourceCandidate = containerObj.source
    if (typeof sourceCandidate === "string") {
      upload.source = sourceCandidate as GeometrySource
    }

    const fileCandidate = containerObj.originalFile
    if (fileCandidate && typeof fileCandidate === "object") {
      const fileRecord = fileCandidate as Record<string, unknown>
      const formatCandidate = fileRecord.format
      const base64Candidate = fileRecord.base64Data
      const fileNameCandidate = fileRecord.fileName
      const fileSizeCandidate = fileRecord.fileSize

      if (
        (formatCandidate === "kml" || formatCandidate === "kmz") &&
        typeof base64Candidate === "string" &&
        typeof fileNameCandidate === "string" &&
        typeof fileSizeCandidate === "number"
      ) {
        const uploadedFile: UploadedGisFile = {
          format: formatCandidate,
          base64Data: base64Candidate,
          fileName: fileNameCandidate,
          fileSize: fileSizeCandidate,
          fileType: typeof fileRecord.fileType === "string" ? fileRecord.fileType : undefined,
          lastModified:
            typeof fileRecord.lastModified === "number" && Number.isFinite(fileRecord.lastModified)
              ? (fileRecord.lastModified as number)
              : undefined
        }
        upload.uploadedFile = uploadedFile
      }
    }
  }

  const updatedAt =
    (typeof record.updated_last === "string" && record.updated_last) ||
    (typeof record.last_updated === "string" && record.last_updated) ||
    (typeof record.retrieved_timestamp === "string" && record.retrieved_timestamp) ||
    undefined

  return { upload, updatedAt }
}

function buildGisDataContainer(upload: ProjectGisUpload, timestamp: string): Record<string, unknown> {
  const container: Record<string, unknown> = { storedAt: timestamp }

  if (upload.geoJson) {
    const parsed = safeJsonParse(upload.geoJson)
    container.geoJson = parsed ?? upload.geoJson
  }

  if (upload.arcgisJson) {
    const parsed = safeJsonParse(upload.arcgisJson)
    container.arcgisJson = parsed ?? upload.arcgisJson
  }

  if (upload.source) {
    container.source = upload.source
  }

  if (upload.uploadedFile) {
    const file = upload.uploadedFile
    container.originalFile = stripUndefined({
      format: file.format,
      fileName: file.fileName,
      fileSize: file.fileSize,
      fileType: file.fileType,
      base64Data: file.base64Data,
      lastModified: file.lastModified,
      storedAt: timestamp
    })
  }

  return container
}

type ProjectBoundaryMetadataArgs = {
  upload: ProjectGisUpload
  timestamp: string
  projectTitle?: string | null
  centroidLat?: number | null
  centroidLon?: number | null
}

type ProjectBoundaryMetadata = {
  description: string | null
  containerInventory: Record<string, unknown> | null
  centroidLat: number | null
  centroidLon: number | null
  extentText: string | null
}

type ProjectBoundarySummary = {
  geometryType?: string
  extent?: {
    latitude: { min: number; max: number }
    longitude: { min: number; max: number }
  }
  centroid?: { latitude: number; longitude: number }
  coordinateCount: number
}

function buildProjectBoundaryMetadata({
  upload,
  timestamp,
  projectTitle,
  centroidLat,
  centroidLon
}: ProjectBoundaryMetadataArgs): ProjectBoundaryMetadata {
  const geoJsonObject = parseProjectBoundaryGeoJson(upload.geoJson)
  const summary = geoJsonObject ? summarizeProjectBoundaryGeometry(geoJsonObject) : null
  const availableFormats = determineAvailableFormats(upload)

  const description = summary || availableFormats.length > 0
    ? buildProjectBoundaryDescription({
        projectTitle: projectTitle ?? undefined,
        geometryType: summary?.geometryType,
        source: upload.source,
        availableFormats
      })
    : null

  const centroidLatitudeCandidate =
    typeof centroidLat === "number" && Number.isFinite(centroidLat)
      ? centroidLat
      : summary?.centroid?.latitude
  const centroidLongitudeCandidate =
    typeof centroidLon === "number" && Number.isFinite(centroidLon)
      ? centroidLon
      : summary?.centroid?.longitude

  const normalizedCentroidLat = normalizeNumber(centroidLatitudeCandidate)
  const normalizedCentroidLon = normalizeNumber(centroidLongitudeCandidate)

  const extentText = summary?.extent ? JSON.stringify(summary.extent) : null

  const inventoryEntry = buildProjectBoundaryInventoryEntry({
    upload,
    summary,
    description,
    timestamp,
    availableFormats
  })

  return {
    description: description ?? null,
    containerInventory: inventoryEntry ? { projectBoundary: inventoryEntry } : null,
    centroidLat: normalizedCentroidLat,
    centroidLon: normalizedCentroidLon,
    extentText
  }
}

function parseProjectBoundaryGeoJson(rawGeoJson: unknown): unknown | null {
  if (!rawGeoJson) {
    return null
  }

  if (typeof rawGeoJson === "string") {
    const parsed = safeJsonParse(rawGeoJson)
    if (parsed && typeof parsed === "object") {
      return parsed
    }
    return null
  }

  if (typeof rawGeoJson === "object") {
    return rawGeoJson
  }

  return null
}

function summarizeProjectBoundaryGeometry(value: unknown): ProjectBoundarySummary | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const coordinates: Array<[number, number]> = []
  collectCoordinatesFromGeoJson(value, coordinates, new Set())

  const summary: ProjectBoundarySummary = {
    geometryType: extractProjectBoundaryGeometryType(value),
    coordinateCount: coordinates.length
  }

  if (coordinates.length === 0) {
    return summary
  }

  let minLon = Number.POSITIVE_INFINITY
  let maxLon = Number.NEGATIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY
  let sumLon = 0
  let sumLat = 0

  for (const [lon, lat] of coordinates) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    sumLon += lon
    sumLat += lat
  }

  if (
    Number.isFinite(minLon) &&
    Number.isFinite(maxLon) &&
    Number.isFinite(minLat) &&
    Number.isFinite(maxLat)
  ) {
    summary.extent = {
      latitude: { min: minLat, max: maxLat },
      longitude: { min: minLon, max: maxLon }
    }
  }

  const coordinateCount = coordinates.length
  if (coordinateCount > 0) {
    summary.centroid = {
      latitude: sumLat / coordinateCount,
      longitude: sumLon / coordinateCount
    }
  }

  return summary
}

function collectCoordinatesFromGeoJson(
  value: unknown,
  result: Array<[number, number]>,
  seen: Set<unknown>
): void {
  if (!value || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return
  }

  if (Array.isArray(value)) {
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      result.push([value[0], value[1]])
      return
    }
    for (const entry of value) {
      collectCoordinatesFromGeoJson(entry, result, seen)
    }
    return
  }

  if (typeof value !== "object" || value === null) {
    return
  }

  if (seen.has(value)) {
    return
  }
  seen.add(value)

  const record = value as Record<string, unknown>

  if (record.type === "Feature" && record.geometry) {
    collectCoordinatesFromGeoJson(record.geometry, result, seen)
  }

  if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
    for (const feature of record.features) {
      collectCoordinatesFromGeoJson(feature, result, seen)
    }
  }

  if (record.type === "GeometryCollection" && Array.isArray(record.geometries)) {
    for (const geometry of record.geometries) {
      collectCoordinatesFromGeoJson(geometry, result, seen)
    }
  }

  if (Array.isArray(record.coordinates)) {
    collectCoordinatesFromGeoJson(record.coordinates, result, seen)
  }
}

function extractProjectBoundaryGeometryType(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const record = value as Record<string, unknown>
  const typeValue = typeof record.type === "string" ? record.type : undefined

  if (!typeValue) {
    return undefined
  }

  if (typeValue === "Feature") {
    return extractProjectBoundaryGeometryType(record.geometry)
  }

  if (typeValue === "FeatureCollection" && Array.isArray(record.features)) {
    const geometryTypes = new Set<string>()
    for (const feature of record.features) {
      const childType = extractProjectBoundaryGeometryType(feature)
      if (childType) {
        geometryTypes.add(childType)
      }
    }
    if (geometryTypes.size === 1) {
      return geometryTypes.values().next().value
    }
    if (geometryTypes.size > 1) {
      return "Mixed"
    }
    return undefined
  }

  if (typeValue === "GeometryCollection" && Array.isArray(record.geometries)) {
    const geometryTypes = new Set<string>()
    for (const geometry of record.geometries) {
      const childType = extractProjectBoundaryGeometryType(geometry)
      if (childType) {
        geometryTypes.add(childType)
      }
    }
    if (geometryTypes.size === 1) {
      return geometryTypes.values().next().value
    }
    if (geometryTypes.size > 1) {
      return "Mixed"
    }
    return undefined
  }

  return typeValue
}

function determineAvailableFormats(upload: ProjectGisUpload): string[] {
  const formats: string[] = []
  if (upload.geoJson) {
    formats.push("GeoJSON")
  }
  if (upload.arcgisJson) {
    formats.push("ArcGIS JSON")
  }
  const originalFormat = upload.uploadedFile?.format
  if (originalFormat === "kml") {
    formats.push("KML")
  } else if (originalFormat === "kmz") {
    formats.push("KMZ")
  } else if (originalFormat === "geojson") {
    formats.push("GeoJSON (uploaded file)")
  }
  return Array.from(new Set(formats))
}

function describeGeometrySource(source: GeometrySource | undefined): string | null {
  switch (source) {
    case "draw":
      return "interactive sketching tools"
    case "search":
      return "map search results"
    case "upload":
      return "an uploaded file"
    default:
      return null
  }
}

function buildProjectBoundaryDescription({
  projectTitle,
  geometryType,
  source,
  availableFormats
}: {
  projectTitle?: string
  geometryType?: string
  source?: GeometrySource
  availableFormats: string[]
}): string {
  const segments: string[] = []

  if (projectTitle && projectTitle.trim().length > 0) {
    segments.push(`Project boundary for "${projectTitle.trim()}".`)
  } else {
    segments.push("Project boundary geometry.")
  }

  if (geometryType) {
    segments.push(`Geometry type: ${geometryType}.`)
  }

  const sourceDescription = describeGeometrySource(source)
  if (sourceDescription) {
    segments.push(`Captured via ${sourceDescription}.`)
  }

  if (availableFormats.length > 0) {
    segments.push(`Available formats: ${availableFormats.join(", ")}.`)
  }

  return segments.join(" ")
}

function buildProjectBoundaryInventoryEntry({
  upload,
  summary,
  description,
  timestamp,
  availableFormats
}: {
  upload: ProjectGisUpload
  summary: ProjectBoundarySummary | null
  description: string | null
  timestamp: string
  availableFormats: string[]
}): Record<string, unknown> | null {
  if (!summary && availableFormats.length === 0 && !upload.uploadedFile) {
    return null
  }

  const entry: Record<string, unknown> = {
    name: "Project Boundary",
    storedAt: timestamp
  }

  if (description) {
    entry.description = description
  }

  if (summary?.geometryType) {
    entry.geometryType = summary.geometryType
  }

  if (summary?.coordinateCount && summary.coordinateCount > 0) {
    entry.coordinateCount = summary.coordinateCount
  }

  if (availableFormats.length > 0) {
    entry.availableFormats = availableFormats
  }

  if (upload.source) {
    entry.source = upload.source
  }

  if (summary?.extent) {
    entry.extent = summary.extent
  }

  if (summary?.centroid) {
    entry.centroid = summary.centroid
  }

  if (upload.uploadedFile) {
    const file = upload.uploadedFile
    entry.originalFile = stripUndefined({
      format: file.format,
      fileName: file.fileName,
      fileSize: file.fileSize,
      fileType: file.fileType,
      lastModified: file.lastModified,
      storedAt: timestamp
    })
  }

  return entry
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

function buildPreScreeningCompleteEventData({
  processInstanceId,
  projectId,
  evaluation
}: BuildPreScreeningEventDataArgs): Record<string, unknown> {
  return stripUndefined({
    process: processInstanceId,
    project_id: projectId,
    total_payloads: evaluation.total,
    payloads_with_content: evaluation.completedTitles,
    payloads_with_content_count: evaluation.completedTitles.length
  })
}

type CreatePreScreeningProcessInstanceArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
  projectTitle: string | null
  existingProcessInstanceId?: number
}

async function createPreScreeningProcessInstance({
  supabaseUrl,
  supabaseAnonKey,
  projectId,
  projectTitle,
  existingProcessInstanceId
}: CreatePreScreeningProcessInstanceArgs): Promise<number> {
  const timestamp = new Date().toISOString()

  const processInstancePayload = stripUndefined({
    description: buildProcessInstanceDescription(projectTitle),
    process_model: PRE_SCREENING_PROCESS_MODEL_ID,
    parent_project_id: projectId,
    data_source_system: DATA_SOURCE_SYSTEM,
    last_updated: timestamp,
    retrieved_timestamp: timestamp
  })

  if (typeof existingProcessInstanceId === "number") {
    const endpoint = new URL("/rest/v1/process_instance", supabaseUrl)
    endpoint.searchParams.set("id", `eq.${existingProcessInstanceId}`)

    const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(processInstancePayload)
    })
    const response = await fetch(url, init)

    const responseText = await response.text()

    if (!response.ok) {
      const errorDetail = extractErrorDetail(responseText)

      throw new ProjectPersistenceError(
        errorDetail
          ? `Failed to update process instance (${response.status}): ${errorDetail}`
          : `Failed to update process instance (${response.status}).`
      )
    }

    return existingProcessInstanceId
  }

  const endpoint = new URL("/rest/v1/process_instance", supabaseUrl)

  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(processInstancePayload)
  })
  const response = await fetch(url, init)

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

  return createPreScreeningProcessInstance({
    supabaseUrl,
    supabaseAnonKey,
    projectId,
    projectTitle,
    existingProcessInstanceId: existingId
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
  const record = await fetchLatestPreScreeningProcessInstanceRecord({
    supabaseUrl,
    supabaseAnonKey,
    projectId
  })
  const processInstanceId = parseNumericId(record?.id)
  return typeof processInstanceId === "number" ? processInstanceId : undefined
}

type FetchDecisionElementsArgs = {
  supabaseUrl: string
  supabaseAnonKey: string
  processModelId?: number
}

async function fetchDecisionElements({
  supabaseUrl,
  supabaseAnonKey,
  processModelId
}: FetchDecisionElementsArgs): Promise<DecisionElementMap> {
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

  const endpoint = new URL("/rest/v1/decision_element", supabaseUrl)
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
  const resolvedProcessModelId =
    typeof processModelId === "number" && Number.isFinite(processModelId)
      ? processModelId
      : PRE_SCREENING_PROCESS_MODEL_ID
  endpoint.searchParams.set("process_model", `eq.${resolvedProcessModelId}`)

  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "GET"
  })
  const response = await fetch(url, init)

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
      const record = parseDecisionElementRecord(entry)

      if (!record) {
        continue
      }

      map.set(record.id, record)
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
  elementId: number | undefined
  projectRecord: Record<string, unknown>
  geospatialResults: GeospatialResultsState
  permittingChecklist: PermittingChecklistItem[]
  formData: ProjectFormData
}

type DecisionElementBuilder = {
  decisionElementId: number
  title: string
  build: (context: DecisionPayloadBuilderContext) => Record<string, unknown>
}

const DECISION_ELEMENT_BUILDERS: ReadonlyArray<DecisionElementBuilder> = [
  {
    decisionElementId: 1,
    title: "Provide complete project details",
    build: buildProjectDetailsPayload
  },
  {
    decisionElementId: 2,
    title: "Confirm or upload NEPA Assist results if auto fetch fails",
    build: buildNepaAssistPayload
  },
  {
    decisionElementId: 3,
    title: "Confirm or upload IPaC results if auto fetch fails",
    build: buildIpacPayload
  },
  {
    decisionElementId: 4,
    title: "Provide permit applicability notes",
    build: buildPermitNotesPayload
  },
  {
    decisionElementId: 5,
    title: "Enter CE references and rationale",
    build: buildCategoricalExclusionPayload
  },
  {
    decisionElementId: 6,
    title: "List applicable conditions and notes",
    build: buildConditionsPayload
  },
  {
    decisionElementId: 7,
    title: "Provide resource-by-resource notes",
    build: buildResourceNotesPayload
  }
]

const DECISION_ELEMENT_TITLES = {
  PROJECT_DETAILS: DECISION_ELEMENT_BUILDERS[0]?.title ?? "Provide complete project details",
  NEPA_ASSIST: DECISION_ELEMENT_BUILDERS[1]?.title ?? "Confirm or upload NEPA Assist results if auto fetch fails",
  IPAC: DECISION_ELEMENT_BUILDERS[2]?.title ?? "Confirm or upload IPaC results if auto fetch fails",
  PERMIT_NOTES: DECISION_ELEMENT_BUILDERS[3]?.title ?? "Provide permit applicability notes",
  CE_REFERENCES: DECISION_ELEMENT_BUILDERS[4]?.title ?? "Enter CE references and rationale",
  CONDITIONS: DECISION_ELEMENT_BUILDERS[5]?.title ?? "List applicable conditions and notes",
  RESOURCE_NOTES: DECISION_ELEMENT_BUILDERS[6]?.title ?? "Provide resource-by-resource notes"
} as const

const CEQ_PROJECT_FIELDS = [
  "id",
  "created_at",
  "title",
  "description",
  "sector",
  "lead_agency",
  "participating_agencies",
  "location_lat",
  "location_lon",
  "location_object",
  "type",
  "funding",
  "start_date",
  "current_status",
  "sponsor",
  "sponsor_contact",
  "parent_project_id",
  "location_text",
  "other",
  "record_owner_agency",
  "data_source_agency",
  "data_source_system",
  "data_record_version",
  "last_updated",
  "retrieved_timestamp"
] as const

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
    const element = decisionElements.get(builder.decisionElementId)

    if (!element) {
      console.warn(
        `Decision element "${builder.title}" is not configured; using fallback payload metadata.`
      )
    }

    const baseData = builder.build({
      elementId: element?.id,
      projectRecord,
      geospatialResults,
      permittingChecklist,
      formData
    })

    const evaluationData = (() => {
      if (element) {
        return baseData
      }

      const withFallback: Record<string, unknown> = { ...baseData }
      const existingId = (baseData as { id?: unknown }).id
      if (typeof existingId !== "number" && typeof existingId !== "string") {
        withFallback.id = builder.title
      }

      const existingTitle = (baseData as { title?: unknown }).title
      if (typeof existingTitle !== "string" || existingTitle.length === 0) {
        withFallback.title = builder.title
      }

      return withFallback
    })()

    records.push(
      stripUndefined({
        process: processInstanceId,
        process_decision_element: element?.id ?? null,
        data_source_system: DATA_SOURCE_SYSTEM,
        last_updated: timestamp,
        retrieved_timestamp: timestamp,
        evaluation_data: evaluationData
      })
    )
  }

  return records
}

function pickCeqProjectDetails(record: Record<string, unknown>): Record<string, unknown> {
  const selected: Record<string, unknown> = {}

  for (const field of CEQ_PROJECT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      if (field === "other") {
        const sanitizedOther = sanitizeProjectOtherForDecisionPayload(
          (record as Record<string, unknown>)[field]
        )
        if (typeof sanitizedOther !== "undefined") {
          selected.other = sanitizedOther
        }
        continue
      }
      selected[field] = (record as Record<string, unknown>)[field]
    }
  }

  return stripUndefined(selected)
}

function sanitizeProjectOtherForDecisionPayload(
  value: unknown
): Record<string, unknown> | null | undefined {
  if (typeof value === "undefined") {
    return undefined
  }

  if (value === null) {
    return null
  }

  if (typeof value === "string") {
    const normalized = normalizeString(value)
    return normalized ? { notes: normalized } : null
  }

  if (typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}

  const notes = normalizeString(record.notes as string | null | undefined)
  if (notes) {
    sanitized.notes = notes
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null
}

function buildProjectDetailsPayload({
  elementId,
  projectRecord
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const ceqProjectRecord = pickCeqProjectDetails(projectRecord)
  const hasDetails = hasAnyKeys(ceqProjectRecord)
  return stripUndefined({
    id: typeof elementId === "number" ? elementId : undefined,
    project: hasDetails ? ceqProjectRecord : null
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
    id: typeof elementId === "number" ? elementId : undefined,
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
    id: typeof elementId === "number" ? elementId : undefined,
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
    id: typeof elementId === "number" ? elementId : undefined,
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
    id: typeof elementId === "number" ? elementId : undefined,
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

  return stripUndefined({
    id: typeof elementId === "number" ? elementId : undefined,
    conditions: conditions.length > 0 ? conditions : null
  })
}

function buildResourceNotesPayload({
  elementId,
  geospatialResults,
  formData
}: DecisionPayloadBuilderContext): Record<string, unknown> {
  const resources = buildResourceEntries(geospatialResults)
  const summary = buildResourceSummary(geospatialResults)
  const notes = normalizeString(formData.nepa_extraordinary_circumstances)

  return stripUndefined({
    id: typeof elementId === "number" ? elementId : undefined,
    resources: resources.length > 0 ? resources : null,
    summary,
    notes
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

type ProjectRow = {
  id?: number | string | null
  created_at?: string | null
  title?: string | null
  description?: string | null
  sector?: string | null
  lead_agency?: string | null
  participating_agencies?: string | null
  sponsor?: string | null
  type?: string | null
  funding?: string | null
  location_text?: string | null
  location_lat?: number | null
  location_lon?: number | null
  location_object?: unknown
  sponsor_contact?: unknown
  other?: unknown
  start_date?: string | null
  current_status?: string | null
  parent_project_id?: number | null
  record_owner_agency?: string | null
  data_source_agency?: string | null
  data_source_system?: string | null
  data_record_version?: string | null
  last_updated?: string | null
  retrieved_timestamp?: string | null
}

type ProcessInstanceRow = {
  id?: number | null
  parent_project_id?: number | null
  title?: string | null
  description?: string | null
  last_updated?: string | null
  created_at?: string | null
  process_model?: number | null
}

type CaseEventRow = {
  id?: number | null
  parent_process_id?: number | null
  type?: string | null
  last_updated?: string | null
  other?: unknown
}

type ProcessDecisionPayloadRow = {
  process_decision_element?: number | null
  evaluation_data?: unknown
  last_updated?: string | null
}

type ProjectOtherRecord = {
  notes?: string
  geospatial?: {
    lastRunAt?: string
    messages?: string[]
    nepassist?: unknown
    ipac?: unknown
  }
  invalidLocationObject?: string
}

type StoredGeospatialRecord = {
  status?: unknown
  summary?: unknown
  error?: unknown
  meta?: unknown
  raw?: unknown
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

function parseTimestamp(value?: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : timestamp
}

function pickLatestTimestamp(a?: string | null, b?: string | null): string | undefined {
  const aTime = parseTimestamp(a ?? undefined)
  const bTime = parseTimestamp(b ?? undefined)
  if (typeof aTime === "number" && typeof bTime === "number") {
    return bTime >= aTime ? (b ?? undefined) : (a ?? undefined)
  }
  if (typeof bTime === "number") {
    return b ?? undefined
  }
  if (typeof aTime === "number") {
    return a ?? undefined
  }
  return (b ?? a) ?? undefined
}

function compareByTimestampDesc(a?: string | null, b?: string | null): number {
  const aTime = parseTimestamp(a ?? undefined)
  const bTime = parseTimestamp(b ?? undefined)
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

function safeStringifyJson(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value
  }
  if (!value || typeof value !== "object") {
    return undefined
  }
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function parseProjectContactRecord(value: unknown): ProjectContact | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }
  const contact = value as Record<string, unknown>
  const normalized: ProjectContact = {}
  if (typeof contact.name === "string" && contact.name.trim().length > 0) {
    normalized.name = contact.name
  }
  if (typeof contact.organization === "string" && contact.organization.trim().length > 0) {
    normalized.organization = contact.organization
  }
  if (typeof contact.email === "string" && contact.email.trim().length > 0) {
    normalized.email = contact.email
  }
  if (typeof contact.phone === "string" && contact.phone.trim().length > 0) {
    normalized.phone = contact.phone
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function parseProjectOther(value: unknown): ProjectOtherRecord | undefined {
  if (!value) {
    return undefined
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return parseProjectOther(JSON.parse(value))
    } catch {
      return { notes: value }
    }
  }
  if (typeof value !== "object") {
    return undefined
  }
  const record = value as Record<string, unknown>
  const other: ProjectOtherRecord = {}
  if (typeof record.notes === "string" && record.notes.trim().length > 0) {
    other.notes = record.notes
  }
  const geospatial = record.geospatial
  if (geospatial && typeof geospatial === "object") {
    const geoRecord = geospatial as Record<string, unknown>
    other.geospatial = {}
    if (typeof geoRecord.lastRunAt === "string" && geoRecord.lastRunAt.trim().length > 0) {
      other.geospatial.lastRunAt = geoRecord.lastRunAt
    }
    if (Array.isArray(geoRecord.messages)) {
      other.geospatial.messages = geoRecord.messages.filter((entry) => typeof entry === "string") as string[]
    }
    if ("nepassist" in geoRecord) {
      other.geospatial.nepassist = geoRecord.nepassist
    }
    if ("ipac" in geoRecord) {
      other.geospatial.ipac = geoRecord.ipac
    }
  }
  if (typeof record.invalidLocationObject === "string" && record.invalidLocationObject.trim().length > 0) {
    other.invalidLocationObject = record.invalidLocationObject
  }
  return Object.keys(other).length > 0 ? other : undefined
}

function parseGeospatialStatus(value: unknown): GeospatialResultsState["nepassist"]["status"] | undefined {
  if (value === "idle" || value === "loading" || value === "success" || value === "error") {
    return value
  }
  return undefined
}

function parseStoredGeospatialService<TSummary>(
  value: unknown
): GeospatialServiceState<TSummary> | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }
  const record = value as StoredGeospatialRecord
  const status = parseGeospatialStatus(record.status)
  const service: GeospatialServiceState<TSummary> = { status: status ?? "idle" }
  if (Object.prototype.hasOwnProperty.call(record, "summary")) {
    const summary = record.summary as unknown
    if (summary !== null) {
      service.summary = summary as TSummary
    }
  }
  if (typeof record.error === "string" && record.error.trim().length > 0) {
    service.error = record.error
  }
  if (record.meta && typeof record.meta === "object") {
    service.meta = record.meta as Record<string, unknown>
  }
  if (Object.prototype.hasOwnProperty.call(record, "raw")) {
    service.raw = record.raw
  }
  return service
}

function applyProjectRecordToState({
  formData,
  geospatialResults,
  projectRecord
}: {
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
  projectRecord: Record<string, unknown>
}): void {
  const maybeString = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : undefined)
  const maybeNumber = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined

  const title = maybeString(projectRecord.title)
  if (title) {
    formData.title = title
  }
  const description = maybeString(projectRecord.description)
  if (description) {
    formData.description = description
  }
  const sector = maybeString(projectRecord.sector)
  if (sector) {
    formData.sector = sector
  }
  const leadAgency = maybeString(projectRecord.lead_agency)
  if (leadAgency) {
    formData.lead_agency = leadAgency
  }
  const participating = maybeString(projectRecord.participating_agencies)
  if (participating) {
    formData.participating_agencies = participating
  }
  const sponsor = maybeString(projectRecord.sponsor)
  if (sponsor) {
    formData.sponsor = sponsor
  }
  const funding = maybeString(projectRecord.funding)
  if (funding) {
    formData.funding = funding
  }
  const locationText = maybeString(projectRecord.location_text)
  if (locationText) {
    formData.location_text = locationText
  }
  const latitude = maybeNumber(projectRecord.location_lat)
  if (typeof latitude === "number") {
    formData.location_lat = latitude
  }
  const longitude = maybeNumber(projectRecord.location_lon)
  if (typeof longitude === "number") {
    formData.location_lon = longitude
  }
  const locationObject = safeStringifyJson(projectRecord.location_object)
  if (locationObject) {
    formData.location_object = locationObject
  }

  const contact = parseProjectContactRecord(projectRecord.sponsor_contact)
  if (contact) {
    formData.sponsor_contact = { ...formData.sponsor_contact, ...contact }
  }

  const other = parseProjectOther(projectRecord.other)
  if (other?.notes) {
    formData.other = other.notes
  }
  if (other?.invalidLocationObject && !formData.location_object) {
    formData.location_object = other.invalidLocationObject
  }
  if (other?.geospatial) {
    if (other.geospatial.lastRunAt) {
      geospatialResults.lastRunAt = other.geospatial.lastRunAt
    }
    if (other.geospatial.messages && other.geospatial.messages.length > 0) {
      geospatialResults.messages = other.geospatial.messages
    }
    const storedNepassist = parseStoredGeospatialService<NepassistSummaryItem[]>(
      other.geospatial.nepassist
    )
    if (storedNepassist) {
      geospatialResults.nepassist = { ...geospatialResults.nepassist, ...storedNepassist }
    }
    const storedIpac = parseStoredGeospatialService<IpacSummary>(other.geospatial.ipac)
    if (storedIpac) {
      geospatialResults.ipac = { ...geospatialResults.ipac, ...storedIpac }
    }
  }
}

function parseChecklistItems(value: unknown): LoadedPermittingChecklistItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const items: LoadedPermittingChecklistItem[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const record = entry as Record<string, unknown>
    const label = typeof record.label === "string" ? record.label.trim() : ""
    if (!label) {
      continue
    }
    const checklistItem: LoadedPermittingChecklistItem = {
      label,
      completed: Boolean(record.completed)
    }
    if (record.source === "copilot" || record.source === "manual" || record.source === "seed") {
      checklistItem.source = record.source
    }
    if (typeof record.notes === "string" && record.notes.trim().length > 0) {
      checklistItem.notes = record.notes
    }
    items.push(checklistItem)
  }
  return items
}

function joinStrings(values: unknown): string | undefined {
  if (!Array.isArray(values)) {
    return undefined
  }
  const filtered = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
  return filtered.length > 0 ? filtered.join("\n") : undefined
}

function determineDecisionElementTitle(
  decisionElementId: unknown,
  evaluationData: Record<string, unknown>,
  titleMap: Map<number, string>
): string | undefined {
  const lookupById = (value: unknown): string | undefined => {
    if (typeof value === "number" && Number.isFinite(value) && titleMap.has(value)) {
      return titleMap.get(value)
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const trimmed = value.trim()
      const parsed = Number.parseInt(trimmed, 10)
      if (Number.isFinite(parsed) && titleMap.has(parsed)) {
        return titleMap.get(parsed)
      }
      return trimmed
    }
    return undefined
  }

  const titleFromDecisionElement = lookupById(decisionElementId)
  if (titleFromDecisionElement) {
    return titleFromDecisionElement
  }

  const fallbackId = lookupById(evaluationData.id)
  if (fallbackId) {
    return fallbackId
  }

  const fallbackTitle = evaluationData.title
  if (typeof fallbackTitle === "string" && fallbackTitle.trim().length > 0) {
    return fallbackTitle
  }

  return undefined
}

function applyDecisionPayloadToState({
  title,
  evaluation,
  formData,
  geospatialResults,
  permittingChecklist
}: {
  title: string
  evaluation: Record<string, unknown>
  formData: ProjectFormData
  geospatialResults: GeospatialResultsState
  permittingChecklist: LoadedPermittingChecklistItem[]
}): void {
  switch (title) {
    case DECISION_ELEMENT_TITLES.PROJECT_DETAILS: {
      const project = evaluation.project
      if (project && typeof project === "object") {
        applyProjectRecordToState({
          formData,
          geospatialResults,
          projectRecord: project as Record<string, unknown>
        })
      }
      break
    }
    case DECISION_ELEMENT_TITLES.NEPA_ASSIST: {
      const nextService: GeospatialServiceState<NepassistSummaryItem[]> = {
        ...geospatialResults.nepassist
      }
      let derivedSummary: NepassistSummaryItem[] | undefined
      if (Array.isArray(evaluation.nepa_assist_summary)) {
        nextService.summary = evaluation.nepa_assist_summary as NepassistSummaryItem[]
      } else if (
        Object.prototype.hasOwnProperty.call(evaluation, "nepa_assist_summary") &&
        evaluation.nepa_assist_summary === null
      ) {
        nextService.summary = undefined
      }
      if (Object.prototype.hasOwnProperty.call(evaluation, "nepa_assist_raw")) {
        nextService.raw = evaluation.nepa_assist_raw
        if (nextService.raw && typeof nextService.raw === "object") {
          derivedSummary = summarizeNepassist(nextService.raw)
        }
      }
      if (derivedSummary) {
        nextService.summary = derivedSummary
      }
      if (
        nextService.status === "idle" &&
        (Array.isArray(nextService.summary) || (nextService.raw !== undefined && nextService.raw !== null))
      ) {
        nextService.status = "success"
      }
      geospatialResults.nepassist = nextService
      break
    }
    case DECISION_ELEMENT_TITLES.IPAC: {
      const nextService: GeospatialServiceState<IpacSummary> = {
        ...geospatialResults.ipac
      }
      let derivedSummary: IpacSummary | undefined
      if (evaluation.ipac_summary && typeof evaluation.ipac_summary === "object") {
        nextService.summary = evaluation.ipac_summary as IpacSummary
      } else if (
        Object.prototype.hasOwnProperty.call(evaluation, "ipac_summary") &&
        evaluation.ipac_summary === null
      ) {
        nextService.summary = undefined
      }
      if (Object.prototype.hasOwnProperty.call(evaluation, "ipac_raw")) {
        nextService.raw = evaluation.ipac_raw
        if (nextService.raw && typeof nextService.raw === "object") {
          derivedSummary = summarizeIpac(nextService.raw)
        }
      }
      if (derivedSummary) {
        nextService.summary = derivedSummary
      }
      if (
        nextService.status === "idle" &&
        ((nextService.summary && typeof nextService.summary === "object") ||
          (nextService.raw !== undefined && nextService.raw !== null))
      ) {
        nextService.status = "success"
      }
      geospatialResults.ipac = nextService
      break
    }
    case DECISION_ELEMENT_TITLES.PERMIT_NOTES: {
      const permits = parseChecklistItems(evaluation.permits)
      if (permits.length > 0) {
        permittingChecklist.splice(0, permittingChecklist.length, ...permits)
      }
      if (typeof evaluation.notes === "string" && evaluation.notes.trim().length > 0) {
        formData.other = evaluation.notes
      }
      break
    }
    case DECISION_ELEMENT_TITLES.CE_REFERENCES: {
      const candidates = joinStrings(evaluation.ce_candidates)
      if (candidates) {
        formData.nepa_categorical_exclusion_code = candidates
      }
      break
    }
    case DECISION_ELEMENT_TITLES.CONDITIONS: {
      const conditions = joinStrings(evaluation.conditions)
      if (conditions) {
        formData.nepa_conformance_conditions = conditions
      }
      if (typeof evaluation.notes === "string" && evaluation.notes.trim().length > 0) {
        formData.nepa_extraordinary_circumstances = evaluation.notes
      }
      break
    }
    case DECISION_ELEMENT_TITLES.RESOURCE_NOTES: {
      if (typeof evaluation.notes === "string" && evaluation.notes.trim().length > 0) {
        formData.nepa_extraordinary_circumstances = evaluation.notes
      } else if (
        Object.prototype.hasOwnProperty.call(evaluation, "notes") &&
        evaluation.notes === null &&
        Object.prototype.hasOwnProperty.call(formData, "nepa_extraordinary_circumstances")
      ) {
        delete formData.nepa_extraordinary_circumstances
      }
      break
    }
    default:
      break
  }
}

async function fetchSupabaseList<T>(
  supabaseUrl: string,
  supabaseAnonKey: string,
  path: string,
  resourceDescription: string,
  configure?: (endpoint: URL) => void
): Promise<T[]> {
  const endpoint = new URL(path, supabaseUrl)
  if (configure) {
    configure(endpoint)
  }
  const { url, init } = buildSupabaseFetchRequest(endpoint, supabaseAnonKey, {
    method: "GET"
  })
  const response = await fetch(url, init)
  const responseText = await response.text()
  if (!response.ok) {
    const errorDetail = extractErrorDetail(responseText)
    throw new ProjectPersistenceError(
      errorDetail
        ? `Failed to load ${resourceDescription} (${response.status}): ${errorDetail}`
        : `Failed to load ${resourceDescription} (${response.status}).`
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

async function fetchProjectRow(
  supabaseUrl: string,
  supabaseAnonKey: string,
  projectId: number
): Promise<ProjectRow | undefined> {
  const rows = await fetchSupabaseList<ProjectRow>(
    supabaseUrl,
    supabaseAnonKey,
    "/rest/v1/project",
    "project",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        [
          "id",
          "created_at",
          "title",
          "description",
          "sector",
          "lead_agency",
          "participating_agencies",
          "sponsor",
          "type",
          "funding",
          "location_text",
          "location_lat",
          "location_lon",
          "location_object",
          "sponsor_contact",
          "other",
          "start_date",
          "current_status",
          "parent_project_id",
          "record_owner_agency",
          "data_source_agency",
          "data_source_system",
          "data_record_version",
          "last_updated",
          "retrieved_timestamp"
        ].join(",")
      )
      endpoint.searchParams.set("id", `eq.${projectId}`)
      endpoint.searchParams.set("data_source_system", `eq.${DATA_SOURCE_SYSTEM}`)
      endpoint.searchParams.set("limit", "1")
    }
  )
  return rows[0]
}

async function fetchDecisionElementTitleMap({
  supabaseUrl,
  supabaseAnonKey
}: {
  supabaseUrl: string
  supabaseAnonKey: string
}): Promise<Map<number, string>> {
  const elements = await fetchDecisionElements({ supabaseUrl, supabaseAnonKey })
  const map = new Map<number, string>()

  for (const builder of DECISION_ELEMENT_BUILDERS) {
    const element = elements.get(builder.decisionElementId)
    if (!element) {
      continue
    }

    const numericId = parseNumericId(element.id)
    if (typeof numericId !== "number") {
      continue
    }

    const elementTitle =
      typeof element.title === "string" && element.title.trim().length > 0
        ? element.title.trim()
        : undefined

    map.set(numericId, elementTitle ?? builder.title)
  }

  return map
}

async function fetchProcessDecisionPayloadRows({
  supabaseUrl,
  supabaseAnonKey,
  processInstanceId
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  processInstanceId: number
}): Promise<ProcessDecisionPayloadRow[]> {
  return fetchSupabaseList<ProcessDecisionPayloadRow>(
    supabaseUrl,
    supabaseAnonKey,
    "/rest/v1/process_decision_payload",
    "decision payloads",
    (endpoint) => {
      endpoint.searchParams.set("select", "process_decision_element,evaluation_data,last_updated")
      endpoint.searchParams.set("process", `eq.${processInstanceId}`)
    }
  )
}

async function fetchProcessModelRecord({
  supabaseUrl,
  supabaseAnonKey,
  processModelId
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  processModelId: number
}): Promise<ProcessModelRecord | undefined> {
  const rows = await fetchSupabaseList<Record<string, unknown>>(
    supabaseUrl,
    supabaseAnonKey,
    "/rest/v1/process_model",
    "process model",
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

  const record: ProcessModelRecord = {
    id,
    title: parseOptionalString((raw as Record<string, unknown>).title),
    description: parseOptionalString((raw as Record<string, unknown>).description),
    notes: parseOptionalString((raw as Record<string, unknown>).notes),
    screeningDescription: parseOptionalString(
      (raw as Record<string, unknown>).screening_description
    ),
    agency: parseOptionalString((raw as Record<string, unknown>).agency),
    legalStructureId:
      parseNumericId((raw as Record<string, unknown>).legal_structure_id) ?? null,
    legalStructureText: parseOptionalString(
      (raw as Record<string, unknown>).legal_structure_text
    ),
    lastUpdated: parseOptionalString((raw as Record<string, unknown>).last_updated)
  }

  return record
}

async function fetchLegalStructureRecord({
  supabaseUrl,
  supabaseAnonKey,
  legalStructureId
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  legalStructureId: number
}): Promise<LegalStructureRecord | undefined> {
  const rows = await fetchSupabaseList<Record<string, unknown>>(
    supabaseUrl,
    supabaseAnonKey,
    "/rest/v1/legal_structure",
    "legal structure",
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

  const record: LegalStructureRecord = {
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

  return record
}

export async function loadProcessInformation(
  processModelId: number
): Promise<ProcessInformation> {
  if (!Number.isFinite(processModelId)) {
    throw new ProjectPersistenceError("Process model identifier must be numeric.")
  }

  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "Supabase credentials are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    )
  }

  const processModel = await fetchProcessModelRecord({
    supabaseUrl,
    supabaseAnonKey,
    processModelId
  })

  if (!processModel) {
    throw new ProjectPersistenceError(`Process model ${processModelId} was not found.`)
  }

  let legalStructure: LegalStructureRecord | undefined
  if (typeof processModel.legalStructureId === "number") {
    legalStructure = await fetchLegalStructureRecord({
      supabaseUrl,
      supabaseAnonKey,
      legalStructureId: processModel.legalStructureId
    })
  }

  const decisionElementMap = await fetchDecisionElements({
    supabaseUrl,
    supabaseAnonKey,
    processModelId
  })

  const decisionElements = Array.from(decisionElementMap.values()).filter((element) => {
    if (!element) {
      return false
    }
    if (typeof element.processModelId === "number") {
      return element.processModelId === processModelId
    }
    return true
  })

  decisionElements.sort((a, b) => a.id - b.id)

  return {
    processModel,
    legalStructure,
    decisionElements
  }
}

async function fetchLatestPreScreeningProcessInstanceRecord({
  supabaseUrl,
  supabaseAnonKey,
  projectId
}: {
  supabaseUrl: string
  supabaseAnonKey: string
  projectId: number
}): Promise<ProcessInstanceRow | undefined> {
  const rows = await fetchSupabaseList<ProcessInstanceRow>(
    supabaseUrl,
    supabaseAnonKey,
    "/rest/v1/process_instance",
    "process instance",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        "id,parent_project_id,process_model,last_updated,created_at,title:description,description"
      )
      endpoint.searchParams.set("parent_project_id", `eq.${projectId}`)
      endpoint.searchParams.set("process_model", `eq.${PRE_SCREENING_PROCESS_MODEL_ID}`)
      endpoint.searchParams.set("data_source_system", `eq.${DATA_SOURCE_SYSTEM}`)
      endpoint.searchParams.append("order", "last_updated.desc.nullslast")
      endpoint.searchParams.append("order", "id.desc")
      endpoint.searchParams.set("limit", "1")
    }
  )
  return rows[0]
}

export async function fetchProjectHierarchy(): Promise<ProjectHierarchy[]> {
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "Supabase credentials are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    )
  }

  const projects = await fetchSupabaseList<ProjectRow>(
    supabaseUrl,
    supabaseAnonKey,
    "/rest/v1/project",
    "projects",
    (endpoint) => {
      endpoint.searchParams.set("select", "id,title,description,last_updated,location_object")
      endpoint.searchParams.set("data_source_system", `eq.${DATA_SOURCE_SYSTEM}`)
      endpoint.searchParams.append("order", "last_updated.desc.nullslast")
    }
  )

  const projectIds = projects
    .map((row) => parseNumericId(row.id))
    .filter((id): id is number => typeof id === "number")

  if (projectIds.length === 0) {
    return []
  }

  const projectIdFilter = `in.(${projectIds.join(",")})`

  const processes = await fetchSupabaseList<ProcessInstanceRow>(
    supabaseUrl,
    supabaseAnonKey,
    "/rest/v1/process_instance",
    "processes",
    (endpoint) => {
      endpoint.searchParams.set(
        "select",
        "id,parent_project_id,title:description,description,last_updated,created_at,data_source_system"
      )
      endpoint.searchParams.set("parent_project_id", projectIdFilter)
      endpoint.searchParams.set("data_source_system", `eq.${DATA_SOURCE_SYSTEM}`)
    }
  )

  const processIds = processes
    .map((row) => parseNumericId(row.id))
    .filter((id): id is number => typeof id === "number")

  const caseEvents = processIds.length
    ? await fetchSupabaseList<CaseEventRow>(
        supabaseUrl,
        supabaseAnonKey,
        "/rest/v1/case_event",
        "case events",
        (endpoint) => {
          endpoint.searchParams.set(
            "select",
            "id,parent_process_id,type,last_updated,other"
          )
          endpoint.searchParams.set("parent_process_id", `in.(${processIds.join(",")})`)
          endpoint.searchParams.set("data_source_system", `eq.${DATA_SOURCE_SYSTEM}`)
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

  const processesByProject = new Map<number, ProjectProcessSummary[]>()
  for (const row of processes) {
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
    const existing = processesByProject.get(projectId)
    if (existing) {
      existing.push(summary)
    } else {
      processesByProject.set(projectId, [summary])
    }
  }

  const hierarchy: ProjectHierarchy[] = []
  for (const row of projects) {
    const projectId = parseNumericId(row.id)
    if (typeof projectId !== "number") {
      continue
    }
    const geometry = safeStringifyJson(row.location_object) ?? null
    const projectSummary: ProjectSummary = {
      id: projectId,
      title: typeof row.title === "string" ? row.title : null,
      description: typeof row.description === "string" ? row.description : null,
      lastUpdated: typeof row.last_updated === "string" ? row.last_updated : null,
      geometry
    }
    const projectProcesses = processesByProject.get(projectId) ?? []
    projectProcesses.sort((a, b) => compareByTimestampDesc(a.lastUpdated, b.lastUpdated))
    hierarchy.push({ project: projectSummary, processes: projectProcesses })
  }

  hierarchy.sort((a, b) => compareByTimestampDesc(a.project.lastUpdated, b.project.lastUpdated))

  return hierarchy
}

export async function loadProjectPortalState(projectId: number): Promise<LoadedProjectPortalState> {
  if (!Number.isFinite(projectId)) {
    throw new ProjectPersistenceError("Project identifier must be numeric.")
  }

  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ProjectPersistenceError(
      "Supabase credentials are not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    )
  }

  const projectRow = await fetchProjectRow(supabaseUrl, supabaseAnonKey, projectId)
  if (!projectRow) {
    throw new ProjectPersistenceError(`Project ${projectId} was not found.`)
  }

  const formData: ProjectFormData = createEmptyProjectData()
  formData.id = projectId.toString()

  const geospatialResults: GeospatialResultsState = {
    nepassist: { status: "idle" },
    ipac: { status: "idle" }
  }

  applyProjectRecordToState({
    formData,
    geospatialResults,
    projectRecord: projectRow as Record<string, unknown>
  })

  let lastUpdated = typeof projectRow.last_updated === "string" ? projectRow.last_updated : undefined

  const gisUploadResult = await fetchProjectGisDataUpload({
    supabaseUrl,
    supabaseAnonKey,
    projectId
  })

  const gisUpload: ProjectGisUpload = gisUploadResult?.upload ?? {}
  if (gisUploadResult?.updatedAt) {
    lastUpdated = pickLatestTimestamp(lastUpdated, gisUploadResult.updatedAt)
  }

  const permittingChecklist: LoadedPermittingChecklistItem[] = []

  const processRecord = await fetchLatestPreScreeningProcessInstanceRecord({
    supabaseUrl,
    supabaseAnonKey,
    projectId
  })

  if (processRecord?.id) {
    if (typeof processRecord.last_updated === "string") {
      lastUpdated = pickLatestTimestamp(lastUpdated, processRecord.last_updated)
    }

    const titleMap = await fetchDecisionElementTitleMap({ supabaseUrl, supabaseAnonKey })
    const payloads = await fetchProcessDecisionPayloadRows({
      supabaseUrl,
      supabaseAnonKey,
      processInstanceId: processRecord.id
    })

    for (const payload of payloads) {
      if (typeof payload.last_updated === "string") {
        lastUpdated = pickLatestTimestamp(lastUpdated, payload.last_updated)
      }
      if (!payload.evaluation_data || typeof payload.evaluation_data !== "object") {
        continue
      }
      const evaluation = payload.evaluation_data as Record<string, unknown>
      const title = determineDecisionElementTitle(
        payload.process_decision_element,
        evaluation,
        titleMap
      )
      if (!title) {
        continue
      }
      applyDecisionPayloadToState({
        title,
        evaluation,
        formData,
        geospatialResults,
        permittingChecklist
      })
    }
  }

  if (!formData.sponsor_contact) {
    formData.sponsor_contact = {}
  }

  if (!geospatialResults.messages) {
    geospatialResults.messages = []
  }

  return {
    formData,
    geospatialResults,
    permittingChecklist,
    lastUpdated,
    gisUpload
  }
}
