import { createElement, useEffect, useMemo, useRef, useState } from "react"

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
  const hasGraphicsRef = useRef(false)

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
    if (!mapView) {
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      return undefined
    }

    let isMounted = true

    requireFn(
      ["esri/Graphic", "esri/geometry/support/jsonUtils"],
      (Graphic: any, geometryJsonUtils: any) => {
        if (!isMounted) {
          return
        }

        const graphics = mapView.graphics
        if (!graphics) {
          return
        }

        graphics.removeAll()
        hasGraphicsRef.current = false

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

          const symbol = getDefaultSymbolForGeometry(esriGeometry)
          const graphic = new (Graphic as any)({ geometry: esriGeometry })
          if (symbol) {
            graphic.symbol = symbol
          }
          graphics.add(graphic)
          hasGraphicsRef.current = true
          focusMapViewOnGeometry(mapView, esriGeometry)
        } catch {
          // ignore malformed geometry
        }
      }
    )

    return () => {
      isMounted = false
      if (hasGraphicsRef.current && mapView?.graphics) {
        mapView.graphics.removeAll()
        hasGraphicsRef.current = false
      }
    }
  }, [geometry, mapView])

  const map = useMemo(() => {
    if (!isReady) {
      return <div className="projects-map__loading">Loading map…</div>
    }
    return createElement("arcgis-map", { basemap: "topo-vector", center: "-98,39", zoom: "4" })
  }, [isReady])

  return (
    <div className="projects-map" ref={containerRef}>
      {map}
      {!geometry ? <p className="projects-map__empty">No project geometry available.</p> : null}
    </div>
  )
}
