# Theme Token Transition Learnings (Agent Guide)

This document captures a practical rollout pattern for migrating an existing app to a token-driven theme system in two phases.

## Goal

Move styling to a stable token architecture first, then change visual values safely.

## Phase 1: Migrate Architecture (No Visual Change Required)

Objective: standardize how styles are referenced without forcing an immediate redesign.

### Scope

- Map existing style literals to semantic tokens.
- Introduce token layers:
  - Primitive tokens (raw colors/spacing/radius/shadows)
  - Semantic tokens (surface, text, border, accent, etc.)
- Replace direct literals in component/page styles with semantic tokens.
- Keep current look as close as possible to baseline to reduce risk.

### USDWS implementation notes

- Keep USDWS component classes and structure intact.
- Introduce your app-level token file and map tokens to USDWS-compatible usage points.
- If overriding USDWS variables, do so in one centralized stylesheet to avoid drift.

### Tailwind implementation notes

- Move theme values into `tailwind.config` (or CSS variable-backed theme extension).
- Prefer semantic utility aliases over hard-coded palette classes in components.
- Add lint/guardrail checks that prevent introducing new raw literals in app styles.

### Exit criteria

- No net visual regression (or only intentional, documented deltas).
- Components/pages consume semantic tokens rather than ad hoc literals.
- Build/test/lint pass.

## Phase 2: Update Token Values (Apply New Theme)

Objective: switch visual language by changing token values, not component code.

### Scope

- Update token values for new theme palette/typography/elevation.
- Support browser `prefers-color-scheme` for light/dark where appropriate.
- Validate contrast and readability for critical UI states:
  - default, hover, focus, disabled, error, success.

### Recommended strategy

- Keep semantic token names stable.
- Change primitives and semantic mappings in token files only.
- Avoid page-by-page visual rewrites unless a specific component needs exceptions.

### Exit criteria

- Theme changes are visible through token updates alone.
- No component-level hard-coded color regressions.
- Core workflows are validated in desktop/mobile and light/dark contexts.

## Selector Switch (New vs Legacy)

Add a theme selector to let users choose between legacy and new visual tokens during transition.

### Behavior

- Persist selection in `localStorage` (e.g., `design-theme`).
- Apply a root attribute (e.g., `data-design-theme="old|new"`).
- Default recommendation during migration:
  - Set `legacy` as default first if rollout risk is high.
  - Move default to `new` when validated.

### CSS structure

- Base token set (default theme).
- `@media (prefers-color-scheme: dark)` overrides for dark mode.
- `[data-design-theme="old"]` override block for legacy values.
- Keep override precedence explicit so selected theme wins consistently.

## Placement Recommendation

Place the selector in **User Profile** settings if one exists.

- Preferred location: profile/preferences area where users expect personalization controls.
- Fallback location: global Settings page if no profile surface exists yet.
- Label recommendation:
  - Section: `Visual theme`
  - Toggle: `Legacy theme`
  - Help text: explain legacy vs new appearance and that preference is saved.

## Implementation Checklist (Agent)

1. Inventory style literals and token usage gaps.
2. Land Phase 1 refactor with minimal visual change.
3. Add guardrails (lint/script) to prevent new literals.
4. Add selector switch plumbing (`context/state + localStorage + root data attribute`).
5. Land Phase 2 token value updates.
6. Verify in local runtime and Docker image build.
7. Confirm browser cache is not masking new bundles.
8. Commit with clear separation:
   - architecture commits
   - token-value/theme commits
   - UX toggle commits

## Common Pitfalls

- Assuming architecture migration should visibly change the UI in Phase 1.
- Token overrides not applying due to CSS order/specificity.
- Testing the wrong local port/container and misreading results.
- Browser cache showing stale JS/CSS bundles after rebuild.

