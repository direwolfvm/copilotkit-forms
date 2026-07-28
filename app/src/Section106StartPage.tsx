import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import Form from "@rjsf/core"
import type { IChangeEvent } from "@rjsf/core"
import validator from "@rjsf/validator-ajv8"

import "./App.css"
import {
  SECTION106_REVIEW_LABEL,
  SECTION106_SYSTEM_LABEL,
  Section106Error,
  initiateSection106Review,
  isOpenProponentTask,
  isSection106NotConfigured,
  loadSection106CaseEvents,
  loadSection106Instance,
  loadSection106ProcessInformation,
  respondSection106InformationRequest,
  saveSection106Section,
  seedSection106SectionEvaluationData,
  submitSection106Review,
  type Section106CaseEvent,
  type Section106Element,
  type Section106InstanceStatus,
  type Section106ProcessInformation
} from "./utils/section106"
import {
  ProjectPersistenceError,
  ensureSection106ShadowProcess,
  loadProjectPortalState,
  loadSection106ShadowState,
  recordSection106ShadowEvent,
  type Section106CaseLinkage
} from "./utils/projectPersistence"
import type { ProjectFormData } from "./schema/projectSchema"

type ProcessInfoState =
  | { status: "idle" | "loading" }
  | { status: "success"; info: Section106ProcessInformation }
  | { status: "error"; message: string; notConfigured: boolean }

type ProjectState =
  | { status: "idle" | "loading" }
  | { status: "success"; formData: ProjectFormData }
  | { status: "error"; message: string }

type CaseState =
  | { status: "idle" | "loading" }
  | { status: "none" }
  | {
      status: "linked"
      linkage: Section106CaseLinkage
      shadowProcessInstanceId?: number
      instance?: Section106InstanceStatus
      events: Section106CaseEvent[]
    }
  | { status: "error"; message: string }

type ActionState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "success"; message: string }
  | { status: "error"; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasSchema(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false
  }
  return isRecord(value.properties) && Object.keys(value.properties).length > 0
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof Section106Error || error instanceof ProjectPersistenceError) {
    return error.message
  }
  return error instanceof Error ? error.message : fallback
}

