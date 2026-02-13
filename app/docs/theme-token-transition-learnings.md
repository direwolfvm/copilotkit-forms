# Theme Token Transition Runbook (LLM Agent)

This is an execution guide for an LLM agent to migrate an app to a token-first theme system with low regression risk.

Use two phases:

1. Phase 1: migrate architecture to semantic tokens (minimal visual change).
2. Phase 2: update token values to the new theme.

Include a user-facing selector to switch between `legacy` and `new` themes, and place it in User Profile settings when available.

---

## 1. Operating Rules for the Agent

- Do not mix architecture migration and visual redesign in one commit.
- Keep component markup stable during Phase 1.
- Prefer centralized token updates over per-component color edits.
- Maintain backward-compatible token aliases until migration is complete.
- Run validation after every milestone.

Branch naming recommendation:

- `codex/theme-token-phase1`
- `codex/theme-token-phase2`
- `codex/theme-token-toggle`

---

## 2. Repo-Specific Anchors (Current Project)

Use these files as the source of truth in this repo:

- Token definitions: `app/src/styles/tokens.css`
- Global styles: `app/src/App.css`, `app/src/index.css`
- Theme state/context: `app/src/designThemeContext.tsx`
- Theme toggle UI: `app/src/SettingsPage.tsx`
- Guardrail script: `app/scripts/check-style-literals.sh`
- NPM scripts: `app/package.json`

Validation commands:

- `npm run check:style-tokens`
- `npm run build`
- `npm run test:run` (if changed behavior intersects tested areas)

---

## 3. Phase 1: Architecture Migration (USDWS or Tailwind)

### Objective

Move from scattered color literals and ad hoc variables to semantic tokens, while preserving existing visuals as much as possible.

### Required outputs

- Centralized token file(s) with primitive + semantic layers.
- Style usage switched to semantic tokens.
- Guardrail to block new raw color literals outside token files.
- Build/lint/test passing.

### Step-by-step procedure

1. Baseline audit.
   - Inventory raw color literals and undefined token usage.
   - Example:
     - `rg -n "#[0-9a-fA-F]{3,8}|rgba?\\(" app/src/*.css`
     - `rg -n "var\\(--[a-zA-Z0-9-]+\\)" app/src/*.css`
2. Define token layers.
   - Primitive tokens: raw palette, shadows, alpha ramps.
   - Semantic tokens: `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--destructive`, etc.
3. Add compatibility aliases.
   - Keep old token names mapped to semantic tokens during migration.
4. Replace direct literals in styles.
   - Replace with semantic tokens first.
   - Avoid editing component logic unless required.
5. Add/enable guardrail.
   - Ensure raw literals outside token files fail checks.
   - In this repo, use `npm run check:style-tokens`.
6. Validate and commit.
   - Run: `npm run check:style-tokens && npm run build`.
   - Commit message example: `refactor styles to semantic token architecture`.

### USDWS-specific instructions

- Keep USDWS class structure and component markup unchanged.
- Map app semantics to USDWS-compatible variable usage points.
- Put USDWS overrides in one centralized token/override file.
- Do not fork per-component palette variants unless unavoidable.

### Tailwind-specific instructions

- Move color/system values into `tailwind.config` and/or CSS variables.
- Use semantic utility aliases (`bg-surface`, `text-foreground`, etc.).
- Remove hard-coded palette classes from component code where possible.
- Enforce no-raw-literals via lint/check scripts.

### Phase 1 acceptance criteria

- Semantic tokens are the primary style contract.
- Raw color literals exist only in token definition files.
- No meaningful visual regression beyond documented exceptions.
- Build and checks pass.

---

## 4. Phase 2: Token Value Migration (Apply New Theme)

### Objective

Change visual design by editing token values, not by rewriting component styles.

### Required outputs

- Updated token values for the new theme (light/dark as needed).
- Existing semantic token names unchanged.
- Contrast/accessibility review for key states.

### Step-by-step procedure

1. Freeze semantic names from Phase 1.
   - Do not rename semantic tokens during value migration.
2. Update values in token source(s) only.
   - In this repo: `app/src/styles/tokens.css`.
3. Add/verify dark-mode behavior.
   - Use `@media (prefers-color-scheme: dark)` where applicable.
4. Validate high-risk UI states.
   - Buttons, focus rings, links, alerts, disabled controls, table contrast.
5. Validate app flows.
   - Critical pages and forms in desktop and mobile widths.
6. Build and commit.
   - Run: `npm run check:style-tokens && npm run build`.
   - Commit message example: `update semantic token values for new theme`.

### Phase 2 acceptance criteria

- Theme change is driven by token values only.
- No new component-level hard-coded color regressions.
- Visual output is consistent across light/dark contexts.
- Build and checks pass.

---

## 5. Theme Selector Switch (Legacy vs New)

### Requirement

Implement a persisted theme picker so users can choose between multiple theme value sets during rollout.

### Placement

- Preferred: User Profile -> Preferences (if profile exists).
- Fallback: global Settings page.

### Behavior contract

- Storage key: `design-theme` (or equivalent stable key).
- Root attribute: `data-design-theme="<theme-id>"`.
- Persist selection in `localStorage`.
- Apply root attribute at initialization to avoid flash/mismatch.
- Default recommendation during risk-managed rollout: `legacy` (`old`).

