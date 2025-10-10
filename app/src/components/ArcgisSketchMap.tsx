import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  convertGeoJsonToEsri,
  convertToGeoJsonGeometry,
  ensureArcgisResources,
  focusMapViewOnGeometry,
  getDefaultSymbolForGeometry
} from "./arcgisResources"

const DEFAULT_VIEW_CENTER: [number, number] = [-98, 39]
const DEFAULT_VIEW_ZOOM = 3

type GeometryChange = {
  geoJson?: string
  latitude?: number
  longitude?: number
}

type ArcgisSketchMapProps = {
  geometry?: string
  onGeometryChange: (change: GeometryChange) => void
  isVisible?: boolean
  hideSketchWidget?: boolean
}

export function ArcgisSketchMap({
  geometry,
  onGeometryChange,
  isVisible = true,
  hideSketchWidget = false
}: ArcgisSketchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [mapView, setMapView] = useState<any>(null)
  const isMountedRef = useRef(true)
  const containerClassName = hideSketchWidget ? "location-map location-map--hide-sketch" : "location-map"

  // Debug: Track component state
  const componentId = useRef(`sketch-${Math.random().toString(36).slice(2, 8)}`)
  console.log(`[${componentId.current}] ArcgisSketchMap render:`, {
    geometry: !!geometry,
    geometryLength: geometry?.length,
    isReady,
    hasMapView: !!mapView,
    isVisible
  })



  const applyDefaultSymbolToGraphic = useCallback((graphic: any) => {
    if (!graphic?.geometry) {
      return
    }
    const symbol = getDefaultSymbolForGeometry(graphic.geometry)
    if (symbol) {
      graphic.symbol = symbol
    }
  }, [])

  const resetMapView = useCallback(() => {
    if (!mapView || mapView.destroyed) {
      return
    }

    try {
      if (mapView.graphics && typeof mapView.graphics.removeAll === "function") {
        mapView.graphics.removeAll()
      }
    } catch (error) {
      console.log(`[${componentId.current}] Failed to clear view graphics:`, error)
    }

    try {
      const promise = mapView.goTo({ center: DEFAULT_VIEW_CENTER, zoom: DEFAULT_VIEW_ZOOM })
      if (promise && typeof promise.catch === "function") {
        promise.catch((error: any) => {
          if (error?.name !== "AbortError") {
            console.log(`[${componentId.current}] Map view reset failed:`, error)
          }
        })
      }
    } catch (error) {
      console.log(`[${componentId.current}] Map view reset threw error:`, error)
    }
  }, [mapView])

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
        focusMapViewOnGeometry(mapView, incomingGeometry)
      })
    },
    [mapView, onGeometryChange]
  )

  useEffect(() => {
    let cancelled = false
    console.log(`[${componentId.current}] Loading ArcGIS resources`)
    ensureArcgisResources()
      .then(() => {
        if (!cancelled) {
          console.log(`[${componentId.current}] ArcGIS resources loaded`)
          setIsReady(true)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(`[${componentId.current}] Failed to load ArcGIS resources:`, error)
          setIsReady(false)
        }
      })
    return () => {
      cancelled = true
      console.log(`[${componentId.current}] Cleanup: ArcGIS resources loading cancelled`)
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
      console.log(`[${componentId.current}] Map view ready event:`, !!event.detail?.view)
      const view = event.detail?.view
      if (view && typeof view.goTo === "function") {
        setMapView(view)
      }
    }

    const existingView = mapElement.view
    if (existingView && typeof existingView.goTo === "function") {
      console.log(`[${componentId.current}] Map element already has ready view:`, !!existingView)
      setMapView(existingView)
    }

    mapElement.addEventListener("arcgisViewReady", handleViewReady as EventListener)

    return () => {
      mapElement.removeEventListener("arcgisViewReady", handleViewReady as EventListener)
    }
  }, [isReady])

  useEffect(() => {
    if (!mapView || mapView.destroyed || !isVisible) {
      return
    }

    if (typeof mapView.resize === "function") {
      requestAnimationFrame(() => {
        try {
          mapView.resize()
          console.log(`[${componentId.current}] Map view resized after visibility change`)
        } catch (error) {
          console.log(`[${componentId.current}] Map view resize error:`, error)
        }
      })
    }
  }, [isVisible, mapView])

  useEffect(() => {
    if (!isReady || !containerRef.current) {
      return undefined
    }
    const sketchElement = containerRef.current.querySelector("arcgis-sketch") as any
    if (!sketchElement) {
      return undefined
    }

    if (hideSketchWidget) {
      try {
        if (sketchElement.visible !== false) {
          sketchElement.visible = false
        }
        if (sketchElement.style) {
          sketchElement.style.setProperty("display", "none")
          sketchElement.style.setProperty("visibility", "hidden")
        }
        const widget = sketchElement.widget
        if (widget && widget.visible !== false) {
          widget.visible = false
        }
        const widgetContainer = widget?.container as HTMLElement | undefined
        if (widgetContainer) {
          widgetContainer.style.setProperty("display", "none")
          widgetContainer.style.setProperty("visibility", "hidden")
        }
      } catch (error) {
        console.log(`[${componentId.current}] Failed to hide sketch widget:`, error)
      }
    }

    const handleCreate = (event: CustomEvent) => {
      if (event.detail?.state === "complete") {
        if (event.detail?.graphic) {
          applyDefaultSymbolToGraphic(event.detail.graphic)
        }
        updateGeometryFromEsri(event.detail.graphic?.geometry)
      }
    }

    const handleUpdate = (event: CustomEvent) => {
      if (event.detail?.state === "complete" && event.detail.graphics?.[0]) {
        event.detail.graphics.forEach((graphic: any) => {
          applyDefaultSymbolToGraphic(graphic)
        })
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
  }, [applyDefaultSymbolToGraphic, hideSketchWidget, isReady, mapView, updateGeometryFromEsri])

  // Process geometry synchronously when conditions are met
  useEffect(() => {
    console.log(`[${componentId.current}] Geometry effect triggered:`, { 
      isReady, 
      hasMapView: !!mapView, 
      hasContainer: !!containerRef.current,
      hasGeometry: !!geometry,
      mapViewReady: mapView?.ready,
      mapViewDestroyed: mapView?.destroyed
    })
    
    if (!isReady || !containerRef.current) {
      console.log(`[${componentId.current}] Geometry effect skipped - map not ready`)
      return undefined
    }

    const sketchElement = containerRef.current.querySelector("arcgis-sketch") as any
    if (!sketchElement) {
      console.log(`[${componentId.current}] Geometry effect skipped - no sketch element`)
      return undefined
    }

    const layer: any = sketchElement.layer

    if (!geometry) {
      console.log(`[${componentId.current}] Geometry cleared - resetting map`)
      try {
        layer?.graphics?.removeAll?.()
      } catch (error) {
        console.log(`[${componentId.current}] Failed to clear sketch graphics:`, error)
      }
      resetMapView()
      return undefined
    }

    if (!mapView || mapView.destroyed) {
      console.log(`[${componentId.current}] Geometry effect waiting for map view`, {
        hasMapView: !!mapView,
        destroyed: mapView?.destroyed
      })
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      console.log(`[${componentId.current}] No require function available`)
      return undefined
    }

    console.log(`[${componentId.current}] Processing incoming geometry`)

    requireFn(
      ["esri/Graphic", "esri/geometry/support/jsonUtils"],
      (Graphic: any, geometryJsonUtils: any) => {
        if (!layer) {
          console.log(`[${componentId.current}] No layer found on sketch element`)
          return
        }

        console.log(`[${componentId.current}] Clearing existing graphics`)
        layer.graphics.removeAll()

        try {
          console.log(`[${componentId.current}] Processing geometry:`, geometry.slice(0, 100) + "...")
          const parsed = JSON.parse(geometry)
          const esriGeometryJson = convertGeoJsonToEsri(parsed)
          const esriGeometry = esriGeometryJson
            ? geometryJsonUtils.fromJSON(esriGeometryJson)
            : geometryJsonUtils.fromJSON(parsed)
          if (!esriGeometry) {
            console.log(`[${componentId.current}] Failed to create Esri geometry`)
            return
          }
          console.log(`[${componentId.current}] Adding graphic to layer`)
          const graphic = new (Graphic as any)({ geometry: esriGeometry })
          applyDefaultSymbolToGraphic(graphic)
          layer.graphics.add(graphic)

          console.log(`[${componentId.current}] Focusing map on geometry`)
          focusMapViewOnGeometry(mapView, esriGeometry)
        } catch (error) {
          console.error(`[${componentId.current}] Error processing geometry:`, error)
        }
      }
    )

    return undefined
  }, [
    applyDefaultSymbolToGraphic,
    focusMapViewOnGeometry,
    geometry,
    isReady,
    mapView,
    resetMapView
  ])

  // Cleanup effect to ensure proper component unmounting
  useEffect(() => {
    return () => {
      console.log(`[${componentId.current}] Component unmounting`)
      isMountedRef.current = false
      if (mapView) {
        try {
          // Clear any pending operations
          if (mapView.graphics) {
            mapView.graphics.removeAll()
          }
        } catch (error) {
          console.log(`[${componentId.current}] Cleanup error:`, error)
        }
      }
    }
  }, [mapView])

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
    <div className={containerClassName} ref={containerRef}>
      {map}
    </div>
  )
}

export type { GeometryChange }
