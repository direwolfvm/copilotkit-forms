// Client for the Section 106 Case Manager (Demo) exchange API.
//
// The Case Manager (one-oh-six-bot) runs NHPA Section 106 reviews (36 CFR Part 800) and
// speaks the CEQ/PIC data-standard shapes over a REST translation API (see
// SECTION106_HANDOFF.md). It is a demonstration system — every user-facing label below
// carries the "(Demo)" marker deliberately; do not present it as a system of record.
//
// All requests go through the same-origin /api/section106 proxy, which injects the
// X-API-Key server-side. Success responses are bare rows/arrays (PostgREST-style);
// failures use {"error":{code,message,fieldErrors?,correlationId}}.

import type { ProjectFormData } from "../schema/projectSchema"
import { buildLocationMapFeature, sanitizeEvaluationDataForSchema } from "./permitflow"

export const SECTION106_SYSTEM_LABEL = "Section 106 Case Manager (Demo)"
export const SECTION106_REVIEW_LABEL = "NHPA Section 106 Review (Demo)"
export const SECTION106_PROCESS_MODEL_TITLE = "Section 106 Review (NHPA)"
export const SECTION106_SECTION_REFERENCE_IDS = [
  "s106-v1-project-info",
  "s106-v1-undertaking",
  "s106-v1-applicant-info",
  "s106-v1-location-geometry"
] as const

const SECTION106_PROJECT_INFO_REFERENCE_ID = "s106-v1-project-info"
const SECTION106_UNDERTAKING_REFERENCE_ID = "s106-v1-undertaking"
const SECTION106_APPLICANT_INFO_REFERENCE_ID = "s106-v1-applicant-info"
const SECTION106_LOCATION_REFERENCE_ID = "s106-v1-location-geometry"

const EXCHANGE_PROXY_BASE = "/api/section106"
const PORTAL_SOURCE_KEY = "_project_portal"
const PORTAL_SOURCE_ID_KEY = "source_project_id"

export class Section106Error extends Error {
  code?: string
  status?: number
  correlationId?: string
  fieldErrors?: Record<string, unknown>

  constructor(message: string, options?: {
    code?: string
    status?: number
    correlationId?: string
    fieldErrors?: Record<string, unknown>
  }) {
    super(message)
    this.name = "Section106Error"
    this.code = options?.code
    this.status = options?.status
    this.correlationId = options?.correlationId
    this.fieldErrors = options?.fieldErrors
  }
}

export function isSection106NotConfigured(error: unknown): boolean {
  return error instanceof Section106Error && error.code === "section106_not_configured"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  ) as T
}

/** Parse the exchange error envelope into a Section106Error (exported for tests). */
export function parseSection106ErrorEnvelope(
  status: number,
  responseText: string
): Section106Error {
  const parsed = safeJsonParse(responseText)
  const envelope = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined
  const code = normalizeString(envelope?.code)
  const correlationId = normalizeString(envelope?.correlationId)
  const baseMessage =
    normalizeString(envelope?.message) ??
    `Section 106 Case Manager request failed (${status}).`
  const message = correlationId ? `${baseMessage} [correlation ${correlationId}]` : baseMessage
  return new Section106Error(message, {
    code,
    status,
    correlationId,
    fieldErrors: isRecord(envelope?.fieldErrors) ? envelope.fieldErrors : undefined
  })
}

async function exchangeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${EXCHANGE_PROXY_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {})
    }
  })
  const responseText = await response.text()
  if (!response.ok) {
    // Log the correlation id — the Case Manager team can trace it server-side.
    const error = parseSection106ErrorEnvelope(response.status, responseText)
    if (error.correlationId) {
      console.warn(`[section106] request failed (${error.code ?? response.status})`, {
        correlationId: error.correlationId,
        path
      })
    }
    throw error
  }
  return (responseText ? safeJsonParse(responseText) : undefined) as T
}

export type Section106Element = {
  id: number
  referenceId?: string
  title?: string
  description?: string
  formSchema?: unknown
  hasForm: boolean
}

export type Section106ProcessModel = {
  id: number
  title?: string
  description?: string
}

