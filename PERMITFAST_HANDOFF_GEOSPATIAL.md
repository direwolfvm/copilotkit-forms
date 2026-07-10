# PermitFast Geospatial & Screening Handoff

**Audience:** the agent maintaining this portal (`copilotkit-forms`).
**From:** the PermitFast app team (`basic-permit-workflow`).
**Last updated:** 2026-07-10.
**Companion to:** `PERMITFAST_HANDOFF.md` (general integration — you completed that
checklist; this doc covers the geospatial/screening additions since).

## What changed in PermitFast

1. **PermitFast switched its location picker to the ArcGIS Maps SDK**, following this
   portal's own component pattern (`ArcgisSketchMap` / `arcgisResources` — same CDN
   loading, `<arcgis-map>` + `<arcgis-sketch>` + `<arcgis-search>` web components,
   Esri↔GeoJSON conversion). The two apps now render geometry identically.
2. **PermitFast now accepts your GeoJSON directly.** The `location_map` field parses a
   GeoJSON Feature or bare geometry — you no longer need to convert into PermitFast's
   internal `[lat, lon]` shape.
3. **PermitFast now accepts your screening results.** Supply the IPaC/NEPAssist summaries
   you already produce and PermitFast will use them instead of making the applicant
   re-run screening: species fields pre-fill, the References pane (applicant + reviewer +
   form assistant) shows the findings, and they flow into the generated SF-299.

The canonical reference is the **Geospatial & Screening tab** at
`https://permitfast.app.cloud.gov/developers`.

---

## How to submit geometry + screening

Everything goes in the **`location_map`** key of the *Location & Survey* section's
`evaluation_data` (`process_model_internal_reference_id: sf299-v2-location-survey`),
as a **JSON string**:

```jsonc
// evaluation_data for the Location & Survey payload
{
  "route_state": "UT",
  "route_county": "Grand",
  // …other survey fields per the element's form_data schema…
  "location_map": "<JSON-stringified GeoJSON Feature — see below>"
}
```

The Feature (recommended form — this maps 1:1 onto what you already have):

```jsonc
{
  "type": "Feature",
  "geometry": {
    // your GeometryChange.geoJson, parsed — Point | LineString | Polygon
    // (Multi* accepted; collapses to the first part). [lon, lat] order per GeoJSON.
    "type": "LineString",
    "coordinates": [[-109.549, 38.573], [-109.489, 38.612]]
  },
  "properties": {
    "zoom": 12,                       // optional initial zoom hint
    "screening": { /* see below */ }  // optional — your screening results
  }
}
```

### Mapping from this portal's types

| Portal (yours) | PermitFast `location_map` |
| --- | --- |
| `GeometryChange.geoJson` (string) | `JSON.parse` it → the Feature's `geometry` |
| `GeospatialResultsState` | → `properties.screening` (see field mapping below) |
| `GeometryChange.latitude/longitude` | not needed — derived from the geometry |

### Screening object (`properties.screening`)

Your `GeospatialResultsState` fields are accepted with automatic normalization:

| You send (portal shape) | PermitFast normalizes to |
| --- | --- |
| `lastRunAt` | `ranAt` |
| `ipac.summary` (your `IpacSummary`) | kept: `locationDescription`, `listedSpecies`, `criticalHabitats`, `migratoryBirds`, `wetlands`, `refuges` |
| `listedSpecies` entries as plain strings | `{ commonName: "<string>" }` |
| `refuges` as `{ name, … }` objects | name strings |
| `nepassist.summary` items with `severity` / `displayAnswer` / `rawAnswer` | `{ question, answer, category }` where `answer` ∈ `yes` \| `ondemand` \| `no` \| `other` |
| `environmentalMap`, `messages`, raw payloads | ignored — omit them to keep the row small |

**Do not send raw IPaC/NEPAssist responses** (hundreds of KB) — send the summaries.

Minimal example, straight from your state:

```ts
const feature = {
  type: "Feature",
  geometry: JSON.parse(geometryChange.geoJson),
  properties: {
    screening: {
      lastRunAt: results.lastRunAt,
      ipac: { status: results.ipac.status, summary: results.ipac.summary },
      nepassist: { status: results.nepassist.status, summary: results.nepassist.summary },
    },
  },
}
// evaluation_data.location_map = JSON.stringify(feature)
```

### What the applicant gets (why this matters)

- **No re-drawing**: your geometry renders on PermitFast's ArcGIS map, refinable with
  sketch tools.
- **No re-screening**: the Fish, Wildlife & Hazardous Materials section pre-fills its
  species narrative from your IPaC species list (SF-299 items 18a/18b), and the
  References pane shows the full species table + NEPAssist findings to the applicant,
  the reviewer, and the AI form assistant.

### If you have geometry but no screening

PermitFast exposes the same proxies you run yourself, same-origin and unauthenticated:

- `POST https://permitfast.app.cloud.gov/api/geospatial/ipac` — body
  `{ projectLocationWKT, includeOtherFwsResources: true, includeCrithabGeometry: false, saveLocationForProjectCreation: false, timeout: 5 }`
- `GET https://permitfast.app.cloud.gov/api/geospatial/nepassist?ptitle=&coords=<lon,lat,…>&type=<point|line|polygon>&newBufferDistance=0.5&newBufferUnits=miles&f=pjson`

Gotchas we hit that also apply to you: the NEPAssist broker rejects `type=polyline`
(use `line`), and IPaC rejects bare points (buffer to a small polygon).

---

## Reconciliation checklist (portal agent: update as you go)

- [x] On submission, build the `location_map` Feature from `GeometryChange.geoJson`
      (skip your previous conversion into PermitFast's `[lat, lon]` shape, if any).
- [x] Attach your screening summaries as `properties.screening` (summaries only, not raw
      responses).
- [x] Drop any code that told users to redo location/screening in PermitFast.
- [x] Optional: pass `properties.zoom` for a nicer initial view.
- [x] Record portal-side changes / open questions below.

### Portal-side notes / open questions

_(portal agent: append findings and decisions here)_

- **2026-07-10 — reconciled** (`app/src/utils/permitflow.ts`, `app/src/PermitStartPage.tsx`,
  tests in `app/src/utils/permitflow.test.ts`):
  - `buildLocationMapFeature()` now seeds the Location & Survey section's `location_map`
    as a JSON-stringified GeoJSON Feature. The geometry comes from the portal project's
    stored GeoJSON (`ProjectFormData.location_object`, which holds the bare geometry
    emitted by `ArcgisSketchMap`/`convertToGeoJsonGeometry`; Feature and
    FeatureCollection wrappers are unwrapped). Fallback: a `[lon, lat]` Point from
    `location_lat`/`location_lon`. The earlier `{mode, lat, lon, coordinates}` internal
    shape (from the first handoff) is gone — it shipped for only a few hours, so no
    portal-written rows in the old shape should exist.
  - `buildLocationMapScreening()` projects `GeospatialResultsState` to
    `properties.screening` as `{ lastRunAt, ipac: {status, summary}, nepassist:
    {status, summary} }` — summaries only; `raw`, `meta`, `environmentalMap`, and
    `messages` are stripped. Omitted entirely when neither service has a summary.
  - `properties.zoom: 12` is always set.
  - Screening travels with `submitPermitflowProject()` (PermitStartPage already loads
    `geospatialResults` alongside the project). Note: the seed happens at initial
    submission; if the applicant re-runs screening in the portal *after* submitting,
    the portal does not currently push the refreshed summary into the existing
    Location & Survey payload. Flagging as a possible follow-up.
  - No portal copy told users to redo location/screening in PermitFast, so nothing to
    remove for that item.
