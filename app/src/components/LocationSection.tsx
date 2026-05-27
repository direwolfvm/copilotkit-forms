import { useCallback, useId, useState } from "react"
import type { ReactNode } from "react"

import type { ProjectFormData } from "../schema/projectSchema"
import { ArcgisSketchMap } from "./ArcgisSketchMap"
import type { GeometryChange, GeometrySource, UploadedGisFile } from "../types/gis"
import type {
  EnvironmentalMapSummary,
  GeospatialResultsState,
  GeospatialServiceState,
  IpacFacilitySummary,
  IpacListedSpeciesSummary,
  IpacMigratoryBirdSummary,
  IpacMigratoryBirdWeekSummary,
  IpacSummary,
  NepassistSummaryItem
} from "../types/geospatial"
import { summarizeNepassist } from "../utils/geospatial"
import { CollapsibleCard, type CollapsibleCardStatus } from "./CollapsibleCard"

interface LocationSectionProps {
  title: string
  description?: string
  actions?: ReactNode
  placeholder?: string
  rows?: number
  locationText?: string
  geometry?: string
  activeUploadFileName?: string
  enableFileUpload?: boolean
  onLocationTextChange: (value: string) => void
  onLocationGeometryChange: (updates: LocationGeometryUpdates) => void
  geospatialResults?: GeospatialResultsState
  onRunGeospatialScreen?: () => void
  isRunningGeospatial?: boolean
  hasGeometry?: boolean
  bufferMiles?: number
}

type LocationGeometryUpdates =
  Partial<Pick<ProjectFormData, "location_lat" | "location_lon" | "location_object">> & {
    arcgisJson?: string
    geometrySource?: GeometrySource
    uploadedFile?: UploadedGisFile | null
  }

const NEPA_CATEGORY_ORDER = [
  "Air Quality",
  "Water Resources",
  "Land Use & Tribal",
  "Hazardous Sites & Pollution",
  "Biological Resources",
  "Cultural Resources",
  "Community & Infrastructure",
  "Other"
]

const NEPA_CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: "Air Quality",
    patterns: [/\bozone\b/i, /\blead\b/i, /\bso2\b/i, /\bpm\s?2\.?5\b/i, /\bpm\s?10\b/i, /\bco\b/i, /\bno2\b/i, /air emissions?/i]
  },
  {
    category: "Water Resources",
    patterns: [/impaired streams?/i, /impaired water/i, /water bodies?/i, /\bstreams?\b/i, /\bnwi\b/i, /\bwetlands?\b/i, /water dischargers?/i, /aquifers?/i]
  },
  {
    category: "Land Use & Tribal",
    patterns: [/federal lands?/i, /\busfs\b/i, /tribal cession/i, /\btribes?\b/i, /service areas?/i, /\bilf\b/i, /\bfuds\b/i, /munitions response/i]
  },
  {
    category: "Hazardous Sites & Pollution",
    patterns: [/brownfields?/i, /superfund/i, /\btri\b/i, /hazardous waste/i, /chemical data reporting/i, /\bfuds\b/i, /munitions response/i]
  },
  {
    category: "Biological Resources",
    patterns: [/\befh\b/i, /\bhapc\b/i, /\bblm\b/i, /\bacec\b/i, /\besa\b/i, /critical habitat/i]
  },
  {
    category: "Cultural Resources",
    patterns: [/\bnrhp\b/i, /historic/i, /cultural/i]
  },
  {
    category: "Community & Infrastructure",
    patterns: [/schools?/i, /airports?/i, /hospitals?/i]
  }
]

const NEPA_SEVERITY_RANK: Record<NepassistSummaryItem["severity"], number> = {
  yes: 0,
  ondemand: 1,
  no: 2,
  other: 3
}

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

function categorizeNepassistItem(item: NepassistSummaryItem) {
  if (item.category && NEPA_CATEGORY_ORDER.includes(item.category)) {
    return item.category
  }
  const text = `${item.category ?? ""} ${item.question}`
  return NEPA_CATEGORY_PATTERNS.find(({ patterns }) => patterns.some((pattern) => pattern.test(text)))?.category ?? "Other"
}

