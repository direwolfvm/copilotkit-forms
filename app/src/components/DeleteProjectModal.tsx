import { useState } from "react"

import {
  deletePortalProject,
  loadSection106ShadowState,
  type ProjectHierarchy
} from "../utils/projectPersistence"
import { authenticatePermitflowUser, deletePermitflowProject } from "../utils/permitflow"
import { authenticateReviewworksUser, deleteReviewworksProject } from "../utils/reviewworks"
import { SECTION106_SYSTEM_LABEL, withdrawSection106Case } from "../utils/section106"
import {
  isComplexReviewProcess,
  isRowAuthorizationProcess,
  isSection106Process
} from "../utils/projectStatus"

type DeletionStepStatus = "pending" | "running" | "done" | "skipped" | "error"

type DeletionStep = {
  key: string
  label: string
  status: DeletionStepStatus
  message?: string
}

export function DeleteProjectModal({
  entry,
  onDismiss,
  onDeleted
}: {
  entry: ProjectHierarchy
  onDismiss: () => void
  onDeleted: () => void
}) {
  const hasRowAuthorization = entry.processes.some((process) => isRowAuthorizationProcess(process))
  const hasComplexReview = entry.processes.some((process) => isComplexReviewProcess(process))
  const hasSection106 = entry.processes.some((process) => isSection106Process(process))

  const [deleteRowAuthorization, setDeleteRowAuthorization] = useState(hasRowAuthorization)
  const [deleteComplexReview, setDeleteComplexReview] = useState(hasComplexReview)
  const [withdrawSection106, setWithdrawSection106] = useState(hasSection106)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [steps, setSteps] = useState<DeletionStep[]>([])
  const [phase, setPhase] = useState<"confirm" | "running" | "done" | "failed">("confirm")

  const needsCredentials = deleteRowAuthorization || deleteComplexReview
  const projectTitle = entry.project.title?.trim() || `Project ${entry.project.id}`

  const updateStep = (key: string, status: DeletionStepStatus, message?: string) => {
    setSteps((previous) =>
      previous.map((step) => (step.key === key ? { ...step, status, message } : step))
    )
  }

  const handleDelete = async () => {
    if (needsCredentials && (!email.trim() || !password)) {
      setSteps([
        {
          key: "credentials",
          label: "Credentials",
          status: "error",
          message: "Enter the demo account email and password to delete external applications."
        }
      ])
      return
    }

    const plan: DeletionStep[] = [
      ...(withdrawSection106
        ? [{ key: "s106", label: `Withdraw Section 106 case (${SECTION106_SYSTEM_LABEL})`, status: "pending" as const }]
        : []),
      ...(deleteRowAuthorization
        ? [{ key: "permitfast", label: "Delete PermitFast SF-299 application", status: "pending" as const }]
        : []),
      ...(deleteComplexReview
        ? [{ key: "reviewworks", label: "Delete ReviewWorks Complex Review application", status: "pending" as const }]
        : []),
      { key: "portal", label: "Delete portal project data", status: "pending" as const }
    ]
    setSteps(plan)
    setPhase("running")
    let failed = false

    // External systems first — the Section 106 linkage lives in portal shadow records,
    // which the final portal deletion removes.
    if (withdrawSection106) {
      updateStep("s106", "running")
      try {
        const shadow = await loadSection106ShadowState(entry.project.id)
        if (shadow.linkage) {
          await withdrawSection106Case({
            processInstanceId: shadow.linkage.exchangeProcessInstanceId,
            reason: `The proponent deleted project "${projectTitle}" in HelpPermitMe and withdraws the Section 106 initiation.`
          })
          updateStep("s106", "done", "Case managers notified; the case remains on their side.")
        } else {
          updateStep("s106", "skipped", "No linked Section 106 case found.")
        }
      } catch (error) {
        failed = true
        updateStep("s106", "error", error instanceof Error ? error.message : "Withdrawal failed.")
      }
    }

    let permitflowToken: string | undefined
    let reviewworksToken: string | undefined
    if (!failed && deleteRowAuthorization) {
      updateStep("permitfast", "running")
      try {
        permitflowToken = (await authenticatePermitflowUser({ email: email.trim(), password })).accessToken
        const result = await deletePermitflowProject({
          portalProjectId: entry.project.id,
          accessToken: permitflowToken
        })
        updateStep(
          "permitfast",
          result.deleted ? "done" : "skipped",
          result.deleted ? undefined : "No linked PermitFast application found."
        )
      } catch (error) {
        failed = true
        updateStep("permitfast", "error", error instanceof Error ? error.message : "Deletion failed.")
      }
    }

    if (!failed && deleteComplexReview) {
      updateStep("reviewworks", "running")
      try {
        reviewworksToken = (await authenticateReviewworksUser({ email: email.trim(), password })).accessToken
        const result = await deleteReviewworksProject({
          portalProjectId: entry.project.id,
          accessToken: reviewworksToken
        })
        updateStep(
          "reviewworks",
          result.deleted ? "done" : "skipped",
          result.deleted ? undefined : "No linked ReviewWorks application found."
        )
      } catch (error) {
        failed = true
        updateStep("reviewworks", "error", error instanceof Error ? error.message : "Deletion failed.")
      }
    }

    if (!failed) {
      updateStep("portal", "running")
      try {
        await deletePortalProject(entry.project.id)
        updateStep("portal", "done")
      } catch (error) {
        failed = true
        updateStep("portal", "error", error instanceof Error ? error.message : "Deletion failed.")
      }
    } else {
      updateStep("portal", "skipped", "Skipped because an earlier step failed.")
    }

    setPhase(failed ? "failed" : "done")
  }

  return (
    <div className="process-info-modal__backdrop" role="presentation" onClick={phase === "running" ? undefined : onDismiss}>
      <div
        className="process-info-modal delete-project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="process-info-modal__header">
          <div>
            <p className="process-info-modal__eyebrow">Delete project</p>
            <h2 id="delete-project-modal-title">{projectTitle}</h2>
          </div>
          {phase !== "running" ? (
            <button
              type="button"
              className="process-info-modal__close"
              onClick={onDismiss}
              aria-label="Close delete project dialog"
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="process-info-modal__body">
          {phase === "confirm" ? (
            <>
              <p>
                This permanently deletes the project and its portal data (processes, case
                events, decision payloads, documents, and map data). This cannot be undone.
              </p>
              <fieldset className="delete-project-modal__options">
                <legend>Also remove linked permit applications</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={deleteRowAuthorization}
                    onChange={(event) => setDeleteRowAuthorization(event.target.checked)}
                  />
                  <span>
                    Delete the Right of Way Authorization (SF-299) application in PermitFast
                    {hasRowAuthorization ? "" : " (none detected)"}
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={deleteComplexReview}
                    onChange={(event) => setDeleteComplexReview(event.target.checked)}
                  />
                  <span>
                    Delete the Complex Review application in ReviewWorks
                    {hasComplexReview ? "" : " (none detected)"}
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={withdrawSection106}
                    onChange={(event) => setWithdrawSection106(event.target.checked)}
                  />
                  <span>
                    Withdraw the NHPA Section 106 case in the {SECTION106_SYSTEM_LABEL}
                    {hasSection106 ? "" : " (none detected)"} — their exchange API has no
                    delete, so the case is withdrawn by notification
                  </span>
                </label>
              </fieldset>
              {needsCredentials ? (
                <div className="delete-project-modal__credentials">
                  <p>
                    Deleting PermitFast or ReviewWorks applications requires the demo
                    account credentials for those systems.
                  </p>
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="username"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                    />
                  </label>
                </div>
              ) : null}
              {steps.length > 0 && steps[0]?.key === "credentials" ? (
                <p className="delete-project-modal__error" role="alert">
                  {steps[0].message}
                </p>
              ) : null}
              <div className="delete-project-modal__actions">
                <button type="button" className="usa-button usa-button--outline" onClick={onDismiss}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="usa-button delete-project-modal__confirm"
                  onClick={() => void handleDelete()}
                >
                  Delete project
                </button>
              </div>
            </>
          ) : (
            <>
              <ul className="delete-project-modal__steps">
                {steps.map((step) => (
                  <li key={step.key} className={`delete-project-modal__step delete-project-modal__step--${step.status}`}>
                    <span className="delete-project-modal__step-label">{step.label}</span>
                    <span className="delete-project-modal__step-status">
                      {step.status === "pending" && "Waiting"}
                      {step.status === "running" && "Working…"}
                      {step.status === "done" && "Done"}
                      {step.status === "skipped" && "Skipped"}
                      {step.status === "error" && "Failed"}
                    </span>
                    {step.message ? (
                      <span className="delete-project-modal__step-message">{step.message}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {phase === "done" ? (
                <p role="status">Project deleted.</p>
              ) : phase === "failed" ? (
                <p className="delete-project-modal__error" role="alert">
                  Deletion did not complete. Nothing further was removed — review the errors
                  above and try again.
                </p>
              ) : null}
              <div className="delete-project-modal__actions">
                {phase === "done" ? (
                  <button type="button" className="usa-button" onClick={onDeleted}>
                    Close
                  </button>
                ) : phase === "failed" ? (
                  <button type="button" className="usa-button usa-button--outline" onClick={onDismiss}>
                    Close
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
