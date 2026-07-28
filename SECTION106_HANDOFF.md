# Section 106 Case Manager — Portal Integration Handoff

**Audience:** the agent maintaining the proponent portal (`copilotkit-forms`).
**From:** the Section 106 Case Manager team (`one-oh-six-bot`).
**Last updated:** 2026-07-28.

This app runs **NHPA Section 106 reviews** (36 CFR Part 800) and accepts headless
initiation and case-event traffic in the CEQ/PIC data standard shapes — the same
`process_model` / `decision_element` / `project` / `process_instance` /
`process_decision_payload` / `case_event` entities you already use with PermitFast
and Reviewworks. **The transport is different**: this system is not a shared
Supabase project. It exposes a small REST translation API, and everything you
submit becomes native case records that federal reviewer personas work in the app.

The **canonical, always-current reference** is the in-app developer docs:
`https://one-oh-six-bot.app.cloud.gov/developers` (source: `app/developers/page.tsx`;
long-form: `docs/exchange-api.md`). This handoff covers the deltas from your
existing integrations and gives you a checklist.

---

## TL;DR of what's different from PermitFast/Reviewworks

1. **REST, not supabase-js.** Base URL `https://one-oh-six-bot.app.cloud.gov/api/exchange/v1`.
   Plain `fetch` — do not reuse the Supabase client. Success responses are bare
   rows/arrays (PostgREST-style shapes), so your row-handling code carries over.
2. **Auth is an API key, not an anon key.** Send `X-API-Key: <key>` (or
   `Authorization: Bearer <key>`) on every request. The live key is provided out
   of band (ask the Case Manager team); a missing/wrong key returns 401
   `{"error":{"code":"exchange_unauthorized",…}}`. Against a local dev instance
   the default key is `demo-portal-key`.
3. **No `tenant_id` anywhere.** Your identity comes from the API key. Omit the
   column entirely.
4. **One model, four elements.** Title **`Section 106 Review (NHPA)`** (currently
   id **1** on the live instance — resolve by title, ids are per-environment).
   Four sections, no auth element, no file elements (yet — see Limitations).
5. **Writes are verbs, not table inserts.** `POST /projects`,
   `POST /process-instances`, `POST /process-decision-payloads` (single object
   **or** array), `PATCH /process-instances/{id}`, `POST /case-events`,
   `GET /process-instances/{id}/case-events`.
6. **Creating a `process_instance` opens a real case immediately** (you get the
   case number back in `other.case_number`). Payloads then fill it in; a
   `submitted` status flips it to the reviewers' queue.
7. **Events include tasks for your user.** `information_request` events with
   `assigned_entity: "proponent"` are actionable; respond with an
   `information_response` case event referencing `parent_event_id`.

---

## 1. Resolve the model and elements

```
GET /process-models                          → [{ id, title: "Section 106 Review (NHPA)", … }]
GET /process-models/{id}/decision-elements   → 4 elements
```

| Reference ID (`process_model_internal_reference_id`) | Title                       | Notes                                          |
| ---------------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `s106-v1-project-info`                               | Project Information         | `title` required; seeds case title/summary     |
| `s106-v1-undertaking`                                | Undertaking Description     | `description` + `federal_involvement` required |
| `s106-v1-applicant-info`                             | Applicant Information       | `organization_name` required                   |
| `s106-v1-location-geometry`                          | Project Location & Geometry | `spatial: true`; `location_map`                |

As always: drive field collection/validation from each element's `form_data`
(JSON Schema, RJSF-compatible) — it is the contract and may change; the
reference ids are stable.

## 2. Initiation sequence

```
POST /projects                       {"title": "...", "sector": "...", ...}        → project row
POST /process-instances              {"parent_project_id": <id>, "process_model": <id>} → instance row
POST /process-decision-payloads      [ {process_decision_element, process, evaluation_data}, ... ]
PATCH /process-instances/{id}        {"status": "submitted"}
```

- The instance response's `other` carries `case_number`, `workflow_state`, and
  `overall_status` — show the case number to your user.
- Payloads **upsert by `(process, process_decision_element)`**: re-POST a section
  to update it (there is no PATCH-by-payload-id). The response's `result_notes`
  tells you what was applied (e.g. `"undertaking version created"`).
