# HelpPermitMe user guide

HelpPermitMe is an unofficial demonstration. It does not submit an official application and is not
a system of record. Availability and saved data depend on the demo services configured by the
operator.

## Start with a project

Open **Portal → New project** (`/portal/new`). The portal organizes intake into four editable areas:

1. **Core Project Data** — title, description, agencies, sponsor, funding, and contact information.
2. **Location and Geospatial Data** — location narrative, coordinates, and a point, line, or polygon.
3. **Permitting Checklist** — candidate permits, approvals, consultations, notes, and completion
   state.
4. **NEPA Review** — categorical-exclusion and environmental-review notes.

The Copilot can map a conversational project description into structured fields, add or update
checklist items, reset the draft, and ask the integrated NEPA specialist questions using current
project, checklist, and geospatial context. Review every suggested change before relying on it.

The first visit offers a guided tour. Use **Take a tour** to replay it.

### Save and submit pre-screening

The portal auto-saves changed projects after a short delay and also provides **Save project data**.
The first successful save assigns an eight-digit project identifier. A saved snapshot is required
before pre-screening can be submitted.

**Submit pre-screening** evaluates and stores the project, geospatial screening, checklist, and NEPA
decision data. A submission can be updated later by returning to `/portal/:projectId`.

### Add a project footprint

Use the ArcGIS map to search or navigate, then draw a point, line, or polygon. You can instead upload
KML, KMZ, or GeoJSON. A point can be used for NEPA Assist, but workflows such as IPaC project
creation may require a line or polygon.

Set the analysis buffer and run the geospatial screen. The app requests:

- an interactive environmental map from the configured NEPA service;
- NEPA Assist resource findings; and
- IPaC species, critical-habitat, and other resource information.

These are screening aids, not official determinations. Confirm findings with the responsible
agency and retain the authoritative source response when required.

### Reports and supporting documents

After saving a project, generate a PDF project report or upload supporting documents. Portal uploads
accept PDF, DOCX, JPG/JPEG, and PNG and are stored in the configured `permit-documents` bucket.

## Continue into connected workflows

Checklist entries for supported workflows display a start link carrying the saved project ID.

### Right of Way Authorization (SF-299)

The `/permits/basic?projectId=...` route exchanges data with PermitFast:

1. Review the loaded project and process model.
2. Authenticate with the PermitFast demo account.
3. Create or update the linked PermitFast project.
4. Complete the phased SF-299 form sections.
5. Save individual sections or submit the application for approval.

The integration sends project information and location/screening summaries. File fields upload to
PermitFast storage. The page also reads existing application status and feedback so a returned
application can be corrected and resubmitted.

### Complex Environmental Review

The `/reviews/complex?projectId=...` route follows a similar authenticated handoff to ReviewWorks.
It creates or updates the linked project and process instance and reports its current workflow
status.

### IPaC ESA consultation

The `/permits/ipac-consultation?projectId=...` route requires a saved project with the required core
fields and a compatible footprint. It submits the geometry to the IPaC beta endpoint and returns a
URL where the user continues with Login.gov and IPaC.

HelpPermitMe tracks a local shadow workflow with milestones for geospatial submission, IPaC project
creation, and consultation completion. Marking those milestones in HelpPermitMe does not perform
the corresponding official IPaC action.

### NHPA Section 106 review

The `/reviews/section-106?projectId=...` route opens a case in the **Section 106 Case Manager
(Demo)** through a server-side exchange:

- initiate a case from the portal project;
- save and read back section payloads;
- view case status and events;
- respond to open proponent information requests; and
- withdraw the demonstration case.

This integration is prominently marked as a demo and is not a system of record.

## Track projects and processes

### My Projects

`/projects` shows projects as a hierarchy with pre-screening and linked external processes. Expand a
project to review statuses and navigate to its portal or workflow.

The project deletion dialog always removes the portal project and related local process data. When
linked PermitFast, ReviewWorks, or Section 106 records are detected, you can also request their
deletion or withdrawal. External cleanup may require demo account credentials. Deletion is
destructive and cannot be undone.

### Project Explorer and project details

`/dashboard/project-explorer` provides a dashboard-oriented project list and filters.
`/dashboard/project-explorer/:projectId` combines project metadata, location, process information,
case events, reports, and documents in a detail view.

### Analytics

`/dashboard/analytics` summarizes pre-screening, Right of Way Authorization, and Complex Review
activity, including status distributions, daily outcomes, completion counts, and turnaround
metrics. The analytics Copilot can interpret the currently loaded aggregates.

## Research before submission

- **Geospatial Screening** (`/resources/geospatial-screening`) runs the map workflow without creating
  a portal project. Its Copilot receives the current geometry, buffer, results, and interpreted
  implications.
- **Permit & Authorization Inventory** (`/resources/permit-authorization-inventory`) provides
  searchable federal permit and authorization references with integration status and agency tools.
- **NEPA Compliance** (`/resources/nepa-compliance`) provides agency-specific procedure references
  and detail pages at `/nepa-info/:agencyId`.
- **Shared Services** (`/resources/shared-services`) catalogs reusable permitting technology and
  service offerings.
- **Developer Tools** (`/developer-tools`) illustrates the data model, Supabase requests, and
  Copilot integration concepts. Examples are educational and require environment-specific
  authentication and policy review before reuse.

## Settings

`/settings` includes:

- **Copilot runtime:** switch between the configured default runtime and the Permitting ADK proxy.
- **Seasonal theme:** none, Christmas, Fourth of July, or unicorn.
- **Visual theme:** Legacy, New token baseline, or Gold + Marble.
- **Project maintenance:** an operator-oriented deletion tool for portal data.

Theme choices and completed-tour flags are stored in the current browser's local storage. Runtime
selection lasts for the current application session.

## Common issues

- A missing or invalid Supabase configuration prevents saving, loading, reports, uploads, and
  analytics.
- External workflows require their own URL, anon key, tenant ID, and—in the PermitFast and
  ReviewWorks flows—a valid demo user account.
- IPaC handoff needs a compatible line or polygon, even when a point was sufficient for other
  screening.
- Upstream public services can be slow or unavailable. Treat displayed errors as a prompt to retry
  or use the official service directly.
- Saved records are scoped by the configured tenant. Using the wrong tenant ID can make existing
  projects appear missing.
