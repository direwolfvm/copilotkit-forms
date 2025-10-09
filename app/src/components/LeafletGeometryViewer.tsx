import { useEffect, useRef, useState } from "react"
import type { Feature, GeoJsonObject, Geometry } from "geojson"
import L, { type GeoJSON, type LatLng, type Map as LeafletMap } from "leaflet"
import "leaflet/dist/leaflet.css"
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png"
import markerIconUrl from "leaflet/dist/images/marker-icon.png"
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png"

const DEFAULT_CENTER: [number, number] = [39, -98]
const DEFAULT_ZOOM = 4

let leafletIconsConfigured = false
function ensureLeafletIconsConfigured() {
  if (leafletIconsConfigured) {
    return
  }
  leafletIconsConfigured = true
  const DefaultIcon = L.Icon.Default as typeof L.Icon.Default & {
    prototype: { _getIconUrl?: () => string }
  }

  if (DefaultIcon?.prototype?._getIconUrl) {
    delete DefaultIcon.prototype._getIconUrl
  }

  DefaultIcon.mergeOptions({
    iconRetinaUrl: markerIcon2xUrl,
    iconUrl: markerIconUrl,
    shadowUrl: markerShadowUrl
  })
}

type LeafletGeometryViewerProps = {
  geometry?: string | GeoJsonObject | null
}

export function LeafletGeometryViewer({ geometry }: LeafletGeometryViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerRef = useRef<GeoJSON | null>(null)
  const [geometryError, setGeometryError] = useState<string | null>(null)

  useEffect(() => {
    ensureLeafletIconsConfigured()
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }

    if (!geometry) {
      setGeometryError(null)
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false })
      return
    }

    try {
      const parsedGeometry: GeoJsonObject =
        typeof geometry === "string" ? (JSON.parse(geometry) as GeoJsonObject) : geometry

      const geoJsonLayer = L.geoJSON(parsedGeometry, {
        style: () => ({
          color: "#1f4f99",
          weight: 2,
          fillColor: "#5da9ff",
          fillOpacity: 0.3
        }),
        pointToLayer: (_feature: Feature<Geometry>, latlng: LatLng) =>
          L.circleMarker(latlng, {
            radius: 6,
            fillColor: "#1f4f99",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
          })
      })

      if (geoJsonLayer.getLayers().length === 0) {
        setGeometryError("Project geometry could not be parsed.")
        return
      }

      geoJsonLayer.addTo(map)
      layerRef.current = geoJsonLayer
      setGeometryError(null)

      const bounds = geoJsonLayer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2), { maxZoom: 16 })
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false })
      }
    } catch (error) {
      console.error("Failed to render project geometry with Leaflet", error)
      setGeometryError("Project geometry could not be parsed.")
    }
  }, [geometry])

  return (
    <div className="projects-map">
      <div className="projects-map__viewport" ref={containerRef} />
      {!geometry && !geometryError ? (
        <p className="projects-map__empty">No project geometry available.</p>
      ) : null}
      {geometryError ? <p className="projects-map__empty">{geometryError}</p> : null}
    </div>
  )
}