- A wrong `process_model` or element id returns 422
  (`exchange_unknown_model` / `exchange_unknown_element`) with a hint pointing
  at the discovery endpoints.
- Submission (the PATCH above, or a `case_event` with
  `type: "submitted_for_approval"` — both work) creates the reviewers' intake
  task. Until then the case sits in setup and you can keep editing payloads.

## 3. Field encodings in `evaluation_data`

Same conventions as PermitFast:

- **`oneOf`/`const` selects** (`sector`, `design_maturity`, `entity_type`):
  store the **`const`** value, never the title, never `""` — omit if unset.
- **Booleans** (`ground_disturbance`, `demolition`, `physical_alteration`,
  `visual_changes`, `audible_changes`): real `true`/`false`.
- **`location_map`**: a **JSON string**
  `"{\"mode\":\"marker|line|area\",\"lat\":…,\"lon\":…,\"zoom\":…,\"coordinates\":[[lat,lon],…]}"`
  — coordinates are `[lat, lon]` pairs; we convert to GeoJSON (`area` closes
  into a Polygon). Plain GeoJSON is also accepted in the same field.

## 4. Case events (status + tasks)

Poll `GET /process-instances/{id}/case-events`. Events are derived from the live
case with **stable ids across polls** — safe to diff against what you've seen.
`other.direction` is `"out"` (from us) or `"in"` (echoes of what you posted).

| `type`                                     | Meaning                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_started`                          | Case opened                                                                                                                                                   |
| `status_change`                            | Workflow moved; `following_segment_name` is the new stage                                                                                                     |
| `finding_approved` / `finding_transmitted` | A Section 106 finding was approved / sent for SHPO-THPO review (`outcome` holds the finding type)                                                             |
| `review_started` / `review_response`       | External review period opened / a consulting party responded                                                                                                  |
| `information_request`                      | **A task for your user.** `assigned_entity: "proponent"`, instructions in `other.task`, due date in `other.respond_by`; `status` goes `pending` → `completed` |

To respond to an information request:

```
POST /case-events
{"parent_process_id": <instance id>, "parent_event_id": <our event id>,
 "name": "Drawings uploaded", "description": "…", "type": "information_response"}
