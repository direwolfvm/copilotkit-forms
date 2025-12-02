import { useId, useState } from "react"
import type { ReactNode } from "react"

interface CollapsibleCardProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  defaultExpanded?: boolean
  headingLevel?: 2 | 3 | 4
  ariaLabel?: string
}

export function CollapsibleCard({
  title,
  description,
  actions,
  children,
  className,
  defaultExpanded = false,
  headingLevel = 2,
  ariaLabel = title
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded)
  const contentId = useId()

  const HeadingTag = `h${headingLevel}` as const

  const handleToggle = () => {
    setIsOpen((previous) => !previous)
  }

  const classNames = ["collapsible-card", className, isOpen ? undefined : "collapsible-card--collapsed"]
    .filter(Boolean)
    .join(" ")

  return (
    <section className={classNames} aria-label={ariaLabel}>
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
        {actions ? <div className="collapsible-card__header-actions">{actions}</div> : null}
      </div>
      {isOpen ? (
        <div className="collapsible-card__content" id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
