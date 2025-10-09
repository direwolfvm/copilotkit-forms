import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  convertGeoJsonToEsri,
  convertToGeoJsonGeometry,
  ensureArcgisResources,
  focusMapViewOnGeometry,
  getDefaultSymbolForGeometry
} from "./arcgisResources"

const DEFAULT_MAP_CENTER = [-98, 39] as const
const DEFAULT_MAP_ZOOM = 4

type GeometryChange = {
  geoJson?: string
  latitude?: number
  longitude?: number
}

type ArcgisSketchMapProps = {
  geometry?: string
  onGeometryChange: (change: GeometryChange) => void
  isVisible?: boolean
}

export function ArcgisSketchMap({ geometry, onGeometryChange, isVisible = true }: ArcgisSketchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [mapView, setMapView] = useState<any>(null)
  const isMountedRef = useRef(true)

  // Debug: Track component state
  const componentId = useRef(`sketch-${Math.random().toString(36).slice(2, 8)}`)
  const previousGeometryRef = useRef<string | undefined>(geometry)
  const pendingResetRef = useRef(false)
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
  }, [applyDefaultSymbolToGraphic, isReady, updateGeometryFromEsri])

  useEffect(() => {
    const hadGeometry = Boolean(previousGeometryRef.current)
    const hasGeometry = Boolean(geometry)

    if (hadGeometry && !hasGeometry) {
      pendingResetRef.current = true
    } else if (hasGeometry) {
      pendingResetRef.current = false
    }

    previousGeometryRef.current = geometry
  }, [geometry])

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
    
    if (!isReady || !mapView || !containerRef.current || mapView.destroyed || !geometry) {
      console.log(`[${componentId.current}] Not ready for geometry processing:`, {
        mounted: isMountedRef.current,
        ready: isReady,
        hasMapView: !!mapView,
        hasContainer: !!containerRef.current,
        mapViewDestroyed: mapView?.destroyed,
        hasGeometry: !!geometry
      })
      return undefined
    }

    console.log(`[${componentId.current}] All conditions met - processing geometry immediately`)
    
    const sketchElement = containerRef.current.querySelector("arcgis-sketch") as any
    if (!sketchElement) {
      console.log(`[${componentId.current}] No sketch element found`)
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      console.log(`[${componentId.current}] No require function available`)
      return undefined
    }

    // Process immediately, don't wait for async operations
    requireFn(
      ["esri/Graphic", "esri/geometry/support/jsonUtils"],
      (Graphic: any, geometryJsonUtils: any) => {
        const layer: any = sketchElement.layer
        if (!layer) {
          console.log(`[${componentId.current}] No layer found on sketch element`)
          return
        }
        
        console.log(`[${componentId.current}] Clearing existing graphics`)
        layer.graphics.removeAll()
        
        try {
          console.log(`[${componentId.current}] Processing geometry:`, geometry.slice(0, 100) + '...')
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
          
          // Zoom immediately - don't check mounted state since we're processing synchronously
          console.log(`[${componentId.current}] Attempting immediate zoom to geometry`, {
            hasMapView: !!mapView,
            mapViewReady: mapView?.ready,
            mapViewDestroyed: mapView?.destroyed
          })
          
          // Try zoom regardless of ready state - let focusMapViewOnGeometry handle the validation
          if (mapView && !mapView.destroyed) {
            console.log(`[${componentId.current}] Map view exists, calling focusMapViewOnGeometry`)
            focusMapViewOnGeometry(mapView, esriGeometry)
          } else {
            console.log(`[${componentId.current}] Map view missing or destroyed, skipping zoom`)
          }
        } catch (error) {
          console.error(`[${componentId.current}] Error processing geometry:`, error)
        }
      }
    )

    return undefined
  }, [applyDefaultSymbolToGraphic, focusMapViewOnGeometry, geometry, isReady, mapView])

  useEffect(() => {
    if (!pendingResetRef.current) {
      return
    }

    console.log(`[${componentId.current}] Reset requested after geometry cleared`, {
      hasMapView: !!mapView,
      mapViewDestroyed: mapView?.destroyed
    })

    const sketchElement = containerRef.current?.querySelector("arcgis-sketch") as any
    const layer = sketchElement?.layer

    if (layer?.graphics?.removeAll) {
      try {
        layer.graphics.removeAll()
      } catch (error) {
        console.log(`[${componentId.current}] Error clearing sketch layer:`, error)
      }
    }

    if (!mapView || mapView.destroyed) {
      return
    }

    pendingResetRef.current = false

    try {
      mapView.graphics?.removeAll?.()
    } catch (error) {
      console.log(`[${componentId.current}] Error clearing map view graphics:`, error)
    }

    if (typeof mapView.popup?.close === "function") {
      try {
        mapView.popup.close()
      } catch (error) {
        console.log(`[${componentId.current}] Error closing popup during reset:`, error)
      }
    }

    const target = { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM }
    if (typeof mapView.goTo === "function") {
      Promise.resolve(mapView.goTo(target)).catch((error: unknown) => {
        console.log(`[${componentId.current}] Failed to reset map view:`, error)
      })
    } else {
      try {
        mapView.center = DEFAULT_MAP_CENTER
        mapView.zoom = DEFAULT_MAP_ZOOM
      } catch (error) {
        console.log(`[${componentId.current}] Error setting map view defaults:`, error)
      }
    }
  }, [geometry, mapView])

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
      { basemap: "topo-vector", center: DEFAULT_MAP_CENTER.join(","), zoom: String(DEFAULT_MAP_ZOOM) },
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
