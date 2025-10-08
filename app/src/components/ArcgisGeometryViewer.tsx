import { createElement, useEffect, useMemo, useRef, useState } from "react"

import { convertGeoJsonToEsri, ensureArcgisResources } from "./arcgisResources"

type ArcgisGeometryViewerProps = {
  geometry?: string | null
}

export function ArcgisGeometryViewer({ geometry }: ArcgisGeometryViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [mapView, setMapView] = useState<any>(null)
  const graphicsLayerRef = useRef<any>(null)

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
      ["esri/Graphic", "esri/layers/GraphicsLayer", "esri/geometry/support/jsonUtils"],
      (Graphic: any, GraphicsLayer: any, geometryJsonUtils: any) => {
        if (!isMounted) {
          return
        }

        if (!graphicsLayerRef.current) {
          graphicsLayerRef.current = new (GraphicsLayer as any)()
          mapView.map.add(graphicsLayerRef.current)
        }

        const layer = graphicsLayerRef.current
        layer.removeAll()

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
          layer.add(graphic)
          mapView.goTo(esriGeometry).catch(() => {})
        } catch {
          // ignore malformed geometry
        }
      }
    )

    return () => {
      isMounted = false
      if (graphicsLayerRef.current && mapView?.map) {
        mapView.map.remove(graphicsLayerRef.current)
        graphicsLayerRef.current = null
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