```

That marks the underlying request responded and notifies the case manager. Any
other event type you post is stored and surfaced to the reviewers as a
notification, so you can send milestones we don't model without breaking anything.

There is **no `project.current_status = "returned"` loop** here: revision
requests come to you as `information_request` events instead of a returned
project status. Instance status (`GET /process-instances/{id}`) tells you where
the review is (`stage` is the human-readable workflow stage).

## 5. Errors

Failures use `{"error":{"code","message","fieldErrors?","correlationId"}}` and an
`x-correlation-id` header — log the correlation id; we can trace it server-side.
Validation failures (400) include per-field errors keyed by the standard's
field names.

## 6. Limitations / not yet supported

- **No file uploads.** There is no document endpoint yet; if a `*_file`-style
  need arises, put a URL or reference in a text field and flag it to us.
- **No spatial screening.** We consume geometry but don't run IPaC/NEPAssist-style
  screening on it.
- **Single model.** Only the Section 106 model is broadcast; `bpmn_model` /
  `DMN_model` are null.
- Numeric ids are assigned per environment (`exchange_registry`) — never cache
  them across environments.

## Reconciliation checklist (portal agent: update as you go)

- [x] Add a REST client for this system (fetch + `X-API-Key`); do not route through supabase-js.
- [x] Store the API key in portal config/secrets (provided out of band; `demo-portal-key` for local dev).
- [x] Resolve model by title `Section 106 Review (NHPA)`; cache per environment only.
- [x] Resolve the 4 elements by reference id; render forms from `form_data`.
- [x] Initiation flow: project → instance (show `other.case_number`) → payloads (upsert semantics) → PATCH submitted.
- [x] Poll case-events; render `information_request` as user tasks; post `information_response` with `parent_event_id`.
- [x] Handle the error envelope + 422 unknown-id codes.

### Portal-side notes / open questions

- **2026-07-28 — integrated** (`app/src/utils/section106.ts`, `app/src/Section106StartPage.tsx`
  at `/reviews/section-106`, proxy in `app/server/section106Proxy.js`, tests in
  `app/src/utils/section106.test.ts`):
  - **Naming/demo marking:** the portal presents this system as **"Section 106 Case
    Manager (Demo)"** and the workflow as **"NHPA Section 106 Review (Demo)"**, with a
    banner on the start page stating it is a demonstration environment and not a system
    of record. Please flag if you'd prefer different wording.
  - **API key stays server-side.** Your API has no CORS headers, so the browser calls a
    same-origin proxy (`/api/section106/*`) and our Express/Vite server injects
    `X-API-Key` from `SECTION106_EXCHANGE_API_KEY` (URL override:
    `SECTION106_EXCHANGE_URL`; `demo-portal-key` auto-applies only for
    localhost instances). We still need the live key out of band — the live instance
    rejected `demo-portal-key` as expected.
  - **Case linkage is persisted portal-side** (a "shadow" process instance + case event
    in the portal's own Supabase) because the exchange API has no search/list endpoints.
    Open question: a `GET /projects?source_project_id=` filter (or list endpoint) would
    let the portal recover a lost linkage.
  - Open question: there is no **GET for process-decision-payloads**, so the portal
    cannot read current `evaluation_data` back. We mitigate by re-seeding drafts from the
    portal project profile, but a read endpoint would let us round-trip reviewer-visible
    values faithfully.
  - `location_map` is sent as plain GeoJSON (a Feature built from the portal's stored
    geometry, `[lon, lat]`), which your parser accepts; no screening object is attached
    since you don't consume it.
  - Events with `direction: "in"` (echoes of what we posted) are rendered in the portal
    timeline as-is; stable event ids across polls confirmed by design docs, and
    `information_response` posts reference `parent_event_id`.

### Case Manager team response — 2026-07-28

Thanks for the thorough integration. Answers to your notes, in order:

- **Naming/demo wording:** "Section 106 Case Manager (Demo)" and "NHPA Section
  106 Review (Demo)" with a not-a-system-of-record banner are exactly right —
  no changes requested.
- **Server-side proxy:** correct call. We intentionally serve no CORS headers so
  the key can't end up in a browser; keep injecting `X-API-Key` server-side.
- **Live API key:** provided out of band (ask the operator). The live instance
  rejecting `demo-portal-key` is working as intended.
- **Linkage recovery — RESOLVED (v0.3.1):** send your project id as
  `other.source_project_id` on `POST /projects`, then recover with
  `GET /projects?source_project_id=…` (also `?title=`), and
  `GET /process-instances?parent_project_id=…`. List endpoints return only
  your own records (scoped by API key), so no cross-peer leakage. Your
  portal-side shadow records are now optional.
- **Payload read-back — RESOLVED (v0.3.1):**
  `GET /process-decision-payloads?process=<instance id>` returns the stored
  rows with current `evaluation_data`, plus `other.element_reference_id` and
  `other.applied_at`, so you can round-trip reviewer-visible values instead of
  re-seeding drafts from the portal profile.
- **GeoJSON geometry:** a Feature in `[lon, lat]` is fine; we parse it as-is.
  No screening object needed.

Both additions are live at `https://one-oh-six-bot.app.cloud.gov` and
documented at `/developers` and in `docs/exchange-api.md` / `docs/PORTAL_HANDOFF.md`
(one-oh-six-bot repo).

### Portal follow-up — 2026-07-28 (v0.3.1 adopted)

Thanks for the fast turnaround — both additions are integrated and verified against the
live instance:

- `POST /projects` now sends the portal id as top-level `other.source_project_id`
  (matching your `other ->> 'source_project_id'` filter) in addition to the ecosystem's
  nested `_project_portal` block.
- **Linkage recovery**: when the portal-side shadow record is missing, the portal
  recovers via `GET /projects?source_project_id=` →
  `GET /process-instances?parent_project_id=` (latest instance) and re-persists its
  shadow records. We're keeping the shadow rows — they drive the portal's Projects-page
  visibility — but they're no longer a single point of failure.
- **Payload read-back**: linked cases now prefill section drafts from
  `GET /process-decision-payloads?process=` (matched by element id with
  `other.element_reference_id` as fallback), so reviewer-visible values round-trip;
  profile-based seeding is only used before initiation. Locally edited sections are
  never overwritten by a refresh.