Theme IDs recommendation (stable strings; don’t rename later):

- `old` (legacy)
- `new` (token-migrated baseline)
- `gold-marble` (new theme; see below)

### Implementation pattern (React example)

1. Create theme context/provider.
   - Expose `designTheme` and `setDesignTheme`.
2. Wrap app root with provider.
3. Add settings/profile picker (preferred UI: `<select>` or radio group).
   - Section label: `Visual theme`
   - Control label: `Theme`
   - Help text: describe the options and that the preference is saved.
4. Implement CSS precedence.
   - Base theme values.
   - Dark-mode overrides.
   - `[data-design-theme="<theme-id>"]` override blocks placed last so explicit user choice wins.

### Verification checks

- Picker updates live UI immediately.
- Refresh preserves selected theme.
- Dark-mode browser preference still works for non-legacy mode.
- Legacy mode reliably overrides dark-mode palette when selected.

### Add a New Theme: Gold + Marble (Token-Only)

Goal: introduce a third theme that is visually distinct, primarily gold-forward, with a white “marble-like” background texture, without rewriting component styles.

Implementation steps (repo-specific):

1. Extend the theme type and persistence.
   - File: `app/src/designThemeContext.tsx`
   - Change `DesignTheme` from `"new" | "old"` to `"new" | "old" | "gold-marble"`.
   - Update the storage read logic to recognize `"gold-marble"` explicitly (unknown values should fall back to default).
2. Update the picker UI.
   - File: `app/src/SettingsPage.tsx` (or User Profile preferences page if it exists)
   - Replace the binary switch with a picker control that sets:
     - `old` -> “Legacy”
     - `new` -> “New (token baseline)”
     - `gold-marble` -> “Gold + Marble”
3. Add token overrides.
   - File: `app/src/styles/tokens.css`
   - Add a new override block after the dark-mode block(s), similar to `:root[data-design-theme="old"]`:
     - `:root[data-design-theme="gold-marble"] { ... }`
   - Guidance for values:
     - Keep semantic tokens stable: `--background`, `--card`, `--foreground`, `--primary`, `--border`, etc.
     - Make `--primary` / `--accent` gold-forward.
     - Keep `--foreground` high-contrast (ink/near-black) for readability on light marble.
     - Prefer warm neutrals for `--muted` surfaces, not gray-blue.
4. Optional (recommended): add a background texture hook for “marble”.
   - Token-only color changes cannot produce a marble effect unless the app consumes a token for background image/texture.
   - If allowed to make a small CSS architecture change, add a single optional token and consume it globally:
     - Add token: `--background-texture` (default `none`).
     - Apply in a global rule (e.g., `app/src/index.css`):
       - `body { background-image: var(--background-texture); background-size: ...; }`
   - In `:root[data-design-theme="gold-marble"]`, set `--background-texture` to layered gradients that read as subtle marble veining.

Validation gates for adding `gold-marble`:

- `npm run check:style-tokens` must pass (no new raw literals outside `tokens.css`).
- `npm run build` must pass.
- Visual spot-check:
  - Buttons/links/focus rings are readable and meet contrast expectations.
  - Cards/surfaces look intentional on the textured background.
  - “Gold” is used as accent/primary, not as body text color.

---

## 6. Commit and PR Sequencing

Keep changes reviewable and isolated:

1. Phase 1 architecture commit(s)
   - token structure + aliasing + literal replacement + guardrail
2. Phase 2 value commit(s)
   - theme values and dark-mode adjustments
3. Selector UX commit(s)
   - context/provider + profile/settings toggle + persistence

Example commit messages:

- `refactor styles to semantic token architecture`
- `add token literal guardrail script`
- `update semantic token values for new visual theme`
- `add persisted legacy/new visual theme toggle`

---

## 7. Validation Matrix (Minimum)

Run technical checks:

- `npm run check:style-tokens`
- `npm run build`
- `npm run test:run` (if impacted)

Run visual checks:

- Home/dashboard/settings/profile pages
- Forms with validation states
- Tables/cards/modals
- Desktop + mobile viewport
- Browser light + dark preferences
- Legacy + new selector combinations

Run deployment checks:

- Local container launches correctly.
- Served JS/CSS bundle includes latest changes (no stale cache).
- If publishing image, verify Linux platforms:
  - `linux/amd64`
  - `linux/arm64`

---

## 8. Common Failure Modes and Fixes

- UI looks unchanged after migration.
  - Cause: only architecture changed (expected in Phase 1), or stale bundle.
  - Fix: confirm phase intent and clear browser cache/rebuild image.
- Toggle exists in code but not UI.
  - Cause: stale container or wrong port/app instance.
  - Fix: inspect served bundle and container routing.
- Theme selection not persisting.
  - Cause: storage key mismatch or provider not mounted at root.
  - Fix: verify initialization path and provider wiring.
- Legacy override not winning.
  - Cause: CSS order/specificity.
  - Fix: move `[data-design-theme="old"]` block after other overrides.

---

## 9. Agent Handoff Template

Use this in PR or task handoff:

- Scope completed:
  - Phase completed (`1`, `2`, or `toggle`)
  - Files touched
- Validation run:
  - Commands executed and result
- Behavior summary:
  - What changed visually vs architecturally
- Risks:
  - Known follow-ups or residual regressions
- Deployment:
  - Branch/commit
  - Docker image tag/digest (if published)
