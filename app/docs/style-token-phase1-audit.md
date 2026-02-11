# Style Token Migration - Phase 1 Audit (CIO-aligned)

Date: 2026-02-11  
Scope: `/Users/jke/Github-local/copilotkit-forms/app/src/*.css`

## 1. Baseline inventory

### CSS footprint
- `app/src/App.css`: 4,105 lines
- `app/src/copilot-overrides.css`: 255 lines
- `app/src/DeveloperToolsPage.css`: 255 lines
- `app/src/AnalyticsPage.css`: 159 lines
- `app/src/index.css`: 67 lines
- Total: 4,841 lines

### Styling density (current)
- CSS custom property references (`var(--...)`):
  - `app/src/App.css`: 586
  - `app/src/copilot-overrides.css`: 85
  - `app/src/DeveloperToolsPage.css`: 49
  - `app/src/AnalyticsPage.css`: 27
  - `app/src/index.css`: 10
- `color-mix(...)` calls:
  - `app/src/App.css`: 237
  - `app/src/copilot-overrides.css`: 29
  - `app/src/DeveloperToolsPage.css`: 24
  - `app/src/AnalyticsPage.css`: 11
  - `app/src/index.css`: 1
- Hex color literals (`#...`):
  - `app/src/App.css`: 76
  - `app/src/index.css`: 15
  - `app/src/DeveloperToolsPage.css`: 13
  - `app/src/AnalyticsPage.css`: 1

### Current top token usage
- `--color-text` (109)
- `--surface` (95)
- `--border` (93)
- `--color-text-muted` (91)
- `--color-heading` (85)
- `--accent` (85)
- `--surface-muted` (62)
- `--accent-dark` (42)

## 2. Existing token definitions and gaps

Primary token definitions are centralized in `app/src/index.css` under `:root`, which is good for migration.

### Current root token families
- Brand palette: `--theme-navy-*`, `--theme-gold-300`
- Surfaces/text: `--background`, `--surface`, `--surface-muted`, `--color-text`, `--color-text-muted`, `--color-heading`, `--color-text-inverse`
- Interaction: `--accent`, `--accent-dark`, `--accent-contrast`
- UI effects: `--border`, `--border-strong`, `--shadow`, `--shadow-subtle`
- Layout/system: `--copilot-*`, `--layout-*`, `--site-*`

### Token gaps to close in migration
These tokens are referenced but not defined in local CSS files:
- `--card-background`
- `--color-primary`
- `--color-success`
- `--color-danger`

Impact:
- Inconsistent fallback behavior and hidden coupling to external styles or runtime context.
- Harder to guarantee deterministic theming across pages/components.

## 3. CIO-style target token architecture (proposed)

Adopt three layers:

1. Primitive tokens (raw values)
- `--color-navy-950`, `--color-navy-900`, ...
- `--color-gold-300`
- spacing/radius/shadow primitives

2. Semantic tokens (CIO-style naming)
- Core: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`
- Action/state: `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`
- Utility: `--border`, `--input`, `--ring`, `--destructive`
- Extended app semantics: `--success`, `--warning`, `--info`

3. Component tokens (only where needed)
- `--button-primary-bg`, `--button-primary-fg`, `--tag-policy-bg`, `--tag-policy-fg`, etc.
- CopilotKit bridge tokens should alias semantic tokens, not raw colors.

## 4. Current-to-target token mapping (phase-1 proposal)

| Current token | Proposed target token | Notes |
|---|---|---|
| `--surface` | `--card` | Main container/panel surface |
| `--surface-muted` | `--muted` | Secondary surface/background tint |
| `--color-text` | `--foreground` | Default body text |
| `--color-heading` | `--card-foreground` or `--foreground-strong` | Prefer semantic alias; avoid heading-only hardcode |
| `--color-text-muted` | `--muted-foreground` | Secondary text |
| `--accent` | `--primary` | Primary action color |
| `--accent-dark` | `--primary-strong` (extension) | Keep as extension if two-step brand ramp is needed |
| `--accent-contrast` | `--primary-foreground` | Text on primary action |
| `--background` | `--background` | Keep name but re-home under semantic layer |
| `--border` | `--border` | Keep |
| `--border-strong` | `--border-strong` (extension) | Optional semantic extension |
| `--callout-bg` | `--info-subtle` / component token | Convert to semantic state or component alias |
| `--theme-gold-300` | `--warning` or primitive only | Prefer semantic warning usage |
| `--color-danger` (undefined) | `--destructive` | Define globally and migrate references |
| `--color-success` (undefined) | `--success` | Define globally and migrate references |
| `--color-primary` (undefined) | `--primary` | Remove duplicate concept |
| `--card-background` (undefined) | `--card` | Normalize |

## 5. Hard-coded color hotspots to prioritize

Most frequent literals indicate where semantic state tokens should replace direct color use:
- `#b91c1c` (22 uses) -> `--destructive`
- `#15803d` (7 uses) -> `--success`
- `#b50909` (5 uses) -> usually error emphasis; map to destructive scale
- `#d97706` (3 uses) -> `--warning`
- `#0f7b4a` / `#0f7d43` -> success tone variants; consolidate

## 6. Migration backlog for phase 2 (ordered)

1. Token foundation
- Add `app/src/styles/tokens.css` with primitive + semantic layers.
- Keep temporary aliases for backward compatibility (`--color-text` -> `--foreground`, etc.).

2. Risk removal
- Define currently missing tokens (`--destructive`, `--success`, `--primary`, `--card`).
- Replace undefined token references in `app/src/App.css` first.

3. Hotspot migration
- Refactor `app/src/App.css` (highest impact): remove direct error/success/warning hex usage.
- Refactor `app/src/copilot-overrides.css` to semantic aliases.

4. Consistency enforcement
- Add style guardrail (lint/check) to block new raw hex values outside token files.

## 7. Acceptance criteria for end of phase 2

- Zero unresolved token references (no undefined `var(--...)`).
- No new raw color literals outside token definition files.
- Primary pages render with unchanged behavior and visually comparable output.
- CopilotKit and USWDS classes continue to function.

## 8. Open decisions (needed before implementation)

- Value strategy: exact CIO token values vs CIO naming with current brand palette.
- Dark mode scope: include in phase 2 now or defer to phase 3.
- Semantic extension policy: whether to standardize custom tokens like `--primary-strong` and `--border-strong`.
