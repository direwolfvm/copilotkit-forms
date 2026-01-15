# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React + Vite application demonstrating CopilotKit integration with react-jsonschema-form (RJSF) for a permitting workflow. The app helps users capture CEQ Project entities through a form with an AI-powered Copilot sidebar that can read form state, suggest values, and apply changes directly.

## Common Commands

All commands run from the `app/` directory:

```bash
cd app
npm install                    # Install dependencies (Node 18+ required)
npm run dev                    # Start Vite dev server (localhost:5173)
npm run build                  # Type-check and build for production
npm run lint                   # Run ESLint
npm test -- --run              # Run Vitest suite once
npm test                       # Run Vitest in watch mode
npm run start                  # Start production Express server
```

For remote/Codespace development:
```bash
npm run dev -- --host 0.0.0.0 --port 4173 --clearScreen false
```

## Architecture

### Directory Structure

```
app/
├── src/
│   ├── components/         # React components (ProjectSummary, LocationSection, etc.)
│   ├── schema/             # RJSF form schema definitions
│   ├── utils/              # Business logic (persistence, geospatial, permits)
│   ├── types/              # TypeScript type definitions
│   ├── App.tsx             # Router and layout
│   ├── PortalPage.tsx      # Main form page with CopilotKit integration
│   ├── main.tsx            # Entry point with providers
│   └── runtimeConfig.ts    # Environment configuration resolver
├── server.mjs              # Express server for production
└── package.json
database-schema/            # Supabase SQL migrations and CSV data
```

### CopilotKit + RJSF Integration Pattern

The integration in `PortalPage.tsx` follows this pattern:

1. **Context Sharing**: Three `useCopilotReadable` hooks expose form data, human-readable summary, and geospatial/checklist state to the AI
2. **Actions**: `useCopilotAction` defines AI capabilities:
   - `updateProjectForm` - Merges field updates with type coercion
   - `resetProjectForm` - Clears form to blank template
   - `addPermittingChecklistItems` - Updates permit checklist entries
3. **Instructions**: Auto-generated from schema field metadata to guide AI responses
4. **Form Binding**: RJSF `Form` component binds to schema; CopilotKit actions update the same React state

### Key Files

- `src/schema/projectSchema.ts` - CEQ Project entity as RJSF-compatible JSON Schema with field metadata, descriptions, and UI hints
- `src/PortalPage.tsx` - Main orchestration: RJSF form, CopilotKit sidebar, persistence, geospatial features
- `src/utils/projectPersistence.ts` - Supabase integration for projects, snapshots, and checklists
- `src/utils/geospatial.ts` - NEPA Assist and IPaC API integration
- `src/copilotRuntimeContext.tsx` - Provider for runtime mode selection (Cloud vs custom ADK)

### API Endpoints (Express server)

- `/api/supabase/*` - Proxy for Supabase (credentials never exposed to browser)
- `/api/custom-adk/agent` - Local Copilot runtime proxy
- `/api/geospatial/*` - NEPA Assist and IPaC geospatial APIs
- `/env.js` - Runtime environment injection for Cloud Run deployments

## Environment Variables

Create `app/.env` from `.env.example`:

- `VITE_COPILOTKIT_PUBLIC_API_KEY` - CopilotKit API key (optional for UI testing)
- `VITE_COPILOTKIT_RUNTIME_URL` - Custom runtime URL (optional)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

Also accepts `NEXT_PUBLIC_*` and non-prefixed variants for compatibility.

## Testing

Tests are in `app/src/` alongside source files. Run with:

```bash
cd app
npm test -- --run           # Single run
npm test                    # Watch mode
npm run test:bench          # Benchmarks
```

Tests cover UI components and geospatial utilities (Resource Check helpers, GeoJSON normalization).

## State Management

- Local React state (useState) for form data
- Module-level cache for persisted project state to survive remounts
- useCallback dependencies carefully managed for CopilotKit action stability
- Discriminated unions for state machines (e.g., GeospatialResultsState)
