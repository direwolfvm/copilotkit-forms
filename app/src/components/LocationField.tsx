import { useCallback } from "react"
import type { Field, FieldProps, RJSFSchema } from "@rjsf/utils"

import type { ProjectFormData } from "../schema/projectSchema"
import { ArcgisSketchMap } from "./ArcgisSketchMap"

interface LocationFieldFormContext {
  updateLocationGeometry?: (update: Partial<Pick<ProjectFormData, "location_lat" | "location_lon" | "location_object">>) => void
  location_object?: string
}

type LocationFieldProps = FieldProps<ProjectFormData["location_text"], RJSFSchema, LocationFieldFormContext>

const LocationFieldComponent: Field<ProjectFormData["location_text"], RJSFSchema, LocationFieldFormContext> = (
  props: LocationFieldProps
) => {
  const { formData, onChange, schema, uiSchema, formContext, onBlur, onFocus, id } = props
  const fieldId = id ?? ""

  const description = schema.description
  const placeholder = uiSchema?.["ui:placeholder"] as string | undefined

  const handleGeometryChange = useCallback(
    ({ geoJson, latitude, longitude }: { geoJson?: string; latitude?: number; longitude?: number }) => {
      formContext?.updateLocationGeometry?.({
        location_object: geoJson,
        location_lat: latitude,
        location_lon: longitude
      })
    },
    [formContext]
  )

  const handleClear = useCallback(() => {
    formContext?.updateLocationGeometry?.({
      location_object: undefined,
      location_lat: undefined,
      location_lon: undefined
    })
  }, [formContext])

  return (
    <div className="location-card">
      <div className="location-card__header">
        <label htmlFor={fieldId} className="location-card__label">
          {schema.title}
        </label>
        {description ? <p className="help-block">{description}</p> : null}
      </div>
      <textarea
        id={fieldId}
        value={formData || ""}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur && fieldId && onBlur(fieldId, event.target.value)}
        onFocus={(event) => onFocus && fieldId && onFocus(fieldId, event.target.value)}
        placeholder={placeholder}
        className="location-card__textarea"
        rows={(uiSchema?.["ui:options"] as { rows?: number } | undefined)?.rows}
      />
      <div className="location-card__map">
        <div className="location-card__map-header">
          <h4>Draw the project area</h4>
          <button type="button" className="link-button" onClick={handleClear}>
            Clear shape
          </button>
        </div>
        <p className="help-block">
          Search for an address or navigate the map, then draw a point, line, or polygon to capture the project footprint.
        </p>
        <ArcgisSketchMap geometry={formContext?.location_object} onGeometryChange={handleGeometryChange} />
      </div>
    </div>
  )
}

export const LocationField = LocationFieldComponent
