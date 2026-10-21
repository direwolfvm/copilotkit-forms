# HelpPermitMe

HelpPermitMe is an unofficial demonstration of a modern project intake, permitting, and
environmental-review platform. It combines a React portal, CEQ-aligned project data, geospatial
screening, Copilot-assisted workflows, and integrations with demonstration case-management
systems.

> **Demonstration only:** This is not a U.S. government website, is not affiliated with the Council
> on Environmental Quality (CEQ), and is not a system of record. Do not use it for official
> submissions or sensitive information.

## What the app demonstrates

- A guided project portal with CEQ-aligned structured data, location geometry, NEPA information,
  and a permitting checklist
- Copilot-assisted form updates, checklist suggestions, project-aware NEPA questions, resource
  screening, and analytics
- Map drawing and KML, KMZ, or GeoJSON upload, followed by NEPA Assist, IPaC, and environmental-map
  requests
- Supabase persistence for projects, process instances, decision payloads, case events, GIS data,
  reports, and supporting documents
- Tenant-aware exchange with PermitFast for Right of Way Authorization (SF-299) and ReviewWorks for
  Complex Environmental Review
- An IPaC ESA consultation handoff and a demonstration NHPA Section 106 case workflow
- Project trees, project-detail views, workflow analytics, permit and authorization reference
  data, NEPA agency guidance, and a shared-services directory
- PDF project reports, supporting-document uploads, guided tours, visual themes, and project
  cleanup tools

See [the user guide](app/docs/user-guide.md) for a page-by-page tour and
[the architecture guide](app/docs/architecture.md) for data flows and integration boundaries.

## Quick start

Prerequisites:

- Node.js `^20.19.0` or `>=22.12.0`
- npm
- Optional: a Supabase project and integration credentials for persistence and connected workflows

```bash
cd app
npm install
cp .env.example .env
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`. The public pages and static reference
content work without backend credentials. Features that save data, use Copilot, or call configured
external systems report a configuration error when their dependency is unavailable.

For a production-style local run with values loaded from `app/.env`:

```bash
cd app
npm run build
node --env-file=.env server.mjs
```

The Express server listens on `PORT` (default `8080`) and serves the built single-page application
plus the complete same-origin API proxy stack. `npm start` is equivalent when the environment has
already been exported by your shell or hosting platform.

## Configuration

Copy [`app/.env.example`](app/.env.example) to `app/.env`. The common local configuration is:

```dotenv
VITE_COPILOTKIT_RUNTIME_URL=/api/copilotkit-runtime
COPILOTKIT_RUNTIME_PROXY_BASE_URL=https://your-copilot-runtime.example/copilotkit

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_TENANT_ID=your-tenant-uuid
```

PermitFast, ReviewWorks, Section 106, IPaC identification headers, custom runtime targets, and
runtime aliases are documented in [the application guide](app/README.md#environment-variables).
Never commit `.env`, service-role keys, passwords, or Section 106 API keys.

To provision a fresh application database, follow
[`database-schema/README.md`](database-schema/README.md). The current setup uses the ordered,
tenant-aware scripts in `resources/`.

## Development and verification

Run commands from `app/`:

```bash
npm run lint
npm run check:style-tokens
npm run test:run
npm run build
```

Additional commands:

- `npm test` — run Vitest in watch mode
- `npm run test:bench` — run the schema benchmark
- `npm run preview` — preview the Vite production bundle
- `npm run test:e2e` — run the Playwright portal flow against the configured real backend
- `npm run sync:env:gcloud` — sync the script's supported environment variables from Google Cloud

The end-to-end test writes to the configured Supabase project and identifies its project as safe to
delete. Review [`app/playwright.config.ts`](app/playwright.config.ts) and use a non-production
environment.

## Repository map

| Path | Purpose |
| --- | --- |
| [`app/`](app/) | React/Vite frontend, Express production server, tests, and application docs |
| [`app/src/`](app/src/) | Pages, components, schemas, integration clients, and UI tests |
| [`app/server/`](app/server/) | Server-side geospatial and Section 106 proxy modules |
| [`resources/`](resources/) | Current ordered Supabase schema, seed, and tenant migration |
| [`database-schema/`](database-schema/) | Upstream PIC exports, legacy migration material, and API history |
| [`Dockerfile`](Dockerfile) | Multi-stage Node production image |
| [`manifest.yml`](manifest.yml) | Cloud Foundry deployment manifest |
| [`PERMITFAST_HANDOFF.md`](PERMITFAST_HANDOFF.md) | PermitFast SF-299 integration contract |
| [`PERMITFAST_HANDOFF_GEOSPATIAL.md`](PERMITFAST_HANDOFF_GEOSPATIAL.md) | PermitFast geospatial payload contract |
| [`SECTION106_HANDOFF.md`](SECTION106_HANDOFF.md) | Section 106 exchange integration notes |

## Deployment

**Live target: cloud.gov** (Node.js buildpack), cf app `helppermitme`, health check
`https://helppermitme.app.cloud.gov/api/health`. Releases are also published to
`jeccles-eop/help-permit-me` with the manual **Publish Clean Release** workflow.

Deploys run from a laptop with the guarded script, which is a dry run unless given `--apply`:

```bash
cf login -a api.fr.cloud.gov --sso
cf target -o <org> -s <space>
cd app
npm run deploy:cloud                                 # dry run: lists variable names only
npm run deploy:cloud -- --apply --env-file .env.cloudgov
```

The script builds `dist/`, runs `cf push --no-start` with [`manifest.yml`](manifest.yml), sets
runtime variables through the cloud.gov API so no value is printed or placed on the command line,
starts the app and checks `/api/health`. It refuses env files that contain service-role or secret
keys. `manifest.yml` holds only non-secret settings.

The [`Dockerfile`](Dockerfile) (Node 22, non-root) is kept for local container runs:

```bash
docker build -t helppermitme .
docker run --rm -p 8080:8080 --env-file app/.env helppermitme
```

Runtime configuration is emitted by `/env.js`, so server environment changes do not require
rebuilding the frontend. Supabase anon keys are public client credentials and must be protected by
appropriate Row Level Security; service-role keys must never be exposed to this application.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pull requests and pushes to `main`
without secrets: lint, unit tests, build, production license check, CycloneDX SBOM (kept as a build
artifact), `npm audit --audit-level=high`, dependency review and a gitleaks scan. Dependabot opens
weekly grouped updates for npm, GitHub Actions and the Docker base image.

`@copilotkit/react-core` and `@copilotkit/react-ui` are pinned to exactly **1.79.1**, the version of
the shared CopilotKit runtime on cloud.gov (`copilotkit-runtime.app.cloud.gov`), recorded as
`copilotkit.runtime` in `app/package.json`. Clients that don't match the runtime lose the sidebar,
so upgrade the runtime image and every app that uses it together. The Playwright suite stays
manual because it writes to a real Supabase project.

## Documentation

- [Application setup and operations](app/README.md)
- [User guide](app/docs/user-guide.md)
- [Architecture and integrations](app/docs/architecture.md)
- [Database setup](database-schema/README.md)
- [Legacy external API guide](database-schema/API_INTEGRATION.md)

Historical handoff documents describe specific cross-system contracts. If a handoff document and
the general overview differ, treat the handoff document and the current implementation as the
source of truth for that integration.

## License

See [`LICENSE`](LICENSE).
