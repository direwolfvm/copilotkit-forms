import type { ReactNode } from "react"

import type { ProcessInformation } from "../utils/projectPersistence"

type DefinitionField = {
  label: string
  value?: ReactNode
}

function formatDisplayDate(timestamp?: string | null) {
  if (!timestamp) {
    return undefined
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toLocaleString()
}

function formatDisplayDateOnly(dateString?: string | null) {
  if (!dateString) {
    return undefined
  }

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date.toLocaleDateString()
}

function DefinitionList({ fields }: { fields: DefinitionField[] }) {
  const items = fields.filter((field) => {
    const value = field.value
    if (value === undefined || value === null) {
      return false
    }

    if (typeof value === "string") {
      return value.trim().length > 0
    }

    return true
  })

  if (!items.length) {
    return <p className="process-info-section__empty">No additional metadata is available.</p>
  }

  return (
    <dl className="process-info-definition-list">
      {items.map((field) => (
        <div key={field.label} className="process-info-definition">
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ProcessInformationDetails({ info }: { info: ProcessInformation }) {
  const { processModel, legalStructure, decisionElements } = info

  const processTitle =
    processModel.title && processModel.title.trim().length > 0
      ? processModel.title.trim()
      : `Process model ${processModel.id}`

  const processDescription =
    processModel.description && processModel.description.trim().length > 0
      ? processModel.description
      : "No description has been provided for this process model."

  const processFields: DefinitionField[] = [
    { label: "Model identifier", value: processModel.id.toString() }
  ]

  const addProcessField = (label: string, value?: string | null) => {
    if (!value) {
      return
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return
    }
    processFields.push({ label, value: trimmed })
  }

  addProcessField("Agency", processModel.agency)
  addProcessField("Screening guidance", processModel.screeningDescription)
  addProcessField("Legal reference", processModel.legalStructureText)
  addProcessField("Notes", processModel.notes)

  const formattedProcessUpdated = formatDisplayDate(processModel.lastUpdated)
  if (formattedProcessUpdated) {
    processFields.push({ label: "Last updated", value: formattedProcessUpdated })
  }

  let legalStructureSection: ReactNode
  if (legalStructure) {
    const legalTitle =
      legalStructure.title && legalStructure.title.trim().length > 0
        ? legalStructure.title.trim()
        : `Legal structure ${legalStructure.id}`

    const legalDescription =
      legalStructure.description && legalStructure.description.trim().length > 0
        ? legalStructure.description
        : undefined

    const legalFields: DefinitionField[] = [
      { label: "Record identifier", value: legalStructure.id.toString() }
    ]

    const addLegalField = (label: string, value?: string | null) => {
      if (!value) {
        return
      }
      const trimmed = value.trim()
      if (!trimmed) {
        return
      }
      legalFields.push({ label, value: trimmed })
    }

    addLegalField("Citation", legalStructure.citation)
    addLegalField("Issuing authority", legalStructure.issuingAuthority)

    const formattedEffectiveDate = formatDisplayDateOnly(legalStructure.effectiveDate)
    if (formattedEffectiveDate) {
      legalFields.push({ label: "Effective date", value: formattedEffectiveDate })
    }

    if (legalStructure.url && legalStructure.url.trim().length > 0) {
      const href = legalStructure.url.trim()
      legalFields.push({
        label: "Reference URL",
        value: (
          <a href={href} target="_blank" rel="noreferrer">
            {href}
          </a>
        )
      })
    }

    legalStructureSection = (
      <section className="process-info-section">
        <h3>{legalTitle}</h3>
        {legalDescription ? (
          <p className="process-info-section__description">{legalDescription}</p>
        ) : null}
        <DefinitionList fields={legalFields} />
      </section>
    )
  } else {
    const legalReferenceText =
      processModel.legalStructureText && processModel.legalStructureText.trim().length > 0
        ? processModel.legalStructureText.trim()
        : undefined

    legalStructureSection = (
      <section className="process-info-section">
        <h3>Legal framework</h3>
        <p className="process-info-section__empty">
          Detailed legal structure information is not available.
          {legalReferenceText ? ` Reference: ${legalReferenceText}` : ""}
        </p>
      </section>
    )
  }

  const decisionItems = decisionElements.map((element) => {
    const elementTitle =
      element.title && element.title.trim().length > 0
        ? element.title.trim()
        : `Decision element ${element.id}`
    const elementDescription =
      element.description && element.description.trim().length > 0
        ? element.description
        : undefined

    const elementFields: DefinitionField[] = [
      { label: "Element identifier", value: element.id.toString() }
    ]

    const addElementField = (label: string, value?: string | null) => {
      if (!value) {
        return
      }
      const trimmed = value.trim()
      if (!trimmed) {
        return
      }
      elementFields.push({ label, value: trimmed })
    }

    addElementField("Category", element.category)
    addElementField("Measure", element.measure)

    if (typeof element.threshold === "number" && Number.isFinite(element.threshold)) {
      elementFields.push({ label: "Threshold", value: element.threshold.toString() })
    }

    if (typeof element.spatial === "boolean") {
      elementFields.push({ label: "Spatial", value: element.spatial ? "Yes" : "No" })
    }

    if (typeof element.intersect === "boolean") {
      elementFields.push({
        label: "Requires intersection",
        value: element.intersect ? "Yes" : "No"
      })
    }

    addElementField("Form prompt", element.formText)
    addElementField("Response guidance", element.formResponseDescription)
    addElementField("Evaluation method", element.evaluationMethod)

    const formattedElementUpdated = formatDisplayDate(element.lastUpdated)
    if (formattedElementUpdated) {
      elementFields.push({ label: "Last updated", value: formattedElementUpdated })
    }

    return (
      <li key={element.id} className="process-info-decision">
        <h4>{elementTitle}</h4>
        {elementDescription ? (
          <p className="process-info-decision__description">{elementDescription}</p>
        ) : null}
        <DefinitionList fields={elementFields} />
      </li>
    )
  })

  const decisionDescription = decisionElements.length
    ? `This process model includes ${
        decisionElements.length === 1
          ? "one decision element"
          : `${decisionElements.length} decision elements`
      } that guide the pre-screening review.`
    : null

  return (
    <>
      <section className="process-info-section">
        <h3>{processTitle}</h3>
        <p className="process-info-section__description">{processDescription}</p>
        <DefinitionList fields={processFields} />
      </section>
      {legalStructureSection}
      <section className="process-info-section">
        <h3>Decision elements</h3>
        {decisionDescription ? (
          <p className="process-info-section__description">{decisionDescription}</p>
        ) : (
          <p className="process-info-section__empty">
            No decision elements are linked to this process model.
          </p>
        )}
        {decisionElements.length ? (
          <ul className="process-info-decision-list">{decisionItems}</ul>
        ) : null}
      </section>
    </>
  )
}
