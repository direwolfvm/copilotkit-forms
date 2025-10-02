import { useId } from "react"

import type { ProjectFormData } from "../schema/projectSchema"

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
}

export function NepaReviewSection({ values, fieldConfigs, onFieldChange }: NepaReviewSectionProps) {
  const categoricalId = useId()
  const conformanceId = useId()
  const extraordinaryId = useId()

  const categoricalConfig = fieldConfigs.nepa_categorical_exclusion_code
  const conformanceConfig = fieldConfigs.nepa_conformance_conditions
  const extraordinaryConfig = fieldConfigs.nepa_extraordinary_circumstances

  return (
    <section className="form-panel" aria-label="NEPA review details">
      <header className="form-panel__header">
        <h2>NEPA review</h2>
        <p className="help-block">
          Capture categorical exclusion information to document the NEPA review status for this project.
        </p>
      </header>
      <div className="form-panel__body">
        <div className="form-field">
          <label htmlFor={categoricalId}>{categoricalConfig?.title ?? "Categorical Exclusion Code"}</label>
          {categoricalConfig?.description ? <p className="help-block">{categoricalConfig.description}</p> : null}
          <input
            id={categoricalId}
            type="text"
            value={values.nepa_categorical_exclusion_code ?? ""}
            placeholder={categoricalConfig?.placeholder}
            onChange={(event) => onFieldChange("nepa_categorical_exclusion_code", event.target.value || undefined)}
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
            onChange={(event) => onFieldChange("nepa_conformance_conditions", event.target.value || undefined)}
          />
        </div>
        <div className="form-field">
          <label htmlFor={extraordinaryId}>
            {extraordinaryConfig?.title ?? "Extraordinary Circumstances Narrative"}
          </label>
          {extraordinaryConfig?.description ? <p className="help-block">{extraordinaryConfig.description}</p> : null}
          <textarea
            id={extraordinaryId}
            value={values.nepa_extraordinary_circumstances ?? ""}
            placeholder={extraordinaryConfig?.placeholder}
            rows={extraordinaryConfig?.rows ?? 5}
            onChange={(event) => onFieldChange("nepa_extraordinary_circumstances", event.target.value || undefined)}
          />
        </div>
      </div>
      <div className="form-panel__footer">
        <button type="button" className="secondary">
          Run geospatial screen
        </button>
      </div>
    </section>
  )
}