export type Section106ProcessInformation = {
  model: Section106ProcessModel
  elements: Section106Element[]
}

function hasRenderableFormData(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }
  return isRecord(value.properties) && Object.keys(value.properties).length > 0
}

function sectionOrder(element: Section106Element): number {
  const index = element.referenceId
    ? (SECTION106_SECTION_REFERENCE_IDS as readonly string[]).indexOf(element.referenceId)
    : -1
  return index === -1 ? SECTION106_SECTION_REFERENCE_IDS.length : index
}

function parseElementRow(row: unknown): Section106Element | undefined {
  if (!isRecord(row)) {
    return undefined
  }
  const id = parseNumericId(row.id)
  if (typeof id !== "number") {
    return undefined
  }
  return {
    id,
    referenceId: normalizeString(row.process_model_internal_reference_id),
    title: normalizeString(row.title),
    description: normalizeString(row.description),
    formSchema: row.form_data ?? undefined,
    hasForm: hasRenderableFormData(row.form_data)
  }
}

let processInformationCache: Section106ProcessInformation | undefined

export async function loadSection106ProcessInformation(): Promise<Section106ProcessInformation> {
  if (processInformationCache) {
    return processInformationCache
  }

  const models = await exchangeFetch<unknown[]>("/process-models")
  const modelRows = Array.isArray(models) ? models.filter(isRecord) : []
  // Resolve by title; numeric ids are per-environment. Fall back to the only model when
  // exactly one is broadcast.
  const matched =
    modelRows.find((row) => normalizeString(row.title) === SECTION106_PROCESS_MODEL_TITLE) ??
    (modelRows.length === 1 ? modelRows[0] : undefined)
  const modelId = parseNumericId(matched?.id)
  if (!matched || typeof modelId !== "number") {
    throw new Section106Error(
      `The Case Manager did not broadcast a "${SECTION106_PROCESS_MODEL_TITLE}" process model.`
    )
  }

  const elementRows = await exchangeFetch<unknown[]>(
    `/process-models/${modelId}/decision-elements`
  )
  const elements = (Array.isArray(elementRows) ? elementRows : [])
    .map(parseElementRow)
    .filter((element): element is Section106Element => Boolean(element))
    .sort((a, b) => {
      const orderDelta = sectionOrder(a) - sectionOrder(b)
      return orderDelta !== 0 ? orderDelta : a.id - b.id
    })

  if (elements.length === 0) {
    throw new Section106Error(
      "The Case Manager returned no decision elements for the Section 106 process model."
    )
  }

  processInformationCache = {
    model: {
      id: modelId,
      title: normalizeString(matched.title),
      description: normalizeString(matched.description)
    },
    elements
  }
  return processInformationCache
}

export type Section106InstanceStatus = {
  processInstanceId: number
  status?: string
  stage?: string
  caseNumber?: string
  workflowState?: string
  overallStatus?: string
}

function parseInstanceRow(row: unknown): Section106InstanceStatus | undefined {
  if (!isRecord(row)) {
    return undefined
  }
  const id = parseNumericId(row.id)
  if (typeof id !== "number") {
    return undefined
  }
  const other = isRecord(row.other) ? row.other : undefined
  return {
    processInstanceId: id,
    status: normalizeString(row.status),
    stage: normalizeString(row.stage) ?? normalizeString(other?.workflow_state),
    caseNumber: normalizeString(other?.case_number),
    workflowState: normalizeString(other?.workflow_state),
    overallStatus: normalizeString(other?.overall_status)
  }
}

export async function loadSection106Instance(
  processInstanceId: number
): Promise<Section106InstanceStatus> {
  const row = await exchangeFetch<unknown>(`/process-instances/${processInstanceId}`)
  const parsed = parseInstanceRow(row)
  if (!parsed) {
    throw new Section106Error(
      `Section 106 process instance ${processInstanceId} could not be parsed.`
    )
  }
  return parsed
}

export type Section106CaseEvent = {
  id: number
  name?: string
  description?: string
  type?: string
  status?: string
  outcome?: string
  datetime?: string
  followingSegmentName?: string
  direction?: "in" | "out"
  assignedEntity?: string
  task?: string
  respondBy?: string
  parentEventId?: number
}

