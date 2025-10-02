import { useCallback, useId } from "react"

import type { ProjectFormData } from "../schema/projectSchema"
import { ArcgisSketchMap } from "./ArcgisSketchMap"

interface LocationSectionProps {
  title: string
  description?: string
  placeholder?: string
  rows?: number
  locationText?: string
  geometry?: string
  onLocationTextChange: (value: string) => void
  onLocationGeometryChange: (
    updates: Partial<Pick<ProjectFormData, "location_lat" | "location_lon" | "location_object">>
  ) => void
}

export function LocationSection({
  title,
  description,
  placeholder,
  rows,
  locationText,
  geometry,
  onLocationTextChange,
  onLocationGeometryChange
}: LocationSectionProps) {
  const handleGeometryChange = useCallback(
    ({ geoJson, latitude, longitude }: { geoJson?: string; latitude?: number; longitude?: number }) => {
      onLocationGeometryChange({
        location_object: geoJson,
        location_lat: latitude,
        location_lon: longitude
      })
    },
    [onLocationGeometryChange]
  )

  const handleClear = useCallback(() => {
    onLocationGeometryChange({
      location_object: undefined,
      location_lat: undefined,
      location_lon: undefined
    })
  }, [onLocationGeometryChange])

  const textareaId = useId()

  return (
    <section className="location-section" aria-label="Project location details">
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
          <ArcgisSketchMap geometry={geometry} onGeometryChange={handleGeometryChange} />
        </div>
      </div>
    </section>
  )
}
