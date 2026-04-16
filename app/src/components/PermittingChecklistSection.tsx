import { type FormEvent, type ReactNode, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { CollapsibleCard, type CollapsibleCardStatus } from "./CollapsibleCard"
import { isAutoPopulatedChecklistItem } from "../utils/projectStatus"
import { findPermitByLabel, getPermitById, getPermitOptions } from "../utils/permitInventory"

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

export type ManualChecklistItemInput = {
  label: string
  permitId?: string
}

type PermittingChecklistSectionProps = {
  title?: string
  description?: string
  actions?: ReactNode
  items: PermittingChecklistItem[]
  onAddItem: (item: ManualChecklistItemInput) => void
  onToggleItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onBulkAddFromSeed: (labels: string[]) => void
  hasBasicPermit: boolean
  onAddBasicPermit: () => void
}

export function PermittingChecklistSection({
  title = "Permitting Checklist",
  description = "Track anticipated permits and authorizations alongside the project form. Use the Copilot to suggest items based on project scope, or add your own below.",
  actions,
  items,
  onAddItem,
  onToggleItem,
  onRemoveItem,
  onBulkAddFromSeed,
  hasBasicPermit,
  onAddBasicPermit
}: PermittingChecklistSectionProps) {
  const [draftLabel, setDraftLabel] = useState("")
  const [selectedPermitId, setSelectedPermitId] = useState<string | undefined>()
  const permitOptions = useMemo(() => getPermitOptions(), [])

  const manualItems = useMemo(() => items.filter((item) => !isAutoPopulatedChecklistItem(item)), [items])
  const pendingCount = useMemo(() => manualItems.filter((item) => !item.completed).length, [manualItems])
  const selectedPermit = useMemo(
    () => (selectedPermitId ? getPermitById(selectedPermitId) : undefined),
    [selectedPermitId]
  )
  const matchingPermits = useMemo(() => {
    const query = draftLabel.trim().toLowerCase()
    if (query.length < 2) {
      return [] as Array<{ id: string; name: string; agency: string }>
    }

    return permitOptions
      .filter((permit) => {
        const haystack = `${permit.name} ${permit.agency}`.toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query)
        const bStarts = b.name.toLowerCase().startsWith(query)
        if (aStarts !== bStarts) {
          return aStarts ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      .slice(0, 6)
  }, [draftLabel, permitOptions])

  const status: CollapsibleCardStatus = useMemo(() => {
    if (!manualItems.length) {
      return { tone: "danger", text: "No checklist items yet" }
    }

    if (pendingCount > 0) {
      return { tone: "success", text: `${pendingCount} of ${manualItems.length} pending` }
    }

    return { tone: "success", text: "Checklist complete" }
  }, [manualItems.length, pendingCount])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = draftLabel.trim()
    if (!trimmed) {
      return
    }
    const matchedPermit = selectedPermitId ? getPermitById(selectedPermitId) : findPermitByLabel(trimmed)
    onAddItem({ label: trimmed, permitId: matchedPermit?.id })
    setDraftLabel("")
    setSelectedPermitId(undefined)
  }

  const handleSelectPermit = (permitId: string) => {
    const permit = getPermitById(permitId)
    if (!permit) {
      return
    }
    setSelectedPermitId(permit.id)
    setDraftLabel(permit.name)
  }

  return (
    <CollapsibleCard
      className="checklist-panel"
      title={title}
      description={description}
      actions={actions}
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
          list="permitting-checklist-suggestions"
        />
        <datalist id="permitting-checklist-suggestions">
          {matchingPermits.map((permit) => (
            <option key={permit.id} value={permit.name}>
              {permit.agency}
            </option>
          ))}
        </datalist>
        <button type="submit" className="primary">
          Add item
        </button>
      </form>
      {selectedPermit ? (
        <div className="checklist-panel__match">
          <p>
            Inventory match: <strong>{selectedPermit.name}</strong>
          </p>
          <button type="button" className="secondary" onClick={() => setSelectedPermitId(undefined)}>
            Use custom text instead
          </button>
        </div>
      ) : null}
      {matchingPermits.length > 0 ? (
        <div className="checklist-panel__suggestions" aria-label="Matching permits">
          {matchingPermits.map((permit) => (
            <button
              key={permit.id}
              type="button"
              className="checklist-panel__suggestion"
              onClick={() => handleSelectPermit(permit.id)}
            >
              <span>{permit.name}</span>
              <span>{permit.agency}</span>
            </button>
          ))}
        </div>
      ) : null}
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