/** Parse a case-event row from the exchange API (exported for tests). */
export function parseSection106CaseEvent(row: unknown): Section106CaseEvent | undefined {
  if (!isRecord(row)) {
    return undefined
  }
  const id = parseNumericId(row.id)
  if (typeof id !== "number") {
    return undefined
  }
  const other = isRecord(row.other) ? row.other : undefined
  const direction = normalizeString(other?.direction)
  const task = other?.task
  return {
    id,
    name: normalizeString(row.name),
    description: normalizeString(row.description),
    type: normalizeString(row.type),
    status: normalizeString(row.status),
    outcome: normalizeString(row.outcome),
    datetime: normalizeString(row.datetime) ?? normalizeString(row.occurred_at),
    followingSegmentName:
      normalizeString(row.following_segment_name) ??
      normalizeString(other?.following_segment_name),
    direction: direction === "in" || direction === "out" ? direction : undefined,
    assignedEntity:
      normalizeString(row.assigned_entity) ?? normalizeString(other?.assigned_entity),
    task: typeof task === "string" ? task : task !== undefined ? JSON.stringify(task) : undefined,
    respondBy: normalizeString(other?.respond_by),
    parentEventId: parseNumericId(row.parent_event_id ?? other?.parent_event_id)
  }
}

/** An information request assigned to the proponent that has not been answered yet. */
export function isOpenProponentTask(event: Section106CaseEvent): boolean {
  return (
    event.type === "information_request" &&
    event.assignedEntity === "proponent" &&
    event.status?.toLowerCase() !== "completed"
  )
}

export async function loadSection106CaseEvents(
  processInstanceId: number
): Promise<Section106CaseEvent[]> {
  const rows = await exchangeFetch<unknown[]>(
    `/process-instances/${processInstanceId}/case-events`
  )
  return (Array.isArray(rows) ? rows : [])
    .map(parseSection106CaseEvent)
    .filter((event): event is Section106CaseEvent => Boolean(event))
}

/**
 * Seed a section's initial evaluation_data from the portal project profile, writing only
 * fields the element's form_data schema declares (exported for tests).
 */
export function seedSection106SectionEvaluationData(
  element: Section106Element,
  formData: ProjectFormData
): Record<string, unknown> {
  const properties = isRecord(element.formSchema)
    ? isRecord(element.formSchema.properties)
      ? element.formSchema.properties
      : undefined
    : undefined
  if (!properties) {
    return {}
  }

  const candidates: Record<string, unknown> = {}
  switch (element.referenceId) {
    case SECTION106_PROJECT_INFO_REFERENCE_ID:
      Object.assign(candidates, {
        title: normalizeString(formData.title),
        project_title: normalizeString(formData.title),
        description: normalizeString(formData.description),
        project_description: normalizeString(formData.description),
        location_text: normalizeString(formData.location_text),
        geographic_summary: normalizeString(formData.location_text)
      })
      break
    case SECTION106_UNDERTAKING_REFERENCE_ID:
      Object.assign(candidates, {
        description: normalizeString(formData.description)
      })
      break
    case SECTION106_APPLICANT_INFO_REFERENCE_ID:
      Object.assign(candidates, {
        organization_name:
          normalizeString(formData.sponsor_contact?.organization) ??
          normalizeString(formData.sponsor),
        contact_name: normalizeString(formData.sponsor_contact?.name),
        contact_email: normalizeString(formData.sponsor_contact?.email),
        contact_phone: normalizeString(formData.sponsor_contact?.phone)
      })
      break
    case SECTION106_LOCATION_REFERENCE_ID:
      // Plain GeoJSON is accepted in location_map; the Case Manager consumes geometry but
      // runs no IPaC/NEPAssist screening, so we send the Feature without screening data.
      candidates.location_map = buildLocationMapFeature(formData)
      break
    default:
      break
  }

  const seeded: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== undefined && properties[key]) {
      seeded[key] = value
    }
  }
  return sanitizeEvaluationDataForSchema(element.formSchema, seeded)
}

