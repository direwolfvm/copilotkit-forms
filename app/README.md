# HelpPermitMe application guide

This directory contains the React 19/Vite 7 single-page application and the Express production
server for HelpPermitMe. For the product overview and repository map, start with the
[root README](../README.md).

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- A modern browser
- Optional Supabase and external-system credentials for connected workflows

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

The Vite development server normally uses `http://localhost:5173`. It includes development
middleware for the geospatial and Section 106 routes. Canonical Supabase persistence, Copilot/ADK
proxies, runtime injection, and NEPA MCP routes require the Express server described under
[Production server](#production-server). The browser application still loads when optional
services are not configured, but dependent operations show an error or warning.

To expose Vite from a container or remote development environment:

```bash
npm run dev -- --host 0.0.0.0 --port 4173 --clearScreen false
```

Restart the development server after changing `.env`.

## Environment variables

### Core portal and Copilot runtime

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_COPILOTKIT_RUNTIME_URL` | For the default Copilot mode | Browser-facing runtime URL. The recommended value is the same-origin `/api/copilotkit-runtime`. |
| `COPILOTKIT_RUNTIME_PROXY_BASE_URL` | When using the same-origin runtime proxy | Server-side target for `/api/copilotkit-runtime`. |
| `COPILOTKIT_RUNTIME_URL` | No | Runtime alias exposed through `/env.js` when the Vite-prefixed value is absent. |
| `COPILOTKIT_CUSTOM_ADK_URL` | No | Target for the Permitting ADK proxy. Defaults to the configured demonstration service. |
| `NEPA_MCP_WEB_BASE_URL` | No | Target used for project-aware NEPA questions and generated environmental maps. |
| `VITE_SUPABASE_URL` | For persistence | Canonical portal Supabase URL. |
| `VITE_SUPABASE_ANON_KEY` | For persistence | Canonical portal Supabase anon/public key. |
| `SUPABASE_TENANT_ID` | Recommended | Tenant UUID added to portal writes and filters. |

The server also recognizes `NEXT_PUBLIC_SUPABASE_*` and unprefixed `SUPABASE_URL` /
`SUPABASE_ANON_KEY` aliases. Tenant aliases include `VITE_SUPABASE_TENANT_ID` and
`NEXT_PUBLIC_SUPABASE_TENANT_ID`.

The browser uses `/api/supabase` for canonical portal traffic. The server supplies the anon key
upstream and emits resolved runtime configuration from `/env.js`. An anon key is not a server
secret: enforce database access with Row Level Security and never substitute a service-role key.

### PermitFast and ReviewWorks

| Variable | Purpose |
| --- | --- |
| `PERMITFLOW_SUPABASE_URL` | PermitFast Supabase URL |
| `PERMITFLOW_SUPABASE_ANON_KEY` | PermitFast anon key |
| `PERMITFLOW_TENANT_ID` | Tenant UUID required for PermitFast reads and writes |
| `REVIEWWORKS_SUPABASE_URL` | ReviewWorks Supabase URL |
| `REVIEWWORKS_SUPABASE_ANON_KEY` | ReviewWorks anon key |
| `REVIEWWORKS_TENANT_ID` | Tenant UUID required for ReviewWorks reads and writes |

`VITE_` and `NEXT_PUBLIC_` forms are also resolved by the production server. These integrations
authenticate the demonstration user directly with each Supabase Auth endpoint before creating or
updating an application.

### Section 106 and geospatial services

| Variable | Required | Purpose |
| --- | --- | --- |
| `SECTION106_EXCHANGE_API_KEY` | For Section 106 | Server-only exchange key for the demonstration Case Manager |
| `SECTION106_EXCHANGE_URL` | No | Exchange base URL; defaults to the deployed demo service |
| `IPAC_CONTACT_EMAIL` | No | Identification header sent to IPaC |
| `IPAC_ORGANIZATION` | No | Organization identification header sent to IPaC |
| `IPAC_PROJECT` | No | Project identification header sent to IPaC |
| `PORT` | No | Express port; defaults to `8080` |

Keep `SECTION106_EXCHANGE_API_KEY` server-side. Although legacy `VITE_` and `NEXT_PUBLIC_` aliases
are accepted for compatibility, do not use them in a frontend build.

## Application areas

The primary routes are:

| Route | Area |
| --- | --- |
| `/` and `/about` | Product introduction, guided tour, standards alignment, and limitations |
| `/portal/new` and `/portal/:projectId` | Create or edit a project and run pre-screening |
| `/projects` | Project/process tree, linked workflows, and coordinated deletion |
| `/dashboard/project-explorer` | Filterable project explorer |
| `/dashboard/project-explorer/:projectId` | Project summary, location, processes, case events, and documents |
| `/dashboard/analytics` | Pre-screening, Right of Way Authorization, and Complex Review metrics |
| `/resources/geospatial-screening` | Standalone geometry screening and Copilot interpretation |
| `/resources/permit-authorization-inventory` | Searchable permit and authorization inventory |
| `/resources/shared-services` | Shared permitting technology and service catalog |
| `/resources/nepa-compliance` | Agency-specific NEPA procedure reference |
| `/permits/basic` | PermitFast Right of Way Authorization / SF-299 workflow |
| `/permits/ipac-consultation` | IPaC ESA consultation handoff and shadow status |
| `/reviews/complex` | ReviewWorks Complex Environmental Review workflow |
| `/reviews/section-106` | Demonstration Section 106 Case Manager workflow |
| `/developer-tools` | Supabase and Copilot integration examples |
| `/settings` | Runtime selection, themes, and maintenance controls |

Legacy `/analytics` and `/resource-check` routes redirect to their current locations.

See [the user guide](docs/user-guide.md) for the complete workflow and
[the architecture guide](docs/architecture.md) for service boundaries.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite with hot module replacement |
| `npm run build` | Run TypeScript project builds and produce `dist/` |
| `npm start` | Serve `dist/` with the Express server |
| `npm run preview` | Preview `dist/` through Vite |
| `npm run lint` | Run ESLint |
| `npm run check:style-tokens` | Check for disallowed style literals |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run unit tests once |
| `npm run test:bench` | Run Vitest benchmarks |
| `npm run test:e2e` | Run Playwright against the production server |
| `npm run sync:env:gcloud` | Populate supported `.env` values from Google Cloud |

Recommended local verification:

```bash
npm run lint
npm run check:style-tokens
npm run test:run
npm run build
```

The Playwright suite requires a completed production build and `app/.env`. It starts
`server.mjs` on port `4310` and performs real writes and cleanup against the configured systems.
Use test or demo tenants, never production.

## Production server

Build before starting the server:

```bash
npm run build
node --env-file=.env server.mjs
```

Use `npm start` instead when the environment variables are already exported by the shell or hosting
platform.

`server.mjs`:

- serves the Vite bundle and supports client-side deep links;
- emits runtime configuration at `/env.js`;
- proxies canonical Supabase requests;
- proxies the default Copilot runtime and custom Permitting ADK runtime;
- bridges project-aware NEPA queries and environmental-map files;
- proxies NEPA Assist and IPaC requests; and
- keeps the Section 106 exchange key on the server.

JSON request bodies are limited to 1 MB. Supporting-document and PermitFast file uploads use their
respective Supabase Storage APIs rather than these JSON routes.

## Database and storage

Use [the database setup guide](../database-schema/README.md). The portal expects:

- the PIC-derived public tables;
- the seeded pre-screening process model and decision elements;
- tenant columns and a valid tenant UUID when tenant scoping is enabled; and
- a `permit-documents` storage bucket for generated reports and supporting files.

Supported portal document formats are PDF, DOCX, JPG/JPEG, and PNG. GIS upload supports KML, KMZ,
and GeoJSON.

## Troubleshooting

- **The app loads but data pages fail:** configure the canonical Supabase URL, anon key, and tenant
  ID, then restart the server.
- **Copilot shows a runtime warning:** set `VITE_COPILOTKIT_RUNTIME_URL` (normally
  `/api/copilotkit-runtime`) and ensure its upstream target is reachable.
- **PermitFast or ReviewWorks cannot load process data:** all three URL, anon-key, and tenant values
  for that integration must refer to the same environment.
- **Section 106 says it is not configured:** set `SECTION106_EXCHANGE_API_KEY` on the server.
- **Deep links return a build error:** run `npm run build` before `npm start`.
- **A previous install fails after a Node upgrade:** remove `node_modules`, run `npm install`, and
  retain the committed lockfile unless intentionally updating dependencies.

## Security notes

This demo does not provide production-grade authentication, authorization, or records management.
Before adapting it for real use, add and verify RLS policies, authenticated user boundaries,
server-side authorization, audit and retention controls, malware scanning for uploads, rate
limiting, secret management, accessibility testing, and operational monitoring.
