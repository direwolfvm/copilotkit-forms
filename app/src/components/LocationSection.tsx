import { useCallback, useId, useState } from "react"
import type { ReactNode } from "react"

import type { ProjectFormData } from "../schema/projectSchema"
import { ArcgisSketchMap } from "./ArcgisSketchMap"
import type { GeometryChange, GeometrySource, UploadedGisFile } from "../types/gis"
import type {
  GeospatialResultsState,
  GeospatialServiceState,
  IpacSummary,
  NepassistSummaryItem
} from "../types/geospatial"
import { CollapsibleCard, type CollapsibleCardStatus } from "./CollapsibleCard"

interface LocationSectionProps {
  title: string
  description?: string
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

function NepassistSummaryTable({ items }: { items: NepassistSummaryItem[] }) {
  if (!items.length) {
    return <p className="geospatial-results__status muted">No NEPA Assist findings returned.</p>
  }

  return (
    <div className="geospatial-results__table-wrapper">
      <table className="geospatial-results__table">
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.question}-${index}`}>
              <td>{item.question}</td>
              <td>{item.displayAnswer}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function IpacSummaryDetails({ summary }: { summary: IpacSummary }) {
  const wetlands = summary.wetlands
  return (
    <div className="geospatial-results__ipac">
      <ul>
        <li>
          <strong>Location</strong>: {summary.locationDescription || "Not provided"}
        </li>
        <li>
          <strong>Listed species</strong>: {renderList(summary.listedSpecies)}
        </li>
        <li>
          <strong>Critical habitat</strong>:{" "}
          {renderList(summary.criticalHabitats)}
        </li>
        <li>
          <strong>Migratory birds of concern</strong>:{" "}
          {renderList(summary.migratoryBirds)}
        </li>
        <li>
          <strong>Wetlands</strong>:{" "}
          {wetlands.length === 0 ? (
            <span className="geospatial-results__status muted">None returned</span>
          ) : (
            <ul>
              {wetlands.map((wetland, index) => (
                <li key={`${wetland.name}-${index}`}>
                  {wetland.name}
                  {wetland.acres ? ` – ${wetland.acres} ac` : null}
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>
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

export function LocationSection({
  title,
  description,
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
          <div className="geospatial-results">
            <div className="geospatial-results__header">
              <div>
                <h3>Geospatial screening</h3>
                <p className="help-block">
                  Runs NEPA Assist and IPaC with a {bufferMiles.toFixed(2)} mile buffer around the project geometry.
                </p>
              </div>
              {geospatialResults.lastRunAt ? (
                <span className="geospatial-results__timestamp" aria-live="polite">
                  Last run {formatTimestamp(geospatialResults.lastRunAt)}
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
                result={geospatialResults.nepassist}
                renderSummary={(summary) => <NepassistSummaryTable items={summary} />}
                emptyMessage="Run the geospatial screen to request NEPA Assist data."
              />
              <GeospatialServiceCard
                title="IPaC"
                result={geospatialResults.ipac}
                renderSummary={(summary) => <IpacSummaryDetails summary={summary} />}
                emptyMessage="Run the geospatial screen to request IPaC data."
              />
            </div>
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
          </div>
        ) : null}
      </div>
    </CollapsibleCard>
  )
}
