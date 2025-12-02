import { useId } from "react"
import type { ReactNode } from "react"

import type { ProjectFormData } from "../schema/projectSchema"
import type {
  GeospatialResultsState,
  GeospatialServiceState,
  IpacSummary,
  NepassistSummaryItem
} from "../types/geospatial"
import { CollapsibleCard } from "./CollapsibleCard"

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
  geospatialResults: GeospatialResultsState
  onRunGeospatialScreen: () => void
  isRunningGeospatial: boolean
  hasGeometry: boolean
  bufferMiles: number
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
}

function NepassistSummaryTable({ items }: { items: NepassistSummaryItem[] }) {
  if (!items.length) {
    return <p className="geospatial-results__status muted">No NEPA Assist findings returned.</p>
  }

  return (
    <div className="geospatial-results__table-wrapper">
      <table className="geospatial-results__table">
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.question}-${index}`}>
              <td>{item.question}</td>
              <td>{item.displayAnswer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderList(items: string[]) {
  if (!items.length) {
    return <span className="geospatial-results__status muted">None returned</span>
  }
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  )
}

function IpacSummaryDetails({ summary }: { summary: IpacSummary }) {
  const wetlands = summary.wetlands
  return (
    <div className="geospatial-results__ipac">
      <ul>
        <li>
          <strong>Location</strong>: {summary.locationDescription || "Not provided"}
        </li>
        <li>
          <strong>Listed species</strong>: {renderList(summary.listedSpecies)}
        </li>
        <li>
          <strong>Critical habitat</strong>:{" "}
          {renderList(summary.criticalHabitats)}
        </li>
        <li>
          <strong>Migratory birds of concern</strong>:{" "}
          {renderList(summary.migratoryBirds)}
        </li>
        <li>
          <strong>Wetlands</strong>:{" "}
          {wetlands.length === 0 ? (
            <span className="geospatial-results__status muted">None returned</span>
          ) : (
            <ul>
              {wetlands.map((wetland, index) => (
                <li key={`${wetland.name}-${index}`}>
                  {wetland.name}
                  {wetland.acres ? ` – ${wetland.acres} ac` : null}
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>
    </div>
  )
}

interface GeospatialServiceCardProps<TSummary> {
  title: string
  result: GeospatialServiceState<TSummary>
  renderSummary: (summary: TSummary) => ReactNode
  emptyMessage: string
}

function GeospatialServiceCard<TSummary>({
  title,
  result,
  renderSummary,
  emptyMessage
}: GeospatialServiceCardProps<TSummary>) {
  let content: ReactNode
  switch (result.status) {
    case "loading":
      content = <p className="geospatial-results__status">Running geospatial query…</p>
      break
    case "error":
      content = (
        <p className="geospatial-results__status error">{result.error ?? "The screening request failed."}</p>
      )
      break
    case "success":
      content =
        result.summary !== undefined
          ? renderSummary(result.summary)
          : <p className="geospatial-results__status muted">{emptyMessage}</p>
      break
    default:
      content = <p className="geospatial-results__status muted">{emptyMessage}</p>
      break
  }

  return (
    <div className="geospatial-results__card" aria-live="polite">
      <h4>{title}</h4>
      {content}
    </div>
  )
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) {
    return undefined
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

export function NepaReviewSection({
  values,
  fieldConfigs,
  onFieldChange,
  geospatialResults,
  onRunGeospatialScreen,
  isRunningGeospatial,
  hasGeometry,
  bufferMiles,
  onSavePreScreeningData,
  onSubmitPreScreeningData,
  preScreeningSubmitState,
  isProjectSaving,
  canSubmitPreScreening,
  onShowProcessInformation,
  isProcessInformationLoading
}: NepaReviewSectionProps) {
  const categoricalId = useId()
  const conformanceId = useId()
  const extraordinaryId = useId()

  const categoricalConfig = fieldConfigs.nepa_categorical_exclusion_code
  const conformanceConfig = fieldConfigs.nepa_conformance_conditions
  const extraordinaryConfig = fieldConfigs.nepa_extraordinary_circumstances

  const lastRunLabel = formatTimestamp(geospatialResults.lastRunAt)

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
        <div className="geospatial-results">
          <div className="geospatial-results__header">
            <div>
              <h3>Geospatial screening</h3>
              <p className="help-block">
                Runs NEPA Assist and IPaC with a {bufferMiles.toFixed(2)} mile buffer around the project geometry.
              </p>
            </div>
            {lastRunLabel ? (
              <span className="geospatial-results__timestamp" aria-live="polite">
                Last run {lastRunLabel}
              </span>
            ) : null}
          </div>
          {geospatialResults.messages && geospatialResults.messages.length > 0 ? (
            <ul className="geospatial-results__messages">
              {geospatialResults.messages.map((message, index) => (
                <li key={`geospatial-message-${index}`}>{message}</li>
              ))}
            </ul>
          ) : null}
          <div className="geospatial-results__cards">
            <GeospatialServiceCard
              title="NEPA Assist"
              result={geospatialResults.nepassist}
              renderSummary={(summary) => <NepassistSummaryTable items={summary} />}
              emptyMessage="Run the geospatial screen to request NEPA Assist data."
            />
            <GeospatialServiceCard
              title="IPaC"
              result={geospatialResults.ipac}
              renderSummary={(summary) => <IpacSummaryDetails summary={summary} />}
              emptyMessage="Run the geospatial screen to request IPaC data."
            />
          </div>
        </div>
      </div>
      <div className="form-panel__footer geospatial-footer">
        <button
          type="button"
          className="secondary"
          onClick={onRunGeospatialScreen}
          disabled={isRunningGeospatial || !hasGeometry}
        >
          {isRunningGeospatial ? "Running geospatial screen…" : "Run geospatial screen"}
        </button>
        {!hasGeometry ? (
          <p className="help-block geospatial-footer__hint">Draw a project geometry to enable the screening tools.</p>
        ) : null}
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
