import type { ProjectContact, ProjectFormData } from "../schema/projectSchema"
import type { GeospatialResultsState, GeospatialServiceState } from "../types/geospatial"
import type { PermittingChecklistItem } from "../components/PermittingChecklistSection"
import { getSupabaseAnonKey, getSupabaseUrl } from "../runtimeConfig"

const DATA_SOURCE_SYSTEM = "project-portal"
const PRE_SCREENING_PROCESS_MODEL_ID = 1
const PRE_SCREENING_TITLE_SUFFIX = "Pre-Screening"
const CASE_EVENT_TYPES = {
  PROJECT_INITIATED: "Project initiated",
  PRE_SCREENING_INITIATED: "Pre-screening initiated",
  PRE_SCREENING_COMPLETE: "Pre-screening complete"
} as const

type CaseEventType = (typeof CASE_EVENT_TYPES)[keyof typeof CASE_EVENT_TYPES]

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

type DecisionElementMap = Map<string, DecisionElementRecord>

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

  const missingElements = DECISION_ELEMENT_BUILDERS.map((builder) => builder.title).filter(
    (title) => !decisionElements.has(title)
  )
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

  const endpoint = new URL("/rest/v1/process_decision_payload", supabaseUrl)
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

  const evaluation = evaluateDecisionPayloads(records)

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

  if (evaluation.isComplete) {
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
    process_instance: processInstanceId,
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
    process_instance: processInstanceId,
    project_id: projectId,
    total_payloads: evaluation.total,
    payloads_with_content: evaluation.completedTitles,
    payloads_with_content_count: evaluation.completedTitles.length
  })
}

type DecisionPayloadEvaluation = {
  total: number
  completedTitles: string[]
  isComplete: boolean
}

function evaluateDecisionPayloads(
  records: Array<Record<string, unknown>>
): DecisionPayloadEvaluation {
  const titles = DECISION_ELEMENT_BUILDERS.map((builder) => builder.title)
  const completedTitles: string[] = []

  for (let index = 0; index < titles.length; index += 1) {
    const record = records[index]
    if (!record) {
      continue
    }

    const data = (record as { data?: unknown }).data
    if (hasMeaningfulDecisionPayloadData(data)) {
      completedTitles.push(titles[index])
    }
  }

  return {
    total: titles.length,
    completedTitles,
    isComplete: completedTitles.length === titles.length
  }
}

function hasMeaningfulDecisionPayloadData(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false
  }

  return containsMeaningfulValue(data, new Set(["id", "process_instance"]))
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
  endpoint.searchParams.set("process_instance", `eq.${processInstanceId}`)
  endpoint.searchParams.set("event_type", `eq.${eventType}`)
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
    process_instance: processInstanceId,
    event_type: eventType,
    data_source_system: DATA_SOURCE_SYSTEM,
    last_updated: timestamp,
    retrieved_timestamp: timestamp,
    data: buildCaseEventData(processInstanceId, eventData)
  })

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  })

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

function buildCaseEventData(
  processInstanceId: number,
  eventData?: Record<string, unknown> | null
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    process_instance: processInstanceId
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
    process_instance: processInstanceId,
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
      map.set(title, { id, title })
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
  title: string
  build: (context: DecisionPayloadBuilderContext) => Record<string, unknown>
}

const DECISION_ELEMENT_BUILDERS: ReadonlyArray<DecisionElementBuilder> = [
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
        process_instance: processInstanceId,
        decision_element: element?.id,
        data_source_system: DATA_SOURCE_SYSTEM,
        last_updated: timestamp,
        retrieved_timestamp: timestamp,
        evaluation_data: evaluationData
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
    id: typeof elementId === "number" ? elementId : undefined,
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
  const notes = normalizeString(formData.nepa_extraordinary_circumstances)

  return stripUndefined({
    id: typeof elementId === "number" ? elementId : undefined,
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
    id: typeof elementId === "number" ? elementId : undefined,
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
