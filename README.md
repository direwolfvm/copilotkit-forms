# CopilotKit CEQ Project Form

This repository hosts a React application that demonstrates how CopilotKit can collaborate with a
react-jsonschema-form (RJSF) experience to help users capture the **Project** entity defined in the
Council on Environmental Quality (CEQ) permitting data standards.

The interactive form lives in [`app/`](app/) and pairs structured data entry with a Copilot sidebar
that can read the current form state, suggest updates, and apply changes directly through
CopilotKit actions.

## Getting started

```bash
cd app
npm install
cp .env.example .env            # add your CopilotKit public API key
npm run dev
```

Then open the development server URL printed in the terminal. Without an API key the form will
still render, but the Copilot sidebar will show an in-app warning instead of live responses.

## What’s included

- A CEQ Project entity schema expressed with RJSF, including helper text for each field
- A responsive layout with a live project summary panel
- CopilotKit actions that let the AI assistant populate or reset form fields on your behalf

Refer to [`app/README.md`](app/README.md) for a detailed feature breakdown and configuration
options.

## Deploying to Google Cloud Run with Docker

The Dockerfile builds the Vite application during the image build and serves the compiled assets
with `vite preview`. Containerizing the project guarantees the `dist/` directory exists before the
server starts and results in a repeatable deployment artifact that behaves the same locally and on
Google Cloud.

### 1. Build and test the container locally

```bash
# From the repository root
docker build -t copilotkit-forms .
docker run --rm -p 4173:4173 --env-file app/.env copilotkit-forms
```

Then open http://localhost:4173 to verify the production bundle loads correctly. If you do not have
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
  --set-env-vars VITE_COPILOTKIT_PUBLIC_API_KEY=<YOUR_PUBLIC_KEY>
```

Cloud Run automatically provisions HTTPS for the service URL. The container respects the `PORT`
environment variable that Cloud Run sets automatically (defaults to `8080`). Supply Copilot
configuration values before building the image (for example by editing `.env` or `public/env.js`)
so they are bundled into the static assets served by Vite preview.

By relying on the container image, every deployment will bundle the compiled assets, avoiding
missing-build `404`s and making rollbacks or staging deployments straightforward.
