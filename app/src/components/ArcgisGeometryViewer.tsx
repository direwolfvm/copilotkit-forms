import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  convertGeoJsonToEsri,
  ensureArcgisResources,
  focusMapViewOnGeometry,
  getDefaultSymbolForGeometry
} from "./arcgisResources"

type ArcgisGeometryViewerProps = {
  geometry?: string | null
}

export function ArcgisGeometryViewer({ geometry }: ArcgisGeometryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [mapView, setMapView] = useState<any>(null)

  const applyDefaultSymbolToGraphic = useCallback((graphic: any) => {
    if (!graphic?.geometry) {
      return
    }
    const symbol = getDefaultSymbolForGeometry(graphic.geometry)
    if (symbol) {
      graphic.symbol = symbol
    }
  }, [])

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

    let isMounted = true

    requireFn(["esri/Graphic", "esri/geometry/support/jsonUtils"], (Graphic: any, geometryJsonUtils: any) => {
      if (!isMounted) {
        return
      }

      const layer: any = sketchElement.layer
      if (!layer) {
        return
      }

      layer.graphics.removeAll()

      if (!geometry) {
        return
      }

      try {
        const parsed = typeof geometry === "string" ? JSON.parse(geometry) : geometry
        const esriGeometryJson = convertGeoJsonToEsri(parsed)
        const esriGeometry = esriGeometryJson
          ? geometryJsonUtils.fromJSON(esriGeometryJson)
          : geometryJsonUtils.fromJSON(parsed)

        if (!esriGeometry) {
          return
        }

        const graphic = new (Graphic as any)({ geometry: esriGeometry })
        applyDefaultSymbolToGraphic(graphic)
        layer.graphics.add(graphic)
        focusMapViewOnGeometry(mapView, esriGeometry)
      } catch {
        // ignore malformed geometry
      }
    })

    return () => {
      isMounted = false
      const layer: any = sketchElement.layer
      if (layer?.graphics) {
        layer.graphics.removeAll()
      }
    }
  }, [applyDefaultSymbolToGraphic, geometry, isReady, mapView])

  const map = useMemo(() => {
    if (!isReady) {
      return <div className="projects-map__loading">Loading map…</div>
    }
    return createElement(
      "arcgis-map",
      { basemap: "topo-vector", center: "-98,39", zoom: "4" },
      createElement("arcgis-sketch", { key: "sketch", style: { display: "none" } })
    )
  }, [isReady])

  return (
    <div className="projects-map" ref={containerRef}>
      {map}
      {!geometry ? <p className="projects-map__empty">No project geometry available.</p> : null}
    </div>
  )
}