function formatEventTimestamp(value?: string): string | undefined {
  if (!value) {
    return undefined
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString()
}

export default function Section106StartPage() {
  const [searchParams] = useSearchParams()
  const [processInfoState, setProcessInfoState] = useState<ProcessInfoState>({ status: "idle" })
  const [projectState, setProjectState] = useState<ProjectState>({ status: "idle" })
  const [caseState, setCaseState] = useState<CaseState>({ status: "idle" })
  const [initiateState, setInitiateState] = useState<ActionState>({ status: "idle" })
  const [sectionDrafts, setSectionDrafts] = useState<Record<number, Record<string, unknown>>>({})
  const [activeSectionId, setActiveSectionId] = useState<number | undefined>(undefined)
  const [sectionSaveState, setSectionSaveState] = useState<ActionState>({ status: "idle" })
  const [submitState, setSubmitState] = useState<ActionState>({ status: "idle" })
  const [taskResponses, setTaskResponses] = useState<Record<number, string>>({})
  const [taskActionState, setTaskActionState] = useState<Record<number, ActionState>>({})

  const portalProjectId = useMemo(() => {
    const raw = searchParams.get("projectId")
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isFinite(parsed) ? parsed : undefined
  }, [searchParams])

  useEffect(() => {
    let isCancelled = false
    setProcessInfoState({ status: "loading" })
    loadSection106ProcessInformation()
      .then((info) => {
        if (!isCancelled) {
          setProcessInfoState({ status: "success", info })
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setProcessInfoState({
            status: "error",
            message: describeError(error, "Unable to load the Section 106 process model."),
            notConfigured: isSection106NotConfigured(error)
          })
        }
      })
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    if (typeof portalProjectId !== "number") {
      setProjectState({
        status: "error",
        message: "Provide a numeric projectId to start a Section 106 review."
      })
      return () => {
        isCancelled = true
      }
    }
    setProjectState({ status: "loading" })
    loadProjectPortalState(portalProjectId)
      .then((result) => {
        if (!isCancelled) {
          setProjectState({ status: "success", formData: result.formData })
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setProjectState({
            status: "error",
            message: describeError(error, "Unable to load project details.")
          })
        }
      })
    return () => {
      isCancelled = true
    }
  }, [portalProjectId])

  const refreshCaseState = useCallback(async () => {
    if (typeof portalProjectId !== "number") {
      return
    }
    setCaseState({ status: "loading" })
    try {
      const shadow = await loadSection106ShadowState(portalProjectId)
      if (!shadow.linkage) {
        setCaseState({ status: "none" })
        return
      }
      const [instance, events] = await Promise.all([
        loadSection106Instance(shadow.linkage.exchangeProcessInstanceId).catch(() => undefined),
        loadSection106CaseEvents(shadow.linkage.exchangeProcessInstanceId).catch(
          () => [] as Section106CaseEvent[]
        )
      ])
      setCaseState({
        status: "linked",
        linkage: shadow.linkage,
        shadowProcessInstanceId: shadow.processInstanceId,
        instance,
        events
      })
    } catch (error) {
      setCaseState({
        status: "error",
        message: describeError(error, "Unable to check the Section 106 case status.")
      })
    }
  }, [portalProjectId])

  useEffect(() => {
    if (projectState.status === "success") {
      void refreshCaseState()
    }
  }, [projectState, refreshCaseState])

  const formSections = useMemo(() => {
    if (processInfoState.status !== "success") {
      return [] as Section106Element[]
    }
    return processInfoState.info.elements.filter((element) => element.hasForm)
  }, [processInfoState])

  const activeSection = useMemo(
    () =>
      formSections.find((section) => section.id === activeSectionId) ?? formSections[0],
    [formSections, activeSectionId]
  )

  // The exchange API has no payload read-back endpoint, so prefill each section draft
  // from the same seeding logic used at initiation — saving an untouched section then
  // re-posts the seeded values instead of blanking them.
  useEffect(() => {
    if (projectState.status !== "success" || formSections.length === 0) {
      return
    }
    setSectionDrafts((previous) => {
      const next = { ...previous }
      let changed = false
      for (const section of formSections) {
        if (!next[section.id] || Object.keys(next[section.id]).length === 0) {
          next[section.id] = seedSection106SectionEvaluationData(section, projectState.formData)
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [projectState, formSections])

  const linkage = caseState.status === "linked" ? caseState.linkage : undefined
  const caseInstance = caseState.status === "linked" ? caseState.instance : undefined
  const caseEvents = useMemo(
    () => (caseState.status === "linked" ? caseState.events : []),
    [caseState]
  )
  const openTasks = useMemo(() => caseEvents.filter(isOpenProponentTask), [caseEvents])

  const handleInitiate = async () => {
    if (projectState.status !== "success" || typeof portalProjectId !== "number") {
      setInitiateState({ status: "error", message: "Project details are not available yet." })
      return
    }
    setInitiateState({ status: "working" })
    try {
      const result = await initiateSection106Review({
        formData: projectState.formData,
        portalProjectId
      })
      await ensureSection106ShadowProcess({
        projectId: portalProjectId,
        projectTitle: projectState.formData.title ?? null,
        linkage: {
          exchangeProjectId: result.exchangeProjectId,
          exchangeProcessInstanceId: result.processInstanceId,
          caseNumber: result.caseNumber
        }
      })
      setInitiateState({
        status: "success",
        message: result.caseNumber
          ? `Case ${result.caseNumber} opened in the ${SECTION106_SYSTEM_LABEL}.`
          : `Case opened in the ${SECTION106_SYSTEM_LABEL}.`
      })
      await refreshCaseState()
    } catch (error) {
      setInitiateState({
        status: "error",
        message: describeError(error, "Unable to open the Section 106 case.")
      })
    }
  }

  const handleSectionDraftChange = (decisionElementId: number, draft: Record<string, unknown>) => {
    setSectionDrafts((previous) => ({ ...previous, [decisionElementId]: draft }))
  }

  const handleSaveSection = async (element: Section106Element) => {
    if (!linkage) {
      setSectionSaveState({ status: "error", message: "Open the Section 106 case first." })
      return
    }
    setSectionSaveState({ status: "working" })
    try {
      const resultNotes = await saveSection106Section({
        processInstanceId: linkage.exchangeProcessInstanceId,
        exchangeProjectId: linkage.exchangeProjectId,
        element,
        evaluationData: sectionDrafts[element.id] ?? {}
      })
      setSectionSaveState({
        status: "success",
        message: resultNotes ? `Section saved (${resultNotes}).` : "Section saved."
      })
    } catch (error) {
      setSectionSaveState({
        status: "error",
        message: describeError(error, "Unable to save this section.")
      })
    }
  }

  const handleSubmitForReview = async () => {
    if (!linkage) {
      setSubmitState({ status: "error", message: "Open the Section 106 case first." })
      return
    }
    setSubmitState({ status: "working" })
    try {
      await submitSection106Review(linkage.exchangeProcessInstanceId)
      if (caseState.status === "linked" && typeof caseState.shadowProcessInstanceId === "number") {
        try {
          await recordSection106ShadowEvent({
            processInstanceId: caseState.shadowProcessInstanceId,
            name: "Submitted for Section 106 review",
            description: linkage.caseNumber
              ? `Case ${linkage.caseNumber} submitted to the reviewers' queue.`
              : "Case submitted to the reviewers' queue.",
            type: "section106_submitted"
          })
        } catch (shadowError) {
          console.warn("Failed to record the Section 106 shadow submission event.", shadowError)
        }
      }
      setSubmitState({ status: "success", message: "Submitted for Section 106 review." })
      await refreshCaseState()
    } catch (error) {
      setSubmitState({
        status: "error",
        message: describeError(error, "Unable to submit for review.")
      })
    }
  }

  const handleRespondToTask = async (event: Section106CaseEvent) => {
    if (!linkage) {
      return
    }
    const responseText = taskResponses[event.id]?.trim()
    if (!responseText) {
      setTaskActionState((previous) => ({
        ...previous,
        [event.id]: { status: "error", message: "Enter a response before sending." }
      }))
      return
    }
    setTaskActionState((previous) => ({ ...previous, [event.id]: { status: "working" } }))
    try {
      await respondSection106InformationRequest({
        processInstanceId: linkage.exchangeProcessInstanceId,
        parentEventId: event.id,
        name: "Response from HelpPermitMe",
        description: responseText
      })
      setTaskActionState((previous) => ({
        ...previous,
        [event.id]: { status: "success", message: "Response sent to the case manager." }
      }))
      await refreshCaseState()
    } catch (error) {
      setTaskActionState((previous) => ({
        ...previous,
        [event.id]: {
          status: "error",
          message: describeError(error, "Unable to send the response.")
        }
      }))
    }
  }

  const activeSchema =
    activeSection && hasSchema(activeSection.formSchema) ? activeSection.formSchema : undefined
  const activeSchemaForRjsf = activeSchema
    ? Object.fromEntries(Object.entries(activeSchema).filter(([key]) => key !== "uiSchema"))
    : undefined
  const activeUiSchema =
    activeSchema && isRecord(activeSchema.uiSchema)
      ? (activeSchema.uiSchema as Record<string, unknown>)
      : undefined

  let processContent: ReactNode
  if (processInfoState.status === "success") {
    processContent = (
      <div>
        <h3>{processInfoState.info.model.title ?? "Section 106 Review (NHPA)"}</h3>
        {processInfoState.info.model.description ? (
          <p>{processInfoState.info.model.description}</p>
        ) : null}
        <p className="permit-start-page__status">
          {processInfoState.info.elements.length} decision elements —{" "}
          {formSections.length} form section{formSections.length === 1 ? "" : "s"}.
        </p>
      </div>
    )
  } else if (processInfoState.status === "error") {
    processContent = (
      <div className="permit-start-page__error" role="alert">
        <p>{processInfoState.message}</p>
        {processInfoState.notConfigured ? (
          <p>
            Set <code>SECTION106_EXCHANGE_API_KEY</code> on the server to enable this
            integration. The key is provided by the Case Manager team.
          </p>
        ) : null}
      </div>
    )
  } else {
    processContent = (
      <p className="permit-start-page__status" role="status" aria-live="polite">
        Loading Section 106 process information…
      </p>
    )
  }

  return (
    <article className="app permit-start-page section106-page">
      <div className="app__inner">
        <header className="permit-start-page__header">
          <p className="permit-start-page__eyebrow">{SECTION106_REVIEW_LABEL}</p>
          <h1>Start this review.</h1>
          <p>
            This workflow initiates an NHPA Section 106 review (36 CFR Part 800) in the{" "}
            {SECTION106_SYSTEM_LABEL}.
          </p>
          <div className="permit-start-page__warning section106-demo-banner" role="note">
            <p>
              <strong>Demonstration system.</strong> The {SECTION106_SYSTEM_LABEL} is a
              demo environment for the CEQ/PIC data-standard exchange — it is not a system
              of record, and nothing submitted here initiates an actual federal review.
            </p>
          </div>
        </header>
        <section className="permit-start-page__content">
          <section className="permit-start-page__panel">
            <h2>Section 106 case</h2>
            {projectState.status === "loading" ? (
              <p className="permit-start-page__status" role="status" aria-live="polite">
                Loading project details…
              </p>
            ) : null}
            {projectState.status === "error" ? (
              <div className="permit-start-page__error" role="alert">
                <p>{projectState.message}</p>
              </div>
            ) : null}
            {caseState.status === "loading" ? (
              <p className="permit-start-page__status" role="status" aria-live="polite">
                Checking for an existing case…
              </p>
            ) : null}
            {caseState.status === "error" ? (
              <div className="permit-start-page__error" role="alert">
                <p>{caseState.message}</p>
              </div>
            ) : null}
            {caseState.status === "none" && projectState.status === "success" ? (
              <div>
                <p>
                  No Section 106 case exists for this project yet. Opening one registers the
                  project with the {SECTION106_SYSTEM_LABEL} and creates a case for federal
                  reviewer personas immediately; you can keep editing the form sections until
                  you submit for review.
                </p>
                <button
                  type="button"
                  className="usa-button"
                  onClick={handleInitiate}
                  disabled={
                    initiateState.status === "working" || processInfoState.status !== "success"
                  }
                >
                  {initiateState.status === "working"
                    ? "Opening case…"
                    : "Open Section 106 case"}
                </button>
              </div>
            ) : null}
            {initiateState.status === "error" ? (
              <p className="permit-start-page__submit-error" role="alert">
                {initiateState.message}
              </p>
            ) : null}
            {initiateState.status === "success" ? (
              <p className="permit-start-page__submit-success" role="status">
                {initiateState.message}
              </p>
            ) : null}
            {caseState.status === "linked" ? (
              <div className="section106-case-summary">
                <p>
                  <strong>Case number:</strong>{" "}
                  {linkage?.caseNumber ?? caseInstance?.caseNumber ?? "(pending)"}
                </p>
                {caseInstance?.stage ? (
                  <p>
                    <strong>Workflow stage:</strong> {caseInstance.stage}
                  </p>
                ) : null}
                {caseInstance?.status ? (
                  <p>
                    <strong>Status:</strong> {caseInstance.status}
                  </p>
                ) : null}
                <div className="permit-start-page__submit">
                  <button
                    type="button"
                    className="usa-button"
                    onClick={handleSubmitForReview}
                    disabled={submitState.status === "working"}
                  >
                    {submitState.status === "working" ? "Submitting…" : "Submit for review"}
                  </button>
                  <button
                    type="button"
                    className="usa-button usa-button--outline"
                    onClick={() => void refreshCaseState()}
                    disabled={submitState.status === "working"}
                  >
                    Refresh case status
                  </button>
                  {submitState.status === "error" ? (
                    <span className="permit-start-page__submit-error" role="alert">
                      {submitState.message}
                    </span>
                  ) : null}
                  {submitState.status === "success" ? (
                    <span className="permit-start-page__submit-success" role="status">
                      {submitState.message}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {openTasks.length > 0 ? (
              <div className="section106-tasks">
                <h3>Information requests</h3>
                <p className="permit-start-page__status">
                  The case manager asked for more information. Respond below to keep the
                  review moving.
                </p>
                <ul className="section106-task-list">
                  {openTasks.map((task) => {
                    const state = taskActionState[task.id] ?? { status: "idle" }
                    return (
                      <li key={task.id} className="section106-task">
                        <p>
                          <strong>{task.name ?? "Information request"}</strong>
                          {task.respondBy ? ` — respond by ${task.respondBy}` : null}
                        </p>
                        {task.task || task.description ? (
                          <p>{task.task ?? task.description}</p>
                        ) : null}
                        <textarea
                          rows={3}
                          value={taskResponses[task.id] ?? ""}
                          onChange={(event) =>
                            setTaskResponses((previous) => ({
                              ...previous,
                              [task.id]: event.target.value
                            }))
                          }
                          placeholder="Describe how you addressed this request"
                        />
                        <div className="permit-start-page__submit">
                          <button
                            type="button"
                            className="usa-button usa-button--outline"
                            onClick={() => void handleRespondToTask(task)}
                            disabled={state.status === "working"}
                          >
                            {state.status === "working" ? "Sending…" : "Send response"}
                          </button>
                          {state.status === "error" ? (
                            <span className="permit-start-page__submit-error" role="alert">
                              {state.message}
                            </span>
                          ) : null}
                          {state.status === "success" ? (
                            <span className="permit-start-page__submit-success" role="status">
                              {state.message}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            {caseEvents.length > 0 ? (
              <div className="section106-events">
                <h3>Case timeline</h3>
                <ul className="section106-event-list">
                  {caseEvents.map((event) => (
                    <li key={event.id} className="section106-event">
                      <div className="section106-event__row">
                        <span className="section106-event__name">
                          {event.name ?? event.type ?? `Event ${event.id}`}
                        </span>
                        {formatEventTimestamp(event.datetime) ? (
                          <span className="section106-event__date">
                            {formatEventTimestamp(event.datetime)}
                          </span>
                        ) : null}
                      </div>
                      {event.description ? <p>{event.description}</p> : null}
                      <div className="section106-event__meta">
                        {event.type ? <span>Type: {event.type}</span> : null}
                        {event.followingSegmentName ? (
                          <span>Stage: {event.followingSegmentName}</span>
                        ) : null}
                        {event.outcome ? <span>Outcome: {event.outcome}</span> : null}
                        {event.status ? <span>Status: {event.status}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="permit-start-page__panel">
            {processContent}
            {caseState.status === "linked" && formSections.length > 0 ? (
              <div className="permit-start-page__sf299 section106-sections">
                <nav className="permit-start-page__sf299-nav" aria-label="Section 106 form sections">
                  <ul>
                    {formSections.map((section, index) => {
                      const isActive = activeSection?.id === section.id
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            className={`permit-start-page__sf299-nav-item${
                              isActive ? " permit-start-page__sf299-nav-item--active" : ""
                            }`}
                            aria-current={isActive ? "true" : undefined}
                            onClick={() => setActiveSectionId(section.id)}
                          >
                            <span>
                              {index + 1}. {section.title ?? section.referenceId ?? `Section ${index + 1}`}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </nav>
                <div className="permit-start-page__sf299-panel">
                  {activeSection && activeSchemaForRjsf ? (
                    <>
                      {activeSection.description ? (
                        <p className="permit-start-page__status">{activeSection.description}</p>
                      ) : null}
                      <div className="permit-start-page__custom-form-shell">
                        <Form
                          key={activeSection.id}
                          schema={activeSchemaForRjsf}
                          uiSchema={activeUiSchema}
                          formData={sectionDrafts[activeSection.id] ?? {}}
                          validator={validator}
                          onChange={(event: IChangeEvent) => {
                            handleSectionDraftChange(
                              activeSection.id,
                              (event.formData as Record<string, unknown>) ?? {}
                            )
                          }}
                        >
                          <div />
                        </Form>
                      </div>
                      <div className="permit-start-page__custom-form-footer">
                        <button
                          type="button"
                          className="usa-button usa-button--outline"
                          disabled={sectionSaveState.status === "working"}
                          onClick={() => void handleSaveSection(activeSection)}
                        >
                          {sectionSaveState.status === "working" ? "Saving…" : "Save section"}
                        </button>
                        {sectionSaveState.status === "error" ? (
                          <span className="permit-start-page__submit-error" role="alert">
                            {sectionSaveState.message}
                          </span>
                        ) : null}
                        {sectionSaveState.status === "success" ? (
                          <span className="permit-start-page__submit-success" role="status">
                            {sectionSaveState.message}
                          </span>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="permit-start-page__status">Select a section to fill in.</p>
                  )}
                </div>
              </div>
            ) : null}
            {caseState.status === "none" ? (
              <p className="permit-start-page__status">
                Open the Section 106 case to fill in the form sections.
              </p>
            ) : null}
          </section>
        </section>
      </div>
    </article>
  )
}
