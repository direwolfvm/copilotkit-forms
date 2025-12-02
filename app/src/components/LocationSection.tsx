import { useCallback, useId } from "react"

import type { ProjectFormData } from "../schema/projectSchema"
import { ArcgisSketchMap } from "./ArcgisSketchMap"
import type { GeometryChange, GeometrySource, UploadedGisFile } from "../types/gis"
import { CollapsibleCard } from "./CollapsibleCard"

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
}

type LocationGeometryUpdates =
  Partial<Pick<ProjectFormData, "location_lat" | "location_lon" | "location_object">> & {
    arcgisJson?: string
    geometrySource?: GeometrySource
    uploadedFile?: UploadedGisFile | null
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
  onLocationGeometryChange
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

  return (
    <CollapsibleCard
      className="location-section"
      title={title}
      aria-label="Project location details"
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
          />
          <input type="hidden" name="location_object" value={geometry ?? ""} readOnly aria-hidden="true" />
        </div>
      </div>
    </CollapsibleCard>
  )
}
