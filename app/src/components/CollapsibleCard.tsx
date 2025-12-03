import { useEffect, useId, useState } from "react"
import type { ReactNode } from "react"

export type CollapsibleCardStatusTone = "success" | "warning" | "danger"

export interface CollapsibleCardStatus {
  tone: CollapsibleCardStatusTone
  text: string
}

interface CollapsibleCardProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  defaultExpanded?: boolean
  headingLevel?: 2 | 3 | 4
  ariaLabel?: string
  dataAttributes?: Record<string, string | number | boolean | undefined>
  onToggle?: (isOpen: boolean) => void
  status?: CollapsibleCardStatus
}

export function CollapsibleCard({
  title,
  description,
  actions,
  children,
  className,
  defaultExpanded = false,
  headingLevel = 2,
  ariaLabel = title,
  dataAttributes,
  onToggle,
  status
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded)
  const contentId = useId()

  const HeadingTag = `h${headingLevel}` as const

  const handleToggle = () => {
    setIsOpen((previous) => !previous)
  }

  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  const classNames = ["collapsible-card", className, isOpen ? undefined : "collapsible-card--collapsed"]
    .filter(Boolean)
    .join(" ")

  const hasHeaderActions = Boolean(status || actions)

  return (
    <section className={classNames} aria-label={ariaLabel} {...(dataAttributes ?? {})}>
      <div className="collapsible-card__header">
        <div className="collapsible-card__title-wrapper">
          <button
            type="button"
            className="collapsible-card__toggle"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={handleToggle}
          >
            <span className="visually-hidden">{isOpen ? "Collapse" : "Expand"} {title}</span>
            <span aria-hidden="true" className="collapsible-card__toggle-icon">
              {isOpen ? "−" : "+"}
            </span>
          </button>
          <div className="collapsible-card__title-group">
            <HeadingTag>{title}</HeadingTag>
            {description ? <p className="collapsible-card__description">{description}</p> : null}
          </div>
        </div>
        {hasHeaderActions ? (
          <div className="collapsible-card__header-actions">
            {status ? (
              <div
                className={`collapsible-card__status collapsible-card__status--${status.tone}`}
                aria-live="polite"
              >
                <span className="collapsible-card__status-indicator" aria-hidden="true" />
                <span className="collapsible-card__status-text">{status.text}</span>
              </div>
            ) : null}
            {actions ? <div className="collapsible-card__actions">{actions}</div> : null}
          </div>
        ) : null}
      </div>
      <div
        className={`collapsible-card__content${isOpen ? "" : " collapsible-card__content--collapsed"}`}
        id={contentId}
        hidden={!isOpen}
        aria-hidden={!isOpen}
      >
        {children}
      </div>
    </section>
  )
}
