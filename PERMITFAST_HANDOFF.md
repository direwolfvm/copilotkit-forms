# PermitFast Integration Handoff

**Audience:** the agent maintaining this portal (`copilotkit-forms`).
**From:** the PermitFast app team (`basic-permit-workflow`).
**Last updated:** 2026-07-10.

This portal submits permit applications into PermitFast by reading `decision_element`
definitions and writing `project` / `process_instance` / `process_decision_payload` /
`case_event` rows over the Supabase REST API. PermitFast has changed substantially — the
permit is now a **phased digitization of Standard Form 299 (SF-299)** instead of the old
3‑field "Basic Permit". This document lists what changed and what you need to reconcile.

The **canonical, always-current API reference** is the in-app developer docs:
`https://permitfast.app.cloud.gov/developers` (source: `web/src/pages/DeveloperResourcesPage.tsx`
in the PermitFast repo). Read it alongside this handoff — this file explains the *deltas*
and gives you a checklist; that page is the authoritative request/response reference.

---

## TL;DR of what changed

1. **New process model.** The permit is now **"Basic Permit (SF-299)"** (currently process
   model **id 3** in the shared Supabase project), not "Basic Permit" (models 1/2).
2. **Element structure is completely different.** The old model had **3** decision elements
   (`User id`, `Project Information`, `SF-299 Application`). The SF-299 model has **11** phased
   form sections and **no separate `User id`/auth element**.
3. **Field encodings matter.** Sections use `oneOf`/`const` selects, booleans, file-reference
   strings, a geometry field, and conditional supplemental fields — each with a required
   encoding (details below).
4. **File uploads are now supported** via a Storage bucket + `permit_document` table. The
   portal currently has no upload path.
5. **`tenant_id` is required on every inserted row** and enforced by row-level security.

---

## 1. Process model: stop hard-coding "Basic Permit" = 1

Current portal code (`app/src/utils/permitflow.ts`):

```ts
const BASIC_PERMIT_LABEL = "Basic Permit"
export const BASIC_PERMIT_PROCESS_MODEL_ID = 1
const BASIC_PERMIT_PROCESS_MODEL_TITLE = "Basic Permit"
```

- The SF-299 permit's title is **`Basic Permit (SF-299)`**. Resolve the model at runtime by
  title (you already fetch `process_model`), rather than assuming `1`. Numeric IDs are **not**
  stable across environments; the title is.
- If you must keep a constant, it is currently `3` in the live tenant — but treat that as a
  fallback, not the source of truth.

## 2. Decision elements: 11 sections, no auth element

The old `permitflowDecisionElementIdCache` shape `{ auth, projectInfo, sf299 }` is obsolete.
The SF-299 model's elements (resolve by `process_model_internal_reference_id`, **not** numeric id):

| Reference ID (`process_model_internal_reference_id`) | Title |
| --- | --- |
| `sf299-v2-project-info` | Project Information |
| `sf299-v2-applicant-info` | Applicant Information |
| `sf299-v2-row-description` | Right-of-Way Description |
| `sf299-v2-location-survey` | Location & Survey |
| `sf299-v2-agency-context` | Agency Context |
| `sf299-v2-tech-financial` | Technical & Financial Capability |
| `sf299-v2-alternatives` | Reasonable Alternatives |
| `sf299-v2-population-social` | Population & Social Effects |
| `sf299-v2-environmental` | Environmental Effects |
| `sf299-v2-fish-wildlife-hazmat` | Fish, Wildlife & Hazardous Materials |
| `sf299-v2-certification` | Certification |

Key differences from the old flow:

- **There is no `User id` decision element.** Do **not** create an auth payload. The applicant
  is linked on the project via `project.other.applicant_user_id = {USER_ID}`.
- Create **one `process_decision_payload` per section** (11 total). A section may start as
  `evaluation_data: {}` and be PATCHed later.
- **Always read `form_data` (a JSON Schema) from each element** and drive your field
  collection/validation from it. Field names and requirements change over time; the schema
  is the contract.

## 3. Field encodings in `evaluation_data`

Match the schema when you write values:

