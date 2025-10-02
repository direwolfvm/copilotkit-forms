import { FormEvent, useMemo, useState } from "react"

export type PermittingChecklistItem = {
  id: string
  label: string
  completed: boolean
  source?: "manual" | "copilot" | "seed"
  notes?: string
}

type PermittingChecklistSectionProps = {
  items: PermittingChecklistItem[]
  onAddItem: (label: string) => void
  onToggleItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onBulkAddFromSeed: (labels: string[]) => void
}

export function PermittingChecklistSection({
  items,
  onAddItem,
  onToggleItem,
  onRemoveItem,
  onBulkAddFromSeed
}: PermittingChecklistSectionProps) {
  const [draftLabel, setDraftLabel] = useState("")

  const pendingCount = useMemo(() => items.filter((item) => !item.completed).length, [items])

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
    <section className="checklist-panel">
      <header className="checklist-panel__header">
        <div>
          <h2>Permitting checklist</h2>
          <p>
            Track anticipated permits and authorizations alongside the project form. Use the Copilot to
            suggest items based on project scope, or add your own below.
          </p>
        </div>
        <div className="checklist-panel__summary" aria-live="polite">
          {items.length ? (
            <span>
              {pendingCount} of {items.length} pending
            </span>
          ) : (
            <span>No checklist items yet</span>
          )}
        </div>
      </header>

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
                <label>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => onToggleItem(item.id)}
                  />
                  <span>{item.label}</span>
                  {item.source === "copilot" ? <span className="badge">Copilot</span> : null}
                </label>
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
    </section>
  )
}
