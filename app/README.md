# CopilotKit + RJSF CEQ Project Form

This React + Vite application showcases how CopilotKit can collaborate with a
[react-jsonschema-form](https://rjsf-team.github.io/react-jsonschema-form/) (RJSF) experience to help
users capture the **Project** entity from the [CEQ permitting data standard](https://permitting.innovation.gov/resources/data-standard/entity-description/).

The Copilot sidebar understands the form schema, can suggest values, and applies updates directly to
the underlying JSON data through CopilotKit actions.

## Quick start

> **Prerequisite:** Install Node.js 18 or newer to satisfy the updated Vite, ESLint, and TypeScript
> requirements.

```bash
npm install
cp .env.example .env   # add your CopilotKit key and Supabase credentials
npm run lint           # ensure the workspace installs cleanly
npm run build          # confirm the type checker passes before starting dev mode
npm run dev
```

Open the URL printed in the console (defaults to `http://localhost:5173`). Without a CopilotKit
public API key the application will still load, but the sidebar will display a warning instead of
producing AI responses. For remote containers or Codespaces run `npm run dev -- --host 0.0.0.0 \
  --port 4173 --clearScreen false` so the preview is reachable from your browser.

### Environment variables

Create a `.env` file (there is a starter `.env.example`) with the following values:

- `VITE_COPILOTKIT_PUBLIC_API_KEY` – required for hosted CopilotKit conversations. Obtain a key from
  [Copilot Cloud](https://cloud.copilotkit.ai/).
- `VITE_COPILOTKIT_RUNTIME_URL` – optional URL for a self-hosted Copilot Runtime. Leave unset to use
  the default Copilot Cloud runtime.
- `VITE_SUPABASE_URL` – the URL of your Supabase project. Required to enable project persistence
  and checklist storage from the form.
- `VITE_SUPABASE_ANON_KEY` – the anonymous public key for your Supabase project.

The development server also honors `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
their non-Vite counterparts (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLIC_ANON_KEY`) so you
can reuse existing environment files. Regardless of which variables are present, the Express server
proxies Supabase requests through `/api/supabase` and injects the resolved credentials so the browser
never stores the raw keys.

Restart `npm run dev` after editing environment variables.

When the production server (defined in [`server.mjs`](server.mjs)) starts it exposes the resolved
environment values through `/env.js`. This allows platforms such as Google Cloud Run or Cloud Run's
Secret Manager integration to provide the Copilot API key at runtime without rebuilding the static
bundle. The client automatically reads from that endpoint and falls back to the `.env` file when it
is available.

### Troubleshooting local installs

- Delete `node_modules/` and `package-lock.json` if you previously installed dependencies with an
  older Node version, then run `npm install` again.
- Run `npm run lint` to verify the refreshed ESLint config loads, and `npm run build` to catch any
  type errors introduced by local edits before starting the dev server.

## Features

- **CEQ Project entity schema** – The schema in [`src/schema/projectSchema.ts`](src/schema/projectSchema.ts)
  maps each Project attribute into an RJSF-friendly JSON Schema with helper text, placeholders, and
  UI hints for long-form inputs, coordinates, and GeoJSON fields.
- **Live project summary** – The sidebar component in [`src/components/ProjectSummary.tsx`](src/components/ProjectSummary.tsx)
  renders a running narrative, agency details, and a copy-ready snapshot while the form is being
  edited.
- **Copilot collaboration** – The main view (`src/App.tsx`) registers CopilotKit readable context and
  two actions:
  - `updateProjectForm` lets the AI assistant populate structured fields directly, handling type
    coercion for numeric coordinates and nested sponsor contact details.
  - `resetProjectForm` clears the data back to a blank template using `createEmptyProjectData()`.
- **Runtime selection controls** – The Settings page renders
  [`RuntimeSelectionControl`](src/components/RuntimeSelectionControl.tsx), allowing you to switch
  CopilotKit sessions between the hosted Copilot Cloud and the local Permitting ADK proxy at
  `/api/custom-adk/agent`.
- **Context sharing** – `useCopilotReadable` exposes both the structured JSON payload and a
  human-readable summary so the Copilot can reason about the current project state.

## Development scripts

- `npm run dev` – start the Vite dev server with HMR.
- `npm run build` – type-check and produce a production build.
- `npm run preview` – preview the production build locally.
- `npm test` – run the Vitest suite in watch mode (append `-- --run` to exit after a single pass).
- `npm run test:run` – run the Vitest suite once in CI-friendly mode.

## Testing

Unit tests exercise core UI components and the geospatial helpers that prepare Resource Check payloads
for NEPA Assist/IPaC as well as the Copilot summary builders. Run them from the root of this Vite app:

```bash
npm test -- --run
```

## Customization tips

- Extend the schema in [`projectSchema.ts`](src/schema/projectSchema.ts) to add additional CEQ
  fields or tweak descriptions. The Copilot instructions automatically reflect any changes because
  they are generated from the same field metadata.
- Update `ProjectSummary` to highlight the project details that matter most to your workflow.
- For production deployments, configure authentication or guardrails on your CopilotKit runtime.
