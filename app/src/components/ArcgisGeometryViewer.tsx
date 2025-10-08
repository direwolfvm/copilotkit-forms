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
  const graphicsLayerRef = useRef<any>(null)
  const [geometryError, setGeometryError] = useState<string | null>(null)

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
    if (!isReady || !mapView) {
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      return undefined
    }

    let isCancelled = false

    requireFn(["esri/layers/GraphicsLayer"], (GraphicsLayer: any) => {
      if (isCancelled) {
        return
      }

      let layer = graphicsLayerRef.current
      if (!layer && GraphicsLayer) {
        try {
          const LayerCtor = (GraphicsLayer as any)?.default ?? GraphicsLayer
          layer = new LayerCtor()
          graphicsLayerRef.current = layer
        } catch {
          layer = null
        }
      }

      if (!layer) {
        return
      }

      const map = mapView.map
      if (map && typeof map.add === "function") {
        const layers = map.layers
        const alreadyAdded =
          layers?.includes?.(layer) ??
          (layers?.some ? layers.some((existing: any) => existing === layer) : false)
        if (!alreadyAdded) {
          map.add(layer)
        }
      }
    })

    return () => {
      isCancelled = true
      const layer = graphicsLayerRef.current
      if (layer && mapView?.map?.remove) {
        try {
          mapView.map.remove(layer)
        } catch {
          // ignore failures when tearing down the view
        }
      }
      if (graphicsLayerRef.current === layer) {
        graphicsLayerRef.current = null
      }
    }
  }, [isReady, mapView])

  useEffect(() => {
    if (!isReady || !mapView) {
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      return undefined
    }

    let isMounted = true
    setGeometryError(null)

    requireFn(["esri/Graphic", "esri/geometry/support/jsonUtils"], (Graphic: any, geometryJsonUtils: any) => {
      if (!isMounted) {
        return
      }

      const layer = graphicsLayerRef.current
      const target =
        layer && typeof layer.removeAll === "function" && typeof layer.add === "function"
          ? layer
          : mapView.graphics &&
              typeof mapView.graphics.removeAll === "function" &&
              typeof mapView.graphics.add === "function"
            ? mapView.graphics
            : null

      if (!target) {
        if (isMounted) {
          setGeometryError("Unable to render project geometry.")
        }
        return
      }

      if (typeof target.removeAll === "function") {
        target.removeAll()
      }

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
          if (isMounted) {
            setGeometryError("Project geometry could not be parsed.")
          }
          return
        }

        const graphic = new (Graphic as any)({ geometry: esriGeometry })
        applyDefaultSymbolToGraphic(graphic)
        if (typeof target.add === "function") {
          target.add(graphic)
          if (isMounted) {
            setGeometryError(null)
          }
        }
        focusMapViewOnGeometry(mapView, esriGeometry)
      } catch {
        if (isMounted) {
          setGeometryError("Project geometry could not be parsed.")
        }
      }
    })

    return () => {
      isMounted = false
      const layer = graphicsLayerRef.current
      if (layer && typeof layer.removeAll === "function") {
        layer.removeAll()
      } else if (mapView.graphics && typeof mapView.graphics.removeAll === "function") {
        mapView.graphics.removeAll()
      }
    }
  }, [applyDefaultSymbolToGraphic, geometry, isReady, mapView])

  const map = useMemo(() => {
    if (!isReady) {
      return <div className="projects-map__loading">Loading map…</div>
    }
    return createElement("arcgis-map", { basemap: "topo-vector", center: "-98,39", zoom: "4" })
  }, [isReady])

  return (
    <div className="projects-map" ref={containerRef}>
      {map}
      {!geometry && !geometryError ? (
        <p className="projects-map__empty">No project geometry available.</p>
      ) : null}
      {geometryError ? <p className="projects-map__empty">{geometryError}</p> : null}
    </div>
  )
}
