import { useId } from "react"
import type { ReactNode } from "react"

import type { ProjectFormData } from "../schema/projectSchema"
import { CollapsibleCard, type CollapsibleCardStatus } from "./CollapsibleCard"

type NepaFieldKey =
  | "nepa_categorical_exclusion_code"
  | "nepa_conformance_conditions"
  | "nepa_extraordinary_circumstances"

interface FieldConfig {
  title?: string
  description?: string
  placeholder?: string
  rows?: number
}

interface NepaReviewSectionProps {
  values: Pick<
    ProjectFormData,
    "nepa_categorical_exclusion_code" | "nepa_conformance_conditions" | "nepa_extraordinary_circumstances"
  >
  fieldConfigs: Partial<Record<NepaFieldKey, FieldConfig>>
  onFieldChange: (key: NepaFieldKey, value: string | undefined) => void
  onSavePreScreeningData: () => void
  onSubmitPreScreeningData: () => void
  preScreeningSubmitState: {
    status: "idle" | "saving" | "success" | "error"
    message?: string
    action?: "save" | "submit"
  }
  isProjectSaving: boolean
  canSubmitPreScreening: boolean
  onShowProcessInformation: () => void
  isProcessInformationLoading: boolean
  status?: CollapsibleCardStatus
}

export function NepaReviewSection({
  values,
  fieldConfigs,
  onFieldChange,
  onSavePreScreeningData,
  onSubmitPreScreeningData,
  preScreeningSubmitState,
  isProjectSaving,
  canSubmitPreScreening,
  onShowProcessInformation,
  isProcessInformationLoading,
  status
}: NepaReviewSectionProps) {
  const categoricalId = useId()
  const conformanceId = useId()
  const extraordinaryId = useId()

  const categoricalConfig = fieldConfigs.nepa_categorical_exclusion_code
  const conformanceConfig = fieldConfigs.nepa_conformance_conditions
  const extraordinaryConfig = fieldConfigs.nepa_extraordinary_circumstances

  let submissionStatus: ReactNode = null
  if (preScreeningSubmitState.status === "saving") {
    const savingLabel =
      preScreeningSubmitState.message ??
      (preScreeningSubmitState.action === "save"
        ? "Saving pre-screening data…"
        : "Submitting pre-screening data…")
    submissionStatus = (
      <div className="form-panel__status">
        <span className="status" role="status">{savingLabel}</span>
      </div>
    )
  } else if (preScreeningSubmitState.status === "error") {
    submissionStatus = (
      <div className="form-panel__status">
        <span className="status status--error" role="alert">{preScreeningSubmitState.message}</span>
      </div>
    )
  } else if (preScreeningSubmitState.status === "success") {
    const successLabel =
      preScreeningSubmitState.message ??
      (preScreeningSubmitState.action === "save"
        ? "Pre-screening data saved."
        : "Pre-screening data submitted.")
    submissionStatus = (
      <div className="form-panel__status">
        <span className="status" role="status">{successLabel}</span>
      </div>
    )
  } else if (!canSubmitPreScreening) {
    submissionStatus = (
      <div className="form-panel__status">
        <span className="status" role="status">
          Save the project snapshot to enable pre-screening actions.
        </span>
      </div>
    )
  }

  return (
    <CollapsibleCard
      className="form-panel"
      title="NEPA review"
      description="Capture information related to the NEPA review process."
      ariaLabel="NEPA review details"
      status={status}
      dataAttributes={{
        "data-tour-id": "portal-nepa",
        "data-tour-title": "Review NEPA factors",
        "data-tour-intro":
          "Summarize categorical exclusions, conditions, and extraordinary circumstances. The Copilot can draft language based on your project details."
      }}
    >
      <div className="form-panel__body">
        <div className="form-field">
          <label htmlFor={categoricalId}>{categoricalConfig?.title ?? "Categorical Exclusion"}</label>
          {categoricalConfig?.description ? <p className="help-block">{categoricalConfig.description}</p> : null}
          <textarea
            id={categoricalId}
            value={values.nepa_categorical_exclusion_code ?? ""}
            placeholder={categoricalConfig?.placeholder}
            rows={categoricalConfig?.rows ?? 3}
            onChange={(event) =>
              onFieldChange("nepa_categorical_exclusion_code", event.target.value || undefined)
            }
          />
        </div>
        <div className="form-field">
          <label htmlFor={conformanceId}>{conformanceConfig?.title ?? "Conditions for Conformance"}</label>
          {conformanceConfig?.description ? <p className="help-block">{conformanceConfig.description}</p> : null}
          <textarea
            id={conformanceId}
            value={values.nepa_conformance_conditions ?? ""}
            placeholder={conformanceConfig?.placeholder}
            rows={conformanceConfig?.rows ?? 4}
            onChange={(event) =>
              onFieldChange("nepa_conformance_conditions", event.target.value || undefined)
            }
          />
        </div>
        <div className="form-field">
          <label htmlFor={extraordinaryId}>
            {extraordinaryConfig?.title ?? "Environmental Narrative"}
          </label>
          {extraordinaryConfig?.description ? <p className="help-block">{extraordinaryConfig.description}</p> : null}
          <textarea
            id={extraordinaryId}
            value={values.nepa_extraordinary_circumstances ?? ""}
            placeholder={extraordinaryConfig?.placeholder}
            rows={extraordinaryConfig?.rows ?? 5}
            onChange={(event) =>
              onFieldChange("nepa_extraordinary_circumstances", event.target.value || undefined)
            }
          />
        </div>
      </div>
      <div className="form-panel__footer pre-screening-footer">
        <div className="pre-screening-footer__row">
          <div className="pre-screening-footer__process">
            <button
              type="button"
              className="usa-button usa-button--outline secondary"
              onClick={onShowProcessInformation}
              disabled={isProcessInformationLoading}
            >
              {isProcessInformationLoading ? "Loading…" : "Process information"}
            </button>
          </div>
          <div className="pre-screening-footer__actions">
            {submissionStatus}
            <div className="pre-screening-footer__buttons">
              <button
                type="button"
                className="usa-button usa-button--outline secondary"
                onClick={onSavePreScreeningData}
                disabled={
                  isProjectSaving ||
                  preScreeningSubmitState.status === "saving" ||
                  !canSubmitPreScreening
                }
              >
                {preScreeningSubmitState.status === "saving" && preScreeningSubmitState.action === "save"
                  ? "Saving…"
                  : "Save pre-screening data"}
              </button>
              <button
                type="button"
                className="usa-button usa-button--outline secondary"
                onClick={onSubmitPreScreeningData}
                disabled={
                  isProjectSaving ||
                  preScreeningSubmitState.status === "saving" ||
                  !canSubmitPreScreening
                }
              >
                {preScreeningSubmitState.status === "saving" && preScreeningSubmitState.action === "submit"
                  ? "Submitting…"
                  : "Submit pre-screening data"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleCard>
  )
}
