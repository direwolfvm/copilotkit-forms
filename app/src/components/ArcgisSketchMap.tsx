import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"

const ARCGIS_JS_URL = "https://js.arcgis.com/4.33/"
const ARCGIS_COMPONENTS_URL = "https://js.arcgis.com/4.33/map-components/"
const ARCGIS_CSS_URL = "https://js.arcgis.com/4.33/esri/themes/light/main.css"
const ARCGIS_COMPONENTS_CSS_URL =
  "https://js.arcgis.com/4.33/map-components/assets/esri/themes/light/main.css"

type GeometryChange = {
  geoJson?: string
  latitude?: number
  longitude?: number
}

type ArcgisSketchMapProps = {
  geometry?: string
  onGeometryChange: (change: GeometryChange) => void
}

let resourcePromise: Promise<void> | undefined

function cloneSymbolInstance<TSymbol = any>(symbol: TSymbol): TSymbol | undefined {
  if (!symbol) {
    return undefined
  }
  if (typeof (symbol as any).clone === "function") {
    try {
      return (symbol as any).clone()
    } catch {
      // ignore and fall through to shallow copy
    }
  }
  if (typeof symbol === "object") {
    return { ...(symbol as any) }
  }
  return symbol
}

function applyAlphaToColor(color: any, alpha: number) {
  if (!color) {
    return color
  }

  if (typeof color.clone === "function") {
    try {
      const cloned = color.clone()
      if (typeof cloned.a === "number") {
        cloned.a = alpha
        return cloned
      }
      if (Array.isArray(cloned)) {
        const arr = cloned.slice()
        arr[3] = alpha
        return arr
      }
      if (typeof cloned === "object") {
        return { ...cloned, a: alpha, alpha }
      }
      return cloned
    } catch {
      // fall through to other handling strategies
    }
  }

  if (Array.isArray(color)) {
    const arr = color.slice()
    if (arr.length >= 4) {
      arr[3] = alpha
    } else {
      while (arr.length < 3) {
        arr.push(0)
      }
      arr[3] = alpha
    }
    return arr
  }

  if (typeof color === "object") {
    return { ...color, a: alpha, alpha }
  }

  return color
}

function ensurePolygonSymbolTransparency(symbol: any) {
  if (!symbol) {
    return symbol
  }

  if (symbol.color !== undefined) {
    symbol.color = applyAlphaToColor(symbol.color, 0.2)
  } else {
    symbol.color = [0, 0, 0, 0.2]
  }

  if (symbol.outline) {
    const outlineClone = cloneSymbolInstance(symbol.outline)
    if (outlineClone) {
      if (outlineClone.color !== undefined) {
        outlineClone.color = applyAlphaToColor(outlineClone.color, 1)
      }
      symbol.outline = outlineClone
    }
  }

  return symbol
}

function loadScript(
  id: string,
  url: string,
  options: { type?: "module" | "text/javascript" } = {}
) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-arcgis-id="${id}"]`)) {
      resolve()
      return
    }
    const script = document.createElement("script")
    script.src = url
    if (options.type) {
      script.type = options.type
    }
    if (options.type !== "module") {
      script.async = true
    }
    script.dataset.arcgisId = id
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${url}`))
    document.head.appendChild(script)
  })
}

function loadStyle(
  id: string,
  url: string,
  options: { optional?: boolean } = {}
) {
  const { optional = false } = options
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`link[data-arcgis-id="${id}"]`)) {
      resolve()
      return
    }
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = url
    link.dataset.arcgisId = id
    link.onload = () => resolve()
    link.onerror = () => {
      if (optional) {
        console.warn(`Failed to load optional stylesheet ${url}`)
        resolve()
        return
      }
      reject(new Error(`Failed to load stylesheet ${url}`))
    }
    document.head.appendChild(link)
  })
}