export type Section106InitiationResult = {
  exchangeProjectId: number
  processInstanceId: number
  caseNumber?: string
  stage?: string
}

/**
 * Initiation sequence: register the project, open the case (a process_instance opens a
 * real Section 106 case immediately), and seed one payload per section. The case stays in
 * setup — editable — until submitSection106Review() flips it to the reviewers' queue.
 */
export async function initiateSection106Review({
  formData,
  portalProjectId
}: {
  formData: ProjectFormData
  portalProjectId: number
}): Promise<Section106InitiationResult> {
  const title = normalizeString(formData.title)
  if (!title) {
    throw new Section106Error("A project title is required to open a Section 106 case.")
  }

  const info = await loadSection106ProcessInformation()

  const projectRow = await exchangeFetch<unknown>("/projects", {
    method: "POST",
    body: JSON.stringify(
      stripUndefined({
        title,
        description: normalizeString(formData.description),
        sector: normalizeString(formData.sector),
        lead_agency: normalizeString(formData.lead_agency),
        sponsor: normalizeString(formData.sponsor),
        location_text: normalizeString(formData.location_text),
        other: { [PORTAL_SOURCE_KEY]: { [PORTAL_SOURCE_ID_KEY]: portalProjectId } }
      })
    )
  })
  const exchangeProjectId = parseNumericId(isRecord(projectRow) ? projectRow.id : undefined)
  if (typeof exchangeProjectId !== "number") {
    throw new Section106Error("The Case Manager project creation did not return an id.")
  }

  const instanceRow = await exchangeFetch<unknown>("/process-instances", {
    method: "POST",
    body: JSON.stringify({
      parent_project_id: exchangeProjectId,
      process_model: info.model.id
    })
  })
  const instance = parseInstanceRow(instanceRow)
  if (!instance) {
    throw new Section106Error("The Case Manager did not return a process instance.")
  }

  const payloads = info.elements.map((element) => ({
    process_decision_element: element.id,
    process: instance.processInstanceId,
    project: exchangeProjectId,
    evaluation_data: seedSection106SectionEvaluationData(element, formData)
  }))
  await exchangeFetch<unknown>("/process-decision-payloads", {
    method: "POST",
    body: JSON.stringify(payloads)
  })

  return {
    exchangeProjectId,
    processInstanceId: instance.processInstanceId,
    caseNumber: instance.caseNumber,
    stage: instance.stage
  }
}

/**
 * Save one section. Payloads upsert by (process, process_decision_element) — re-POSTing a
 * section updates it. Returns the Case Manager's result_notes when provided.
 */
export async function saveSection106Section({
  processInstanceId,
  exchangeProjectId,
  element,
  evaluationData
}: {
  processInstanceId: number
  exchangeProjectId: number
  element: Section106Element
  evaluationData: Record<string, unknown>
}): Promise<string | undefined> {
  const row = await exchangeFetch<unknown>("/process-decision-payloads", {
    method: "POST",
    body: JSON.stringify({
      process_decision_element: element.id,
      process: processInstanceId,
      project: exchangeProjectId,
      evaluation_data: sanitizeEvaluationDataForSchema(element.formSchema, evaluationData)
    })
  })
  const single = Array.isArray(row) ? row[0] : row
  return isRecord(single) ? normalizeString(single.result_notes) : undefined
}

/** Submit the case to the reviewers' queue. */
export async function submitSection106Review(processInstanceId: number): Promise<void> {
  await exchangeFetch<unknown>(`/process-instances/${processInstanceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "submitted" })
  })
}

/** Answer an information_request task; references the request via parent_event_id. */
export async function respondSection106InformationRequest({
  processInstanceId,
  parentEventId,
  name,
  description
}: {
  processInstanceId: number
  parentEventId: number
  name: string
  description: string
}): Promise<void> {
  await exchangeFetch<unknown>("/case-events", {
    method: "POST",
    body: JSON.stringify({
      parent_process_id: processInstanceId,
      parent_event_id: parentEventId,
      name,
      description,
      type: "information_response"
    })
  })
}
