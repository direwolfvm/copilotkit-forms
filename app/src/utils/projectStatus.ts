import type { ProjectHierarchy, ProjectProcessSummary, CaseEventSummary } from "./projectPersistence"

export { StatusIndicator } from "../components/StatusIndicator"
export type { ProcessStatusVariant, StatusIndicatorProps } from "../components/StatusIndicator"

const PRE_SCREENING_COMPLETE_EVENT = "Pre-screening complete"
const PRE_SCREENING_INITIATED_EVENT = "Pre-screening initiated"
const PRE_SCREENING_ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
const BASIC_PERMIT_LABEL = "Basic Permit"
const BASIC_PERMIT_APPROVED_EVENT = "project_approved"
const COMPLEX_REVIEW_LABEL = "Complex Review"
const COMPLEX_REVIEW_APPROVED_EVENT = "project_approved"

export type PreScreeningStatus = "complete" | "pending" | "caution"

export function formatTimestamp(value?: string | null): string | undefined {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value ?? undefined
  }
  return date.toLocaleString()
}

export function parseTimestampMillis(value?: string | null): number | undefined {
  if (!value) {
    return undefined
  }
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return undefined
  }
  return timestamp
}

export function compareByTimestampDesc(a?: string | null, b?: string | null): number {
  const aTime = parseTimestampMillis(a ?? undefined)
  const bTime = parseTimestampMillis(b ?? undefined)
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

export function isPreScreeningProcess(process: ProjectProcessSummary): boolean {
  const haystack = `${process.title ?? ""} ${process.description ?? ""}`.toLowerCase()
  return haystack.includes("pre-screening")
}

export function determinePreScreeningStatus(
  process: ProjectProcessSummary
): { variant: PreScreeningStatus; label: string } | undefined {
  if (!isPreScreeningProcess(process)) {
    return undefined
  }

  if (process.caseEvents.some((event) => event.eventType === PRE_SCREENING_COMPLETE_EVENT)) {
    return { variant: "complete", label: PRE_SCREENING_COMPLETE_EVENT }
  }

  const hasInitiated = process.caseEvents.some((event) => event.eventType === PRE_SCREENING_INITIATED_EVENT)
  const latestEvent = process.caseEvents[0]

  if (!hasInitiated && !latestEvent) {
    return undefined
  }

  if (latestEvent) {
    const latestTimestamp = parseTimestampMillis(latestEvent.lastUpdated)
    if (latestTimestamp && Date.now() - latestTimestamp > PRE_SCREENING_ONE_WEEK_MS) {
      return { variant: "caution", label: "Pre-screening pending for over 7 days" }
    }
  }

  if (hasInitiated || latestEvent) {
    return { variant: "pending", label: "Pre-screening in progress" }
  }

  return undefined
}

export function isBasicPermitProcess(process: ProjectProcessSummary): boolean {
  const haystack = `${process.title ?? ""} ${process.description ?? ""}`.toLowerCase()
  return haystack.includes("basic permit")
}

export function determineBasicPermitStatus(
  process: ProjectProcessSummary
): { variant: PreScreeningStatus; label: string } | undefined {
  if (!isBasicPermitProcess(process)) {
    return undefined
  }

  const hasApproval = process.caseEvents.some(
    (event) => event.eventType?.toLowerCase() === BASIC_PERMIT_APPROVED_EVENT
  )
  if (hasApproval) {
    return { variant: "complete", label: `${BASIC_PERMIT_LABEL} complete` }
  }

  const latestEvent = process.caseEvents[0]
  if (!latestEvent) {
    return undefined
  }

  const eventStatus = latestEvent.status?.toLowerCase()

  if (eventStatus === "late" || eventStatus === "overdue" || eventStatus === "delayed") {
    return { variant: "caution", label: `${BASIC_PERMIT_LABEL} delayed` }
  }

  const latestTimestamp = parseTimestampMillis(latestEvent.lastUpdated)
  if (latestTimestamp && Date.now() - latestTimestamp > PRE_SCREENING_ONE_WEEK_MS) {
    return { variant: "caution", label: `${BASIC_PERMIT_LABEL} pending for over 7 days` }
  }

  return { variant: "pending", label: `${BASIC_PERMIT_LABEL} in progress` }
}

export function isComplexReviewProcess(process: ProjectProcessSummary): boolean {
  const haystack = `${process.title ?? ""} ${process.description ?? ""}`.toLowerCase()
  return haystack.includes("complex review")
}

export function determineComplexReviewStatus(
  process: ProjectProcessSummary
): { variant: PreScreeningStatus; label: string } | undefined {
  if (!isComplexReviewProcess(process)) {
    return undefined
  }

  const hasApproval = process.caseEvents.some(
    (event) => event.eventType?.toLowerCase() === COMPLEX_REVIEW_APPROVED_EVENT
  )
  if (hasApproval) {
    return { variant: "complete", label: `${COMPLEX_REVIEW_LABEL} complete` }
  }

  const latestEvent = process.caseEvents[0]
  if (!latestEvent) {
    return undefined
  }

  const eventStatus = latestEvent.status?.toLowerCase()

  if (eventStatus === "late" || eventStatus === "overdue" || eventStatus === "delayed") {
    return { variant: "caution", label: `${COMPLEX_REVIEW_LABEL} delayed` }
  }

  const latestTimestamp = parseTimestampMillis(latestEvent.lastUpdated)
  if (latestTimestamp && Date.now() - latestTimestamp > PRE_SCREENING_ONE_WEEK_MS) {
    return { variant: "caution", label: `${COMPLEX_REVIEW_LABEL} pending for over 7 days` }
  }

  return { variant: "pending", label: `${COMPLEX_REVIEW_LABEL} in progress` }
}

export function isProcessComplete(process: ProjectProcessSummary): boolean {
  if (isPreScreeningProcess(process)) {
    return process.caseEvents.some((event) => event.eventType === PRE_SCREENING_COMPLETE_EVENT)
  }

  if (isBasicPermitProcess(process)) {
    return process.caseEvents.some(
      (event) => event.eventType?.toLowerCase() === BASIC_PERMIT_APPROVED_EVENT
    )
  }

  if (isComplexReviewProcess(process)) {
    return process.caseEvents.some(
      (event) => event.eventType?.toLowerCase() === COMPLEX_REVIEW_APPROVED_EVENT
    )
  }

  return process.caseEvents.some((event) => {
    const eventType = event.eventType?.toLowerCase()
    if (event.status?.toLowerCase() === "complete") {
      return true
    }
    return typeof eventType === "string" && eventType.includes("complete")
  })
}

export function isProcessDelayed(process: ProjectProcessSummary): boolean {
  if (determinePreScreeningStatus(process)?.variant === "caution") {
    return true
  }

  if (determineBasicPermitStatus(process)?.variant === "caution") {
    return true
  }

  if (determineComplexReviewStatus(process)?.variant === "caution") {
    return true
  }

  return process.caseEvents.some((event) => {
    const status = event.status?.toLowerCase()
    return status === "late" || status === "overdue" || status === "delayed"
  })
}

const AUTO_POPULATED_CHECKLIST_LABELS = new Set([
  BASIC_PERMIT_LABEL.toLowerCase(),
  COMPLEX_REVIEW_LABEL.toLowerCase(),
])

export function isAutoPopulatedChecklistItem(item: { label: string }): boolean {
  return AUTO_POPULATED_CHECKLIST_LABELS.has(item.label.toLowerCase())
}

export function isPermitChecklistComplete(entry: ProjectHierarchy): boolean {
  const manualItems = entry.permittingChecklist.filter((item) => !isAutoPopulatedChecklistItem(item))
  return manualItems.length > 0 && manualItems.every((item) => item.completed)
}

export function determineProjectStatus(entry: ProjectHierarchy): { variant: PreScreeningStatus; label: string } {
  const hasProcesses = entry.processes.length > 0
  const allProcessesComplete = hasProcesses && entry.processes.every(isProcessComplete)
  const checklistComplete = isPermitChecklistComplete(entry)

  if (allProcessesComplete && checklistComplete) {
    return { variant: "complete", label: "Project complete" }
  }

  if (!hasProcesses) {
    return { variant: "pending", label: "Project not started" }
  }

  if (entry.processes.some(isProcessDelayed)) {
    return { variant: "caution", label: "Project needs attention" }
  }

  return { variant: "pending", label: "Project in progress" }
}

export function getLatestCaseEvent(entry: ProjectHierarchy): CaseEventSummary | undefined {
  let latest: CaseEventSummary | undefined
  let latestTimestamp = -Infinity

  for (const process of entry.processes) {
    for (const event of process.caseEvents) {
      const timestamp = parseTimestampMillis(event.lastUpdated)
      if (typeof timestamp === "number") {
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp
          latest = event
        }
      } else if (!latest) {
        latest = event
      }
    }
  }

  return latest
}