function ensureArcgisResources() {
  if (!resourcePromise) {
    resourcePromise = Promise.all([
      loadStyle("arcgis-css", ARCGIS_CSS_URL),

      loadStyle("arcgis-components-css", ARCGIS_COMPONENTS_CSS_URL, { optional: true }),

      loadScript("arcgis-js", ARCGIS_JS_URL)
    ])
      .then(() => loadScript("arcgis-components", ARCGIS_COMPONENTS_URL, { type: "module" }))
      .then(() => undefined)
  }
  return resourcePromise
}

function isClosedRing(ring: number[][]) {
  if (ring.length < 2) {
    return false
  }
  const [firstX, firstY] = ring[0]
  const [lastX, lastY] = ring[ring.length - 1]
  return firstX === lastX && firstY === lastY
}

function computePolygonCentroid(ring: number[][]) {
  const points = isClosedRing(ring) ? ring.slice(0, -1) : ring
  if (points.length === 0) {
    return undefined
  }
  let twiceArea = 0
  let x = 0
  let y = 0
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    const f = x1 * y2 - x2 * y1
    twiceArea += f
    x += (x1 + x2) * f
    y += (y1 + y2) * f
  }
  if (twiceArea === 0) {
    const average = points.reduce(
      (acc, [px, py]) => {
        acc[0] += px
        acc[1] += py
        return acc
      },
      [0, 0]
    )
    return {
      longitude: average[0] / points.length,
      latitude: average[1] / points.length
    }
  }
  const areaFactor = twiceArea * 3
  return {
    longitude: x / areaFactor,
    latitude: y / areaFactor
  }
}

function computePathCentroid(path: number[][]) {
  if (path.length === 0) {
    return undefined
  }
  const sum = path.reduce(
    (acc, [px, py]) => {
      acc[0] += px
      acc[1] += py
      return acc
    },
    [0, 0]
  )
  return {
    longitude: sum[0] / path.length,
    latitude: sum[1] / path.length
  }
}

function convertToGeoJsonGeometry(geometry: any): { geoJson?: string; centroid?: { latitude?: number; longitude?: number } } {
  const type = geometry.type
  if (type === "point") {
    const point = geometry as { x: number; y: number }
    const coordinates: [number, number] = [point.x, point.y]
    return {
      geoJson: JSON.stringify({ type: "Point", coordinates }),
      centroid: { latitude: point.y, longitude: point.x }
    }
  }
  if (type === "polyline") {
    const polyline = geometry as { paths: number[][][] }
    if (!Array.isArray(polyline.paths) || polyline.paths.length === 0) {
      return { geoJson: JSON.stringify({ type: "LineString", coordinates: [] }) }
    }
    const firstPath = polyline.paths[0]
    const isSinglePath = polyline.paths.length === 1 && Array.isArray(firstPath)
    const coordinates = isSinglePath ? firstPath : polyline.paths
    const centroid = isSinglePath && Array.isArray(firstPath) ? computePathCentroid(firstPath) : undefined
    return {
      geoJson: JSON.stringify({
        type: isSinglePath ? "LineString" : "MultiLineString",
        coordinates
      }),
      centroid
    }
  }
  if (type === "polygon") {
    const polygon = geometry as { rings: number[][][] }
    if (!Array.isArray(polygon.rings) || polygon.rings.length === 0) {
      return { geoJson: JSON.stringify({ type: "Polygon", coordinates: [] }) }
    }
    const firstRing = polygon.rings[0]
    return {
      geoJson: JSON.stringify({ type: "Polygon", coordinates: polygon.rings }),
      centroid: firstRing ? computePolygonCentroid(firstRing) : undefined
    }
  }
  return { geoJson: JSON.stringify(geometry.toJSON()) }
}

