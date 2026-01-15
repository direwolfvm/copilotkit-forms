import { type FormEvent, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { CollapsibleCard, type CollapsibleCardStatus } from "./CollapsibleCard"

export type PermittingChecklistItem = {
  id: string
  label: string
  completed: boolean
  source?: "manual" | "copilot" | "seed"
  notes?: string
  link?: {
    href: string
    label: string
  }
}

type PermittingChecklistSectionProps = {
  items: PermittingChecklistItem[]
  onAddItem: (label: string) => void
  onToggleItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onBulkAddFromSeed: (labels: string[]) => void
  hasBasicPermit: boolean
  onAddBasicPermit: () => void
}

export function PermittingChecklistSection({
  items,
  onAddItem,
  onToggleItem,
  onRemoveItem,
  onBulkAddFromSeed,
  hasBasicPermit,
  onAddBasicPermit
}: PermittingChecklistSectionProps) {
  const [draftLabel, setDraftLabel] = useState("")

  const pendingCount = useMemo(() => items.filter((item) => !item.completed).length, [items])

  const status: CollapsibleCardStatus = useMemo(() => {
    if (!items.length) {
      return { tone: "danger", text: "No checklist items yet" }
    }

    if (pendingCount > 0) {
      return { tone: "success", text: `${pendingCount} of ${items.length} pending` }
    }

    return { tone: "success", text: "Checklist complete" }
  }, [items.length, pendingCount])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = draftLabel.trim()
    if (!trimmed) {
      return
    }
    onAddItem(trimmed)
    setDraftLabel("")
  }

  return (
    <CollapsibleCard
      className="checklist-panel"
      title="Permitting checklist"
      description="Track anticipated permits and authorizations alongside the project form. Use the Copilot to suggest items based on project scope, or add your own below."
      status={status}
      dataAttributes={{
        "data-tour-id": "portal-checklist",
        "data-tour-title": "Track permits",
        "data-tour-intro":
          "Use this checklist to capture likely permits. Ask the Copilot to suggest items and it can add them directly here."
      }}
    >
      <form className="checklist-panel__form" onSubmit={handleSubmit}>
        <label htmlFor="permitting-checklist-input" className="visually-hidden">
          Add permitting checklist item
        </label>
        <input
          id="permitting-checklist-input"
          type="text"
          placeholder="Add permit or authorization"
          value={draftLabel}
          onChange={(event) => setDraftLabel(event.target.value)}
        />
        <button type="submit" className="primary">
          Add item
        </button>
      </form>
      {!hasBasicPermit ? (
        <div className="checklist-panel__basic-permit">
          <p>Need to track the Basic Permit workflow?</p>
          <button type="button" className="secondary" onClick={onAddBasicPermit}>
            Add Basic Permit item
          </button>
        </div>
      ) : null}

      <div className="checklist-panel__body">
        {items.length === 0 ? (
          <div className="checklist-panel__empty">
            <p>
              Try asking the Copilot: <em>“What permits will this project likely need?”</em>
            </p>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onBulkAddFromSeed([
                  "Clean Water Act Section 404 Permit",
                  "Endangered Species Act Section 7 Consultation",
                  "National Historic Preservation Act Section 106 Consultation"
                ])
              }
            >
              Start with common permits
            </button>
          </div>
        ) : (
          <ul className="checklist-panel__list">
            {items.map((item) => (
              <li key={item.id} className={item.completed ? "completed" : undefined}>
                <div className="checklist-panel__item">
                  <label>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => onToggleItem(item.id)}
                    />
                    <span>{item.label}</span>
                    {item.source === "copilot" ? <span className="badge">Copilot</span> : null}
                  </label>
                  {item.link ? (
                    <Link className="checklist-panel__link" to={item.link.href}>
                      {item.link.label}
                    </Link>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${item.label}`}
                  onClick={() => onRemoveItem(item.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleCard>
  )
}
