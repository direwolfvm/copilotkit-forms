export type ProcessStatusVariant = "complete" | "pending" | "caution"

export type StatusIndicatorProps = {
  variant: ProcessStatusVariant
  label: string
}

export function StatusIndicator({ variant, label }: StatusIndicatorProps) {
  return (
    <span className={`status-indicator status-indicator--${variant}`}>
      <span className="status-indicator__icon" aria-hidden="true">
        {variant === "complete" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" />
            <polyline points="7 12.5 10.5 16 17 9" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        {variant === "pending" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" />
            <path d="M12 7v5l3 3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        {variant === "caution" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 5 19 17H5z" fill="none" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 10v3.5" fill="none" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="1.2" stroke="none" />
          </svg>
        ) : null}
      </span>
      <span className="status-indicator__text">{label}</span>
    </span>
  )
}