function convertGeoJsonToEsri(geoJson: any) {
  if (!geoJson || typeof geoJson !== "object") {
    return undefined
  }
  if (geoJson.type === "Feature" && geoJson.geometry) {
    return convertGeoJsonToEsri(geoJson.geometry)
  }
  const spatialReference = { wkid: 4326 }
  switch (geoJson.type) {
    case "Point": {
      const [x, y] = geoJson.coordinates ?? []
      if (typeof x === "number" && typeof y === "number") {
        return { type: "point", x, y, spatialReference }
      }
      break
    }
    case "LineString": {
      if (Array.isArray(geoJson.coordinates)) {
        return { type: "polyline", paths: [geoJson.coordinates], spatialReference }
      }
      break
    }
    case "MultiLineString": {
      if (Array.isArray(geoJson.coordinates)) {
        return { type: "polyline", paths: geoJson.coordinates, spatialReference }
      }
      break
    }
    case "Polygon": {
      if (Array.isArray(geoJson.coordinates)) {
        return { type: "polygon", rings: geoJson.coordinates, spatialReference }
      }
      break
    }
    default:
      break
  }
  return undefined
}

export function ArcgisSketchMap({ geometry, onGeometryChange }: ArcgisSketchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [mapView, setMapView] = useState<any>(null)
  const searchWidgetRef = useRef<any>(null)
  const defaultSymbolsRef = useRef<Record<string, any>>({})
  const shouldPreserveViewRef = useRef(false)
  const pendingGoToRef = useRef<{ target: any; zoom?: number } | null>(null)

  const goToTarget = useCallback(
    (target: any, options: { zoom?: number } = {}) => {
      if (!target) {
        return
      }

      const { zoom } = options
      if (mapView) {
        const goToOptions = typeof zoom === "number" ? { target, zoom } : { target }
        mapView.goTo(goToOptions).catch(() => {})
        return
      }

      pendingGoToRef.current = { target, zoom }
    },
    [mapView]
  )

  useEffect(() => {
    if (!mapView || !pendingGoToRef.current) {
      return
    }

    const { target, zoom } = pendingGoToRef.current
    pendingGoToRef.current = null
    goToTarget(target, { zoom })
  }, [goToTarget, mapView])

  const updateGeometryFromEsri = useCallback(
    (incomingGeometry: any | undefined, options: { preserveView?: boolean } = {}) => {
      if (!incomingGeometry) {
        shouldPreserveViewRef.current = false
        onGeometryChange({ geoJson: undefined, latitude: undefined, longitude: undefined })
        return
      }

      shouldPreserveViewRef.current = !!options.preserveView

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
      console.log("Map view setup: not ready or no container", { isReady, hasContainer: !!containerRef.current })
      return undefined
    }

    console.log("Map view setup: starting, container found")
    
    let cleanupFunctions: (() => void)[] = []
    let isCancelled = false

    const setupMapView = () => {
      if (isCancelled) return

      const mapElement = containerRef.current?.querySelector("arcgis-map") as any
      if (!mapElement) {
        console.log("Map view setup: no arcgis-map element found yet, will retry")
        return false
      }

      console.log("Map view setup: arcgis-map element found", mapElement)

      const handleViewReady = (event: CustomEvent) => {
        console.log("Map view ready event received:", event.detail)
        if (event.detail?.view && !isCancelled) {
          setMapView(event.detail.view)
          console.log("Map view set:", event.detail.view)
        }
      }

      if (mapElement.view && !isCancelled) {
        console.log("Map element already has view:", mapElement.view)
        setMapView(mapElement.view)
        return true
      }

      mapElement.addEventListener("arcgisViewReady", handleViewReady as EventListener)
      cleanupFunctions.push(() => {
        mapElement.removeEventListener("arcgisViewReady", handleViewReady as EventListener)
      })

      // Fallback: check for view periodically in case the event doesn't fire
      const checkForView = () => {
        if (isCancelled) return
        const currentMapElement = containerRef.current?.querySelector("arcgis-map") as any
        if (currentMapElement?.view && !mapView) {
          console.log("Found map view via polling:", currentMapElement.view)
          setMapView(currentMapElement.view)
        }
      }
      
      const intervalId = setInterval(checkForView, 500)
      cleanupFunctions.push(() => clearInterval(intervalId))
      
      const timeoutId = setTimeout(() => {
        clearInterval(intervalId)
        if (!mapView && !isCancelled) {
          console.warn("Map view not ready after 15 seconds")
        }
      }, 15000)
      cleanupFunctions.push(() => clearTimeout(timeoutId))

      return true
    }

    // Try to setup immediately
    if (!setupMapView()) {
      // If map element not found, wait a bit and retry
      console.log("Map view setup: retrying in 100ms")
      const retryTimeout = setTimeout(() => {
        if (!isCancelled) {
          setupMapView()
        }
      }, 100)
      cleanupFunctions.push(() => clearTimeout(retryTimeout))
    }

    return () => {
      isCancelled = true
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }, [isReady, mapView])

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
        updateGeometryFromEsri(event.detail.graphic?.geometry, { preserveView: true })
      }
    }

    const handleUpdate = (event: CustomEvent) => {
      if (event.detail?.state === "complete" && event.detail.graphics?.[0]) {
        updateGeometryFromEsri(event.detail.graphics[0].geometry, { preserveView: true })
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
    if (!isReady || !containerRef.current) {
      return undefined
    }

    const sketchElement = containerRef.current.querySelector("arcgis-sketch") as any
    if (!sketchElement) {
      return undefined
    }

    const updateDefaultSymbols = () => {
      const viewModel = sketchElement?.viewModel
      if (!viewModel) {
        return
      }

      const symbols: Record<string, any> = {}

      const maybeClone = (symbol: any) => {
        if (!symbol) {
          return undefined
        }
        if (typeof symbol.clone === "function") {
          try {
            return symbol.clone()
          } catch {
            return symbol
          }
        }
        return symbol
      }

      symbols.point = maybeClone(viewModel.pointSymbol)
      symbols.multipoint = maybeClone(viewModel.multipointSymbol)
      symbols.polyline = maybeClone(viewModel.polylineSymbol)
      const polygonSymbol = maybeClone(viewModel.polygonSymbol)
      if (polygonSymbol) {
        const transparentPolygon = ensurePolygonSymbolTransparency(polygonSymbol)
        symbols.polygon = transparentPolygon
        try {
          viewModel.polygonSymbol =
            typeof transparentPolygon?.clone === "function"
              ? transparentPolygon.clone()
              : transparentPolygon
        } catch {
          viewModel.polygonSymbol = transparentPolygon
        }
      }

      defaultSymbolsRef.current = {
        ...defaultSymbolsRef.current,
        ...Object.fromEntries(
          Object.entries(symbols).filter(([, value]) => value !== undefined)
        )
      }
    }

    updateDefaultSymbols()

    const handleReady = () => {
      updateDefaultSymbols()
    }

    sketchElement.addEventListener("arcgisReady", handleReady as EventListener)

    return () => {
      sketchElement.removeEventListener("arcgisReady", handleReady as EventListener)
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
          const geometryType = esriGeometry?.type
          let symbol = geometryType ? defaultSymbolsRef.current?.[geometryType] : undefined

          if (!symbol && sketchElement?.viewModel) {
            const viewModel = sketchElement.viewModel
            const candidate =
              geometryType === "point"
                ? viewModel.pointSymbol
                : geometryType === "multipoint"
                ? viewModel.multipointSymbol
                : geometryType === "polyline"
                ? viewModel.polylineSymbol
                : geometryType === "polygon"
                ? viewModel.polygonSymbol
                : undefined

            if (candidate) {
              if (typeof candidate.clone === "function") {
                try {
                  symbol = candidate.clone()
                } catch {
                  symbol = candidate
                }
              } else {
                symbol = candidate
              }
              if (geometryType === "polygon") {
                symbol = ensurePolygonSymbolTransparency(symbol)
              }
              defaultSymbolsRef.current = {
                ...defaultSymbolsRef.current,
                [geometryType]: symbol
              }
            }
          }

          let symbolForGraphic = symbol
          if (symbolForGraphic && typeof (symbolForGraphic as any).clone === "function") {
            try {
              symbolForGraphic = (symbolForGraphic as any).clone()
            } catch {
              // ignore clone errors and fall back to existing symbol instance
            }
          } else if (symbolForGraphic && typeof symbolForGraphic === "object") {
            symbolForGraphic = { ...(symbolForGraphic as any) }
          }

          const graphic = new (Graphic as any)({
            geometry: esriGeometry,
            ...(symbolForGraphic ? { symbol: symbolForGraphic } : {})
          })
          layer.graphics.add(graphic)
          if (shouldPreserveViewRef.current) {
            shouldPreserveViewRef.current = false
          } else {
            goToTarget(esriGeometry)
          }
        } catch {
          // ignore malformed geometry
        }
      }
    )

    return undefined
  }, [geometry, goToTarget, isReady, mapView, onGeometryChange])

  useEffect(() => {
    console.log("Search widget effect triggered:", { isReady, hasMapView: !!mapView })
    
    if (!isReady || !mapView) {
      console.log("Search widget effect: conditions not met", { isReady, mapView })
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      console.warn("ArcGIS require function not available")
      return undefined
    }

    console.log("Search widget: starting initialization")
    let isCancelled = false

    requireFn(["esri/widgets/Search"], (Search: any) => {
      if (isCancelled) {
        console.log("Search widget initialization cancelled")
        return
      }

      console.log("Search widget: Search class loaded, creating widget")
      
      try {
        const searchWidget = new (Search as any)({ 
          view: mapView,
          allPlaceholder: "Search for places or addresses",
          autoComplete: true
        })
        
        console.log("Search widget created:", searchWidget)
        
        // Ensure the map view UI is ready before adding the widget
        if (mapView.ui) {
          mapView.ui.add(searchWidget, { 
            position: "top-left", 
            index: 0 
          })
          console.log("Search widget added to map UI")
        } else {
          console.warn("Map view UI not ready")
        }

        const handles: any[] = []

        const handleSelectResult = searchWidget.on("select-result", (event: any) => {
          console.log("Search result selected:", event)
          const geometry = event?.result?.feature?.geometry
          if (geometry) {
            updateGeometryFromEsri(geometry, { preserveView: true })
            const zoom = geometry?.type === "point" ? 15 : undefined
            goToTarget(geometry, typeof zoom === "number" ? { zoom } : undefined)
          }
        })
        if (handleSelectResult) {
          handles.push(handleSelectResult)
        }

        const handleSearchComplete = searchWidget.on("search-complete", (event: any) => {
          console.log("Search completed:", event)
          const firstResult = event?.results?.find?.((group: any) => group?.results?.length)
          const geometry = firstResult?.results?.[0]?.feature?.geometry
          if (geometry) {
            updateGeometryFromEsri(geometry, { preserveView: true })
            const zoom = geometry?.type === "point" ? 15 : undefined
            goToTarget(geometry, typeof zoom === "number" ? { zoom } : undefined)
          }
        })
        if (handleSearchComplete) {
          handles.push(handleSearchComplete)
        }

        searchWidgetRef.current = {
          widget: searchWidget,
          handles
        }
        
        console.log("Search widget initialization complete")
      } catch (error) {
        console.error("Error creating search widget:", error)
      }
    })

    return () => {
      console.log("Search widget effect cleanup")
      isCancelled = true
      const current = searchWidgetRef.current
      const searchWidget = current?.widget ?? current
      if (current?.handles) {
        current.handles.forEach((handle: any) => {
          try {
            handle?.remove?.()
          } catch (error) {
            console.warn("Error removing handle:", error)
          }
        })
      }
      if (searchWidget) {
        try {
          mapView.ui?.remove?.(searchWidget)
          searchWidget.destroy?.()
        } catch (error) {
          console.warn("Error destroying search widget:", error)
        }
      }
      searchWidgetRef.current = null
    }
  }, [goToTarget, isReady, mapView, updateGeometryFromEsri])

  const map = useMemo(() => {
    if (!isReady) {
      return <div className="location-map__loading">Loading map…</div>
    }
    return createElement(
      "arcgis-map",
      { basemap: "topo-vector", center: "-98,39", zoom: "4" },
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
