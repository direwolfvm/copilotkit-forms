# CopilotKit CEQ Project Form

This repository hosts a React application that demonstrates how CopilotKit can collaborate with a
react-jsonschema-form (RJSF) experience to help users capture the **Project** entity defined in the
Council on Environmental Quality (CEQ) permitting data standards.

The interactive form lives in [`app/`](app/) and pairs structured data entry with a Copilot sidebar
that can read the current form state, suggest updates, and apply changes directly through
CopilotKit actions.

## Getting started

> **Prerequisite:** Use Node.js 18 or newer. The refreshed Vite, ESLint, and TypeScript toolchain
> relies on modern Node features and will refuse to install under older runtimes.

```bash
cd app
npm install
cp .env.example .env            # add your CopilotKit key and Supabase credentials
npm run lint                    # optional but recommended to confirm a clean install
npm run build                   # validates the type checker before starting dev mode
npm run dev
```

The dev server prints a URL (defaults to `http://localhost:5173`). If you are running in a remote
container or Codespace, append Vite flags so the preview is reachable from your browser:

```bash
npm run dev -- --host 0.0.0.0 --port 4173 --clearScreen false
```

No Copilot API key is required to test the UI—the sidebar simply displays an in-app warning instead
of streaming AI responses. Supabase credentials are required if you want to exercise the persistence
APIs that save projects back to the hosted database.

### Supabase configuration

The application can persist project snapshots, geospatial results, and permitting checklist details
to Supabase when the following environment variables are present in `.env`:

- `VITE_SUPABASE_URL` – the base URL of your Supabase project
- `VITE_SUPABASE_ANON_KEY` – the project's anonymous public key

For teams already using Next.js conventions, `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are also accepted. The Express server in `app/server.mjs` resolves
these variables (as well as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_PUBLIC_ANON_KEY`) and
exposes a `/api/supabase` proxy so the browser never stores the raw credentials. When the variables
are absent, Supabase-dependent UI features will surface descriptive errors explaining that
credentials need to be configured.

If `npm run dev` fails after upgrading dependencies, clear any cached artifacts and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

## What’s included

- A CEQ Project entity schema expressed with RJSF, including helper text for each field
- A responsive layout with a live project summary panel
- CopilotKit actions that let the AI assistant populate or reset form fields on your behalf

Refer to [`app/README.md`](app/README.md) for a detailed feature breakdown and configuration
options.

## Deploying to Google Cloud Run with Docker

The static assets served by `server.mjs` must be built before the Express server starts. When the
app is pushed to a bare Node runtime without that build step, requests return `404` because the
`dist/` directory does not exist. Packaging the project as a container guarantees the build happens
exactly once during the image build and results in a repeatable deployment artifact that works the
same locally and on Google Cloud.

### 1. Build and test the container locally

```bash
# From the repository root
docker build -t copilotkit-forms .
docker run --rm -p 8080:8080 --env-file app/.env copilotkit-forms
```

Then open http://localhost:8080 to verify the production bundle loads correctly. If you do not have
Copilot credentials, omit the `--env-file` flag and the UI will render with a warning banner.

### 2. Submit the image to Google Cloud Build

```bash
gcloud config set project <YOUR_PROJECT_ID>
gcloud builds submit --tag gcr.io/<YOUR_PROJECT_ID>/copilotkit-forms
```

This command runs the same Dockerfile in Google Cloud Build and pushes the resulting image to your
project's Artifact Registry (or Container Registry, depending on your account settings).

### 3. Deploy the container to Cloud Run

```bash
gcloud run deploy copilotkit-forms \
  --image gcr.io/<YOUR_PROJECT_ID>/copilotkit-forms \
  --platform managed \
  --region <REGION> \
  --allow-unauthenticated \
  --set-env-vars VITE_COPILOTKIT_PUBLIC_API_KEY=<YOUR_PUBLIC_KEY>,\\
VITE_SUPABASE_URL=<YOUR_SUPABASE_URL>,\\
VITE_SUPABASE_ANON_KEY=<YOUR_SUPABASE_ANON_KEY>
```

Cloud Run automatically provisions HTTPS for the service URL. Additional environment variables can
be configured with repeated `--set-env-vars` flags (for example, `VITE_COPILOTKIT_RUNTIME_URL`).

The production server injects these environment variables into a lightweight `/env.js` endpoint at
startup. This means the CopilotKit public API key can be sourced from Google Secret Manager (or any
other runtime configuration provider) without rebuilding the static assets. The frontend checks that
endpoint at load time and falls back to `.env` values during local development.

By relying on the container image, every deployment will bundle the compiled assets, avoiding the
missing-build `404` and making rollbacks or staging deployments straightforward.
