import { useEffect, useRef, useState } from "react"
import type { Feature, FeatureCollection, Geometry } from "geojson"
import L from "leaflet"

import "leaflet/dist/leaflet.css"

type LeafletGeometryViewerProps = {
  geometry?: string | null
}

const DEFAULT_CENTER: L.LatLngExpression = [39, -98]
const DEFAULT_ZOOM = 4
const MAX_FIT_ZOOM = 16

function normalizeGeoJson(
  value: unknown
): Feature | FeatureCollection | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const typed = value as Feature | FeatureCollection | Geometry

  if (typed.type === "FeatureCollection") {
    return typed as FeatureCollection
  }

  if (typed.type === "Feature" && "geometry" in typed) {
    return typed as Feature
  }

  if ("type" in typed && "coordinates" in typed) {
    const geometry = typed as Geometry
    return {
      type: "Feature",
      geometry,
      properties: {}
    }
  }

  return null
}

export function LeafletGeometryViewer({ geometry }: LeafletGeometryViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geometryLayerRef = useRef<L.GeoJSON | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [geometryError, setGeometryError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return undefined
    }

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true
    })

    mapRef.current = map

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)

    map.whenReady(() => {
      setMapReady(true)
      // Allow the map to size itself after being inserted into the DOM
      setTimeout(() => {
        map.invalidateSize()
      }, 0)
    })

    return () => {
      setMapReady(false)
      geometryLayerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapReady) {
      return
    }

    const map = mapRef.current
    if (!map) {
      return
    }

    if (geometryLayerRef.current) {
      map.removeLayer(geometryLayerRef.current)
      geometryLayerRef.current = null
    }

    setGeometryError(null)

    if (!geometry) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }

    try {
      const parsed = typeof geometry === "string" ? JSON.parse(geometry) : geometry
      const normalized = normalizeGeoJson(parsed)

      if (!normalized) {
        setGeometryError("Project geometry could not be parsed.")
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
        return
      }

      const layer = L.geoJSON(normalized, {
        style: () => ({
          color: "#1f4f99",
          weight: 2,
          fillColor: "#1f4f99",
          fillOpacity: 0.1
        }),
        pointToLayer: (_feature, latlng) =>
          L.circleMarker(latlng, {
            radius: 6,
            color: "#1f4f99",
            weight: 2,
            fillColor: "#1f4f99",
            fillOpacity: 0.8
          })
      })

      geometryLayerRef.current = layer
      layer.addTo(map)

      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.1), { maxZoom: MAX_FIT_ZOOM })
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      }
    } catch (error) {
      console.error("Failed to render project geometry", error)
      setGeometryError("Project geometry could not be parsed.")
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    }
  }, [geometry, mapReady])

  return (
    <div className="projects-map">
      <div ref={containerRef} className="projects-map__leaflet" />
      {!geometry && !geometryError ? (
        <p className="projects-map__empty">No project geometry available.</p>
      ) : null}
      {geometryError ? <p className="projects-map__empty">{geometryError}</p> : null}
    </div>
  )
}

