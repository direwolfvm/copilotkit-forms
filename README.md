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