- **`oneOf: [{ const, title }]` single-selects** (e.g. `entity_type`, `application_for`,
  `citizenship_declaration`, the `suppl_*_status` fields): store the **`const`** value
  (`"corporation"`), never the human title, and **never an empty string** — omit the key if
  unset. (An empty string fails the schema's `oneOf` validation.)
- **Booleans** (`hazardous_materials_involved`, `international_boundary_involved`, …): real
  `true`/`false`.
- **`*_file` fields**: a **JSON string** holding a document reference — see §4.
- **`location_map`** (Location & Survey): a **JSON string** with the geometry:
  ```json
  "{\"mode\":\"line\",\"lat\":38.57,\"lon\":-109.55,\"zoom\":12,
    \"coordinates\":[[38.57,-109.55],[38.60,-109.50]],
    \"attachment\":{\"documentId\":42,\"storagePath\":\"...\",\"originalFilename\":\"map.png\"}}"
  ```
  `mode` ∈ `marker` | `line` | `area`; `coordinates` is `[lat, lon]` pairs. `attachment` is
  optional. (PermitFast can also store an IPaC/NEPAssist `screening` object here; you don't
  need to produce it.)
- **Conditional supplemental fields** (`suppl_*` on Applicant Information): only apply when
  `entity_type` is `corporation` or `partnership`. Omit them otherwise.

## 4. File uploads (new capability — portal has none today)

Uploads live in the **`permit-documents`** Storage bucket, cataloged in **`permit_document`**,
and referenced from the owning section's `evaluation_data`:

1. `POST /storage/v1/object/permit-documents/{tenant_id}/{process_id}/{field_name}/{uuid}-{filename}`
   with the file bytes.
2. `POST /rest/v1/permit_document` with `{ process_id, project_id, tenant_id,
   decision_element_id, field_name, storage_path, original_filename, mime_type,
   file_size_bytes, uploaded_by }`.
3. Set the section field value to a JSON **string**:
   `"{\"documentId\":42,\"storagePath\":\"...\",\"originalFilename\":\"plans.pdf\"}"`.

Common upload fields: `plans_file` (Applicant Information); `suppl_articles_file`,
`suppl_bylaws_file`, `suppl_good_standing_file`, `suppl_resolution_file` (corporate
supplemental); `map_file` (Location & Survey). `permit_document` is tenant-isolated by RLS.

## 5. Tenant scoping & the return/resubmit loop

- Every inserted row (`project`, `process_instance`, `process_decision_payload`,
  `case_event`, `permit_document`) must include the caller's **`tenant_id`**.
- Reviewers **return** applications with `project.current_status = "returned"` and per-section
  feedback in `process_decision_payload.result_notes` (with `result_bool = false`). Poll these
  to show revision requests to your applicant, then resubmit (`status`/`current_status` back to
  `submitted`).

---

## Reconciliation checklist (portal agent: update as you go)

- [x] Resolve the process model by title `Basic Permit (SF-299)` (drop the hardcoded `1`).
- [x] Replace the `{ auth, projectInfo, sf299 }` element cache with a by-reference-id lookup
      over all 11 SF-299 sections.
- [x] Stop creating a `User id`/auth payload; link the applicant via
      `project.other.applicant_user_id`.
- [x] Create one payload per SF-299 section; drive fields from each element's `form_data`.
- [x] Encode `oneOf`/`const` selects as the `const` value; never emit `""` for them.
- [x] Encode booleans, `location_map`, and `*_file` references correctly.
- [x] Add a file-upload path (Storage + `permit_document` + in-form reference).
- [x] Include `tenant_id` on every inserted row.
- [x] Handle the `returned` status + `result_notes` revision loop.
- [x] Record any portal-side changes or open questions below.

### Portal-side notes / open questions

_(portal agent: append findings, decisions, and anything the PermitFast team should know)_

- **2026-07-10 — portal reconciled with the SF-299 model** (`app/src/utils/permitflow.ts`,
  `app/src/PermitStartPage.tsx`):
  - The model is resolved by title `Basic Permit (SF-299)`; id `3` is used only as a fallback
    when the title lookup returns nothing.
  - Portal-facing language now calls the permit **"Right of Way Authorization"** (SF-299).
    Legacy checklist items saved as "Basic Permit" are still matched and are relabeled the
    next time a checklist loads; the `/permits/basic` route is unchanged so persisted
    checklist links keep working.
  - Submission creates one `process_decision_payload` per section returned for the model
    (not hard-coded to 11), ordered by `process_model_internal_reference_id`. The
    `sf299-v2-project-info` section is seeded from the portal project profile, and
    `sf299-v2-location-survey` gets a seeded `location_map` marker JSON string when the
    portal project has coordinates; seeds only write fields the section's `form_data`
    actually declares.
  - All section writes pass through `sanitizeEvaluationDataForSchema()` (unit-tested in
    `app/src/utils/permitflow.test.ts`): `oneOf`/`const` values are validated (empty strings
    omitted), booleans must be real booleans, and `suppl_*` fields are dropped unless
    `entity_type` ∈ {corporation, partnership}. Keys the schema doesn't describe (e.g. a
    PermitFast-written `screening` object) pass through untouched.
  - Uploads: `uploadPermitflowDocument()` posts to
    `permit-documents/{tenant_id}/{process_id}/{field_name}/{uuid}-{filename}`, inserts the
    `permit_document` row, and the SF-299 modal renders every `*_file` field with an upload
    widget that stores the JSON-string reference.
  - Returned loop: the portal reads `project.current_status` plus per-section
    `result_notes`/`result_bool`, flags affected sections in the SF-299 modal, and
    resubmission sets process `status` and project `current_status` back to `submitted`
    (logged as a "Resubmitted for Approval" case event).
  - Open question for the PermitFast team: the portal previously recorded the applicant's
    email in the old auth payload; with that element gone, only
    `project.other.applicant_user_id` is written. Confirm nothing downstream expected the
    email, or document where it should live.
  - Open question: `https://permitfast.app.cloud.gov/developers` renders client-side only,
    so tooling can't scrape it; a JSON/OpenAPI export would help future reconciliation.