function formatNepassistAnswer(item: NepassistSummaryItem) {
  switch (item.severity) {
    case "yes":
      return "⚠️ Yes"
    case "ondemand":
      return "⏳ On demand"
    case "no":
      return "✅ No"
    default:
      return item.displayAnswer || item.rawAnswer || "Not provided"
  }
}

function NepassistSummaryTable({ items }: { items: NepassistSummaryItem[] }) {
  if (!items.length) {
    return <p className="geospatial-results__status muted">No NEPA Assist findings returned.</p>
  }

  const grouped = new Map<string, NepassistSummaryItem[]>()
  for (const item of items) {
    const category = categorizeNepassistItem(item)
    grouped.set(category, [...(grouped.get(category) ?? []), item])
  }

  return (
    <div className="geospatial-results__category-list">
      {NEPA_CATEGORY_ORDER.filter((category) => grouped.has(category)).map((category) => {
        const categoryItems = [...(grouped.get(category) ?? [])].sort(
          (a, b) => NEPA_SEVERITY_RANK[a.severity] - NEPA_SEVERITY_RANK[b.severity]
        )
        return (
          <section className="geospatial-results__category" key={category}>
            <h5>{category}</h5>
            <div className="geospatial-results__table-wrapper">
              <table className="geospatial-results__table geospatial-results__table--compact">
                <thead>
                  <tr>
                    <th className="geospatial-results__result-column" scope="col">Result</th>
                    <th scope="col">Question</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryItems.map((item, index) => (
                    <tr key={`${category}-${item.question}-${index}`}>
                      <td className="geospatial-results__result-column">{formatNepassistAnswer(item)}</td>
                      <td>{item.question}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function renderList(items: string[]) {
  if (!items.length) {
    return <span className="geospatial-results__status muted">None returned</span>
  }
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  )
}

function groupListedSpecies(items: Array<string | IpacListedSpeciesSummary>) {
  const grouped = new Map<string, Array<string | IpacListedSpeciesSummary>>()
  for (const item of items) {
    const group = typeof item === "string" ? "Other" : item.group || "Other"
    grouped.set(group, [...(grouped.get(group) ?? []), item])
  }
  return [...grouped.entries()].sort(([a], [b]) => {
    if (a === "Other") {
      return 1
    }
    if (b === "Other") {
      return -1
    }
    return a.localeCompare(b)
  })
}

function renderLinkedName(name: string, url?: string) {
  if (!url) {
    return <span>{name}</span>
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {name}
    </a>
  )
}

function ListedSpeciesSection({ items }: { items: Array<string | IpacListedSpeciesSummary> }) {
  if (!items.length) {
    return <p className="geospatial-results__status muted">None returned</p>
  }

  return (
    <div className="geospatial-results__category-list">
      {groupListedSpecies(items).map(([group, species]) => (
        <section className="geospatial-results__category" key={group}>
          <h5>{group}</h5>
          <div className="geospatial-results__table-wrapper">
            <table className="geospatial-results__table">
              <thead>
                <tr>
                  <th scope="col">Species</th>
                  <th scope="col">Status</th>
                  <th scope="col">Critical Habitat</th>
                </tr>
              </thead>
              <tbody>
                {species.map((item, index) => {
                  if (typeof item === "string") {
                    return (
                      <tr key={`${group}-${item}-${index}`}>
                        <td>{item}</td>
                        <td>Not provided</td>
                        <td>None returned</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={`${group}-${item.commonName}-${index}`}>
                      <td>
                        {renderLinkedName(item.commonName, item.speciesProfileUrl)}
                        {item.scientificName ? <span className="geospatial-results__scientific">{item.scientificName}</span> : null}
                      </td>
                      <td>{item.status || "Not provided"}</td>
                      <td>{item.criticalHabitat || "None returned"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

function normalizeConcernStatus(value?: string) {
  if (!value) {
    return "Not provided"
  }
  if (value.includes("_")) {
    return value
      .toLowerCase()
      .replace(/^bcc_/, "bird of conservation concern ")
      .replace(/^non_bcc_/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  }
  return value
}

function weekIndexFromDate(value?: string) {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  return Math.max(1, Math.min(48, month * 4 + Math.ceil(day / 7)))
}

function isBreedingWeek(weekId: number, bird: IpacMigratoryBirdSummary) {
  const from = weekIndexFromDate(bird.optionalBreedsFrom)
  const to = weekIndexFromDate(bird.optionalBreedsTo)
  if (!from && !to) {
    return false
  }
  if (from && to && from > to) {
    return weekId >= from || weekId <= to
  }
  return weekId >= (from ?? 1) && weekId <= (to ?? 48)
}

function ProbabilityCell({
  week,
  bird
}: {
  week?: IpacMigratoryBirdWeekSummary
  bird: IpacMigratoryBirdSummary
}) {
  const weekId = week?.weekId ?? 0
  const probability = Math.max(0, Math.min(100, Number(week?.probability ?? 0)))
  const surveyHeight = Math.max(0, Math.min(24, Number(week?.surveyBarHeight ?? 0)))
  const breeding = weekId ? isBreedingWeek(weekId, bird) : false
  const noData = week?.noData === true || (!breeding && probability <= 0 && surveyHeight <= 0)

  return (
    <span className={`presence-cell${breeding ? " presence-cell--breeding" : ""}`} title={`Week ${weekId || ""}`}>
      {probability > 0 ? <span className="presence-cell__probability" style={{ height: `${Math.max(12, probability)}%` }} /> : null}
      {surveyHeight > 0 ? <span className="presence-cell__survey" style={{ height: `${surveyHeight}px` }} /> : null}
      {noData ? <span className="presence-cell__nodata" /> : null}
    </span>
  )
}

function ProbabilityPresence({ birds }: { birds: IpacMigratoryBirdSummary[] }) {
  const birdsWithData = birds.filter((bird) => bird.weeklyData?.length)
  if (!birdsWithData.length) {
    return null
  }

  return (
    <div className="presence-chart">
      <div className="presence-chart__legend">
        <span><i className="presence-legend presence-legend--probability" /> Probability of presence</span>
        <span><i className="presence-legend presence-legend--breeding" /> Breeding season</span>
        <span><i className="presence-legend presence-legend--survey" /> Survey effort</span>
        <span><i className="presence-legend presence-legend--nodata" /> No data</span>
      </div>
      <div className="presence-chart__scroll">
        <div className="presence-grid">
          <div className="presence-grid__corner" />
          {MONTH_LABELS.map((month) => (
            <div className="presence-grid__month" key={month}>{month}</div>
          ))}
          {birdsWithData.map((bird) => {
            const weeksById = new Map((bird.weeklyData ?? []).map((week) => [week.weekId, week]))
            return (
              <div className="presence-grid__row" key={bird.commonName}>
                <div className="presence-grid__species">{bird.commonName}</div>
                {Array.from({ length: 48 }, (_, index) => {
                  const weekId = index + 1
                  return <ProbabilityCell key={`${bird.commonName}-${weekId}`} week={weeksById.get(weekId) ?? { weekId }} bird={bird} />
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MigratoryBirdsSection({ items }: { items: Array<string | IpacMigratoryBirdSummary> }) {
  if (!items.length) {
    return <p className="geospatial-results__status muted">None returned</p>
  }
  const structured = items.filter((item): item is IpacMigratoryBirdSummary => typeof item !== "string")

  return (
    <>
      <div className="geospatial-results__table-wrapper">
        <table className="geospatial-results__table">
          <thead>
            <tr>
              <th scope="col">Species</th>
              <th scope="col">Status</th>
              <th scope="col">Breeding Season</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              if (typeof item === "string") {
                return (
                  <tr key={`${item}-${index}`}>
                    <td>{item}</td>
                    <td>Not provided</td>
                    <td>Not provided</td>
                  </tr>
                )
              }
              return (
                <tr key={`${item.commonName}-${index}`}>
                  <td>
                    {renderLinkedName(item.commonName, item.speciesProfileUrl)}
                    {item.scientificName ? <span className="geospatial-results__scientific">{item.scientificName}</span> : null}
                  </td>
                  <td>{normalizeConcernStatus(item.status)}</td>
                  <td>{item.breedingSeason || "Not provided"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ProbabilityPresence birds={structured} />
    </>
  )
}

function FacilityTable({ items }: { items: IpacFacilitySummary[] }) {
  if (!items.length) {
    return <p className="geospatial-results__status muted">None returned</p>
  }
  return (
    <div className="geospatial-results__table-wrapper">
      <table className="geospatial-results__table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Acres</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td>{renderLinkedName(item.name, item.url)}</td>
              <td>{item.type || "Not provided"}</td>
              <td>{item.acres ? `${item.acres} ac` : "Not provided"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IpacSummaryDetails({ summary }: { summary: IpacSummary }) {
  return (
    <div className="geospatial-results__ipac">
      <p className="geospatial-results__status">
        <strong>Location:</strong> {summary.locationDescription || "Not provided"}
      </p>

      <section className="geospatial-results__subsection">
        <h5>Listed Species</h5>
        <ListedSpeciesSection items={summary.listedSpecies} />
      </section>

      <section className="geospatial-results__subsection">
        <h5>Critical Habitat</h5>
        {renderList(summary.criticalHabitats)}
      </section>

      <section className="geospatial-results__subsection">
        <h5>Migratory Birds</h5>
        <MigratoryBirdsSection items={summary.migratoryBirds} />
      </section>

      <section className="geospatial-results__subsection">
        <h5>Facilities</h5>
        <div className="geospatial-results__facility-grid">
          <div>
            <h6>National Wildlife Refuge Lands</h6>
            <FacilityTable items={summary.refuges ?? []} />
          </div>
          <div>
            <h6>Fish Hatcheries</h6>
            <FacilityTable items={summary.fishHatcheries ?? []} />
          </div>
        </div>
      </section>

      <section className="geospatial-results__subsection">
        <h5>Wetlands</h5>
        {summary.wetlands.length === 0 ? (
          <p className="geospatial-results__status muted">
            None returned. Check the{" "}
            <a href="https://fwsprimary.wim.usgs.gov/wetlands/apps/wetlands-mapper/" target="_blank" rel="noreferrer">
              NWI Wetlands Mapper
            </a>{" "}
            to verify wetland presence.
          </p>
        ) : (
          <div className="geospatial-results__table-wrapper">
            <table className="geospatial-results__table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Code</th>
                  <th scope="col">Acres</th>
                </tr>
              </thead>
              <tbody>
                {summary.wetlands.map((wetland, index) => (
                  <tr key={`${wetland.name}-${index}`}>
                    <td>{wetland.name}</td>
                    <td>{wetland.code || "Not provided"}</td>
                    <td>{wetland.acres ? `${wetland.acres} ac` : "Not provided"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {summary.coastalBarriers?.length ? (
        <section className="geospatial-results__subsection">
          <h5>Coastal Barriers</h5>
          <div className="geospatial-results__table-wrapper">
            <table className="geospatial-results__table">
              <thead>
                <tr>
                  <th scope="col">Name / Code</th>
                  <th scope="col">Type</th>
                  <th scope="col">Fast Acres</th>
                  <th scope="col">Wet Acres</th>
                  <th scope="col">Shore Miles</th>
                </tr>
              </thead>
              <tbody>
                {summary.coastalBarriers.map((barrier, index) => (
                  <tr key={`${barrier.nameOrCode}-${index}`}>
                    <td>{barrier.nameOrCode}</td>
                    <td>{barrier.type || "Not provided"}</td>
                    <td>{barrier.fastAcres || "Not provided"}</td>
                    <td>{barrier.wetAcres || "Not provided"}</td>
                    <td>{barrier.shoreMiles || "Not provided"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export function EnvironmentalMapResult({
  result
}: {
  result?: GeospatialServiceState<EnvironmentalMapSummary>
}) {
  let content: ReactNode
  if (!result || result.status === "idle") {
    content = (
      <p className="geospatial-results__status muted">
        Run the geospatial screen to compose an environmental map.
      </p>
    )
  } else if (result.status === "loading") {
    content = <p className="geospatial-results__status">Composing environmental map…</p>
  } else if (result.status === "error") {
    content = (
      <p className="geospatial-results__status error">
        {result.error ?? "The environmental map could not be generated."}
      </p>
    )
  } else if (result.summary?.url) {
    content = (
      <>
        <div className="environmental-map-frame">
          <iframe
            title={result.summary.title ?? "Environmental screening map"}
            src={result.summary.url}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
        <p className="geospatial-results__status muted">
          Centered at {result.summary.latitude.toFixed(4)}, {result.summary.longitude.toFixed(4)} with a{" "}
          {result.summary.bufferMiles.toFixed(2)} mile map radius.{" "}
          <a href={result.summary.url} target="_blank" rel="noreferrer">
            Open map in a new tab.
          </a>
        </p>
      </>
    )
  } else {
    content = <p className="geospatial-results__status muted">No environmental map URL was returned.</p>
  }

  return (
    <div className="geospatial-results__map" aria-live="polite">
      <h4>Environmental map</h4>
      {content}
    </div>
  )
}

interface GeospatialServiceCardProps<TSummary> {
  title: string
  result: GeospatialServiceState<TSummary>
  renderSummary: (summary: TSummary) => ReactNode
  emptyMessage: string
}

function GeospatialServiceCard<TSummary>({
  title,
  result,
  renderSummary,
  emptyMessage
}: GeospatialServiceCardProps<TSummary>) {
  let content: ReactNode
  switch (result.status) {
    case "loading":
      content = <p className="geospatial-results__status">Running geospatial query…</p>
      break
    case "error":
      content = (
        <p className="geospatial-results__status error">{result.error ?? "The screening request failed."}</p>
      )
      break
    case "success":
      content =
        result.summary !== undefined
          ? renderSummary(result.summary)
          : <p className="geospatial-results__status muted">{emptyMessage}</p>
      break
    default:
      content = <p className="geospatial-results__status muted">{emptyMessage}</p>
      break
  }

  return (
    <div className="geospatial-results__card" aria-live="polite">
      <h4>{title}</h4>
      {content}
    </div>
  )
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) {
    return undefined
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

export function GeospatialResultsPanel({
  geospatialResults,
  title = "Geospatial Screening Results",
  description,
  showNotRun = false
}: {
  geospatialResults: GeospatialResultsState
  title?: string
  description?: ReactNode
  showNotRun?: boolean
}) {
  const lastRunLabel = formatTimestamp(geospatialResults.lastRunAt)
  const nepassistSummary =
    geospatialResults.nepassist.summary ??
    (geospatialResults.nepassist.raw ? summarizeNepassist(geospatialResults.nepassist.raw) : undefined)

  return (
    <div className="geospatial-results">
      <div className="geospatial-results__header">
        <div>
          <h3>{title}</h3>
          {description ? <p className="help-block">{description}</p> : null}
        </div>
        {lastRunLabel || showNotRun ? (
          <span className="geospatial-results__timestamp" aria-live="polite">
            {lastRunLabel ? `Last run ${lastRunLabel}` : "Not yet run"}
          </span>
        ) : null}
      </div>
      {geospatialResults.messages && geospatialResults.messages.length > 0 ? (
        <ul className="geospatial-results__messages">
          {geospatialResults.messages.map((message, index) => (
            <li key={`geospatial-message-${index}`}>{message}</li>
          ))}
        </ul>
      ) : null}
      <div className="geospatial-results__cards">
        <GeospatialServiceCard
          title="NEPA Assist"
          result={{ ...geospatialResults.nepassist, summary: nepassistSummary }}
          renderSummary={(summary) => <NepassistSummaryTable items={summary} />}
          emptyMessage="Run the geospatial screen to request NEPA Assist data."
        />
        <GeospatialServiceCard
          title="IPaC"
          result={geospatialResults.ipac}
          renderSummary={(summary) => <IpacSummaryDetails summary={summary} />}
          emptyMessage="Run the geospatial screen to request IPaC data."
        />
        <EnvironmentalMapResult result={geospatialResults.environmentalMap} />
      </div>
    </div>
  )
}

export function LocationSection({
  title,
  description,
  actions,
  placeholder,
  rows,
  locationText,
  geometry,
  activeUploadFileName,
  enableFileUpload = true,
  onLocationTextChange,
  onLocationGeometryChange,
  geospatialResults,
  onRunGeospatialScreen,
  isRunningGeospatial = false,
  hasGeometry = false,
  bufferMiles = 0.25
}: LocationSectionProps) {
  const handleGeometryChange = useCallback(
    ({ geoJson, latitude, longitude, arcgisJson, source, uploadedFile }: GeometryChange) => {
      onLocationGeometryChange({
        location_object: geoJson,
        location_lat: latitude,
        location_lon: longitude,
        arcgisJson,
        geometrySource: source,
        uploadedFile: source === "upload" ? uploadedFile ?? null : null
      })
    },
    [onLocationGeometryChange]
  )

  const handleClear = useCallback(() => {
    onLocationGeometryChange({
      location_object: undefined,
      location_lat: undefined,
      location_lon: undefined,
      arcgisJson: undefined,
      geometrySource: undefined,
      uploadedFile: null
    })
  }, [onLocationGeometryChange])

  const textareaId = useId()
  const [isCardOpen, setIsCardOpen] = useState(false)

  const status: CollapsibleCardStatus = (() => {
    const missing: string[] = []

    if (!locationText || locationText.trim().length === 0) {
      missing.push("Add a location description")
    }

    if (!geometry || geometry.trim().length === 0) {
      missing.push("Draw or upload a map shape")
    }

    if (missing.length > 0) {
      const text = missing.length === 1 ? missing[0] : `${missing[0]} and ${missing[1]}`
      return { tone: "danger", text }
    }

    return { tone: "success", text: "Location details captured" }
  })()

  return (
    <CollapsibleCard
      className="location-section"
      title={title}
      actions={actions}
      aria-label="Project location details"
      dataAttributes={{
        "data-tour-id": "portal-location",
        "data-tour-title": "Map the project",
        "data-tour-intro":
          "Describe the location and sketch or upload a geometry. The Copilot uses this footprint to generate geospatial checks.",
        "data-tour-step": 2
      }}
      onToggle={setIsCardOpen}
      status={status}
    >
      <div className="location-card">
        <div className="location-card__header">
          <label className="location-card__label" htmlFor={textareaId}>
            {title}
          </label>
          {description ? <p className="help-block">{description}</p> : null}
        </div>
        <textarea
          id={textareaId}
          value={locationText || ""}
          onChange={(event) => onLocationTextChange(event.target.value)}
          placeholder={placeholder}
          className="location-card__textarea"
          rows={rows}
        />
        <div className="location-card__map">
          <div className="location-card__map-header">
            <h4>Draw the project area</h4>
            <button type="button" className="link-button" onClick={handleClear}>
              Clear shape
            </button>
          </div>
          <p className="help-block">
            Search for an address or navigate the map, then draw a point, line, or polygon to capture the
            project footprint.
          </p>
          <ArcgisSketchMap
            geometry={geometry}
            onGeometryChange={handleGeometryChange}
            enableFileUpload={enableFileUpload}
            activeUploadFileName={activeUploadFileName}
            isVisible={isCardOpen}
          />
          <input type="hidden" name="location_object" value={geometry ?? ""} readOnly aria-hidden="true" />
        </div>
        {geospatialResults && onRunGeospatialScreen ? (
          <>
            <GeospatialResultsPanel
              geospatialResults={geospatialResults}
              title="Geospatial Screening Results"
              description={
                <>
                  Composes an environmental map, then runs NEPA Assist and IPaC with a{" "}
                  {bufferMiles.toFixed(2)} mile buffer around the project geometry.
                </>
              }
            />
            <div className="geospatial-results__footer">
              <button
                type="button"
                className="usa-button usa-button--outline secondary"
                onClick={onRunGeospatialScreen}
                disabled={isRunningGeospatial || !hasGeometry}
              >
                {isRunningGeospatial ? "Running geospatial screen…" : "Run geospatial screen"}
              </button>
              {!hasGeometry ? (
                <p className="help-block geospatial-footer__hint">Draw a project geometry to enable the screening tools.</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </CollapsibleCard>
  )
}
