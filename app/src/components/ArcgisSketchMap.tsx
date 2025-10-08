import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  convertGeoJsonToEsri,
  convertToGeoJsonGeometry,
  ensureArcgisResources
} from "./arcgisResources"

type GeometryChange = {
  geoJson?: string
  latitude?: number
  longitude?: number
}

type ArcgisSketchMapProps = {
  geometry?: string
  onGeometryChange: (change: GeometryChange) => void
}

export function ArcgisSketchMap({ geometry, onGeometryChange }: ArcgisSketchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [mapView, setMapView] = useState<any>(null)

  const updateGeometryFromEsri = useCallback(
    (incomingGeometry: any | undefined) => {
      if (!incomingGeometry) {
        onGeometryChange({ geoJson: undefined, latitude: undefined, longitude: undefined })
        return
      }

      const requireFn = (window as any).require
      if (!requireFn) {
        return
      }

      requireFn([
        "esri/geometry/support/webMercatorUtils"
      ], (webMercatorUtils: any) => {
        let geographic: any = incomingGeometry
        try {
          if ((incomingGeometry as any).spatialReference?.wkid !== 4326) {
            geographic = webMercatorUtils.webMercatorToGeographic(incomingGeometry)
          }
        } catch {
          geographic = incomingGeometry
        }

        const { geoJson, centroid } = convertToGeoJsonGeometry(geographic)
        onGeometryChange({
          geoJson,
          latitude: centroid?.latitude,
          longitude: centroid?.longitude
        })
      })
    },
    [onGeometryChange]
  )

  useEffect(() => {
    let cancelled = false
    ensureArcgisResources()
      .then(() => {
        if (!cancelled) {
          setIsReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsReady(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isReady || !containerRef.current) {
      return undefined
    }

    const mapElement = containerRef.current.querySelector("arcgis-map") as any
    if (!mapElement) {
      return undefined
    }

    const handleViewReady = (event: CustomEvent) => {
      if (event.detail?.view) {
        setMapView(event.detail.view)
      }
    }

    if (mapElement.view) {
      setMapView(mapElement.view)
    }

    mapElement.addEventListener("arcgisViewReady", handleViewReady as EventListener)

    return () => {
      mapElement.removeEventListener("arcgisViewReady", handleViewReady as EventListener)
    }
  }, [isReady])

  useEffect(() => {
    if (!isReady || !containerRef.current) {
      return undefined
    }
    const sketchElement = containerRef.current.querySelector("arcgis-sketch") as any
    if (!sketchElement) {
      return undefined
    }

    const handleCreate = (event: CustomEvent) => {
      if (event.detail?.state === "complete") {
        updateGeometryFromEsri(event.detail.graphic?.geometry)
      }
    }

    const handleUpdate = (event: CustomEvent) => {
      if (event.detail?.state === "complete" && event.detail.graphics?.[0]) {
        updateGeometryFromEsri(event.detail.graphics[0].geometry)
      }
    }

    const handleDelete = () => {
      updateGeometryFromEsri(undefined)
    }

    sketchElement.addEventListener("arcgisCreate", handleCreate as EventListener)
    sketchElement.addEventListener("arcgisUpdate", handleUpdate as EventListener)
    sketchElement.addEventListener("arcgisDelete", handleDelete as EventListener)

    return () => {
      sketchElement.removeEventListener("arcgisCreate", handleCreate as EventListener)
      sketchElement.removeEventListener("arcgisUpdate", handleUpdate as EventListener)
      sketchElement.removeEventListener("arcgisDelete", handleDelete as EventListener)
    }
  }, [isReady, updateGeometryFromEsri])

  useEffect(() => {
    if (!isReady || !mapView || !containerRef.current) {
      return undefined
    }
    const sketchElement = containerRef.current.querySelector("arcgis-sketch") as any
    if (!sketchElement) {
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      return undefined
    }

    requireFn(
      ["esri/Graphic", "esri/geometry/support/jsonUtils"],
      (Graphic: any, geometryJsonUtils: any) => {
        const layer: any = sketchElement.layer
        if (!layer) {
          return
        }
        layer.graphics.removeAll()
        if (!geometry) {
          return
        }
        try {
          const parsed = JSON.parse(geometry)
          const esriGeometryJson = convertGeoJsonToEsri(parsed)
          const esriGeometry = esriGeometryJson
            ? geometryJsonUtils.fromJSON(esriGeometryJson)
            : geometryJsonUtils.fromJSON(parsed)
          if (!esriGeometry) {
            return
          }
          const graphic = new (Graphic as any)({ geometry: esriGeometry })
          layer.graphics.add(graphic)
          mapView.goTo(esriGeometry).catch(() => {})
        } catch {
          // ignore malformed geometry
        }
      }
    )

    return undefined
  }, [geometry, isReady, mapView, onGeometryChange])

  useEffect(() => {
    if (!isReady || !containerRef.current) {
      return undefined
    }
    const searchElement = containerRef.current.querySelector("arcgis-search") as any
    if (!searchElement) {
      return undefined
    }

    const handleSelectResult = (event: CustomEvent) => {
      const geometry = event?.detail?.result?.feature?.geometry
      if (geometry) {
        updateGeometryFromEsri(geometry)
      }
    }

    const handleSearchComplete = (event: CustomEvent) => {
      const firstResult = event?.detail?.results?.find?.((group: any) => group?.results?.length)
      const geometry = firstResult?.results?.[0]?.feature?.geometry
      if (geometry) {
        updateGeometryFromEsri(geometry)
      }
    }

    searchElement.addEventListener("arcgisSelectResult", handleSelectResult as EventListener)
    searchElement.addEventListener("arcgisSearchComplete", handleSearchComplete as EventListener)

    return () => {
      searchElement.removeEventListener("arcgisSelectResult", handleSelectResult as EventListener)
      searchElement.removeEventListener("arcgisSearchComplete", handleSearchComplete as EventListener)
    }
  }, [isReady, updateGeometryFromEsri])

  const map = useMemo(() => {
    if (!isReady) {
      return <div className="location-map__loading">Loading map…</div>
    }
    return createElement(
      "arcgis-map",
      { basemap: "topo-vector", center: "-98,39", zoom: "4" },
      createElement("arcgis-search", { slot: "widgets", position: "top-left", key: "search" }),
      createElement("arcgis-sketch", {
        key: "sketch",
        "creation-mode": "single",
        position: "top-right"
      })
    )
  }, [isReady])

  return (
    <div className="location-map" ref={containerRef}>
      {map}
    </div>
  )
}

export type { GeometryChange }
