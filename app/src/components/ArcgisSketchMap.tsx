import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"

const ARCGIS_JS_URL = "https://js.arcgis.com/4.33/"
const ARCGIS_COMPONENTS_URL = "https://js.arcgis.com/4.32/map-components/"
const ARCGIS_CSS_URL = "https://js.arcgis.com/4.33/esri/themes/light/main.css"

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

function loadStyle(id: string, url: string) {
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
    link.onerror = () => reject(new Error(`Failed to load stylesheet ${url}`))
    document.head.appendChild(link)
  })
}

function ensureArcgisResources() {
  if (!resourcePromise) {
    resourcePromise = Promise.all([
      loadStyle("arcgis-css", ARCGIS_CSS_URL),
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
