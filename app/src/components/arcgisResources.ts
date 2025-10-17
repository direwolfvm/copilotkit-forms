const ARCGIS_VERSION = "4.32"
const ARCGIS_JS_URL = `https://js.arcgis.com/${ARCGIS_VERSION}/`
const ARCGIS_COMPONENTS_URL = `https://js.arcgis.com/map-components/${ARCGIS_VERSION}/arcgis-map-components.esm.js`
const ARCGIS_CSS_URL = `https://js.arcgis.com/${ARCGIS_VERSION}/esri/themes/light/main.css`

type ArcgisSymbol = Record<string, any>

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

export function ensureArcgisResources() {
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

export function convertToGeoJsonGeometry(geometry: any) {
  const type = geometry?.type
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
  if (type === "multipoint") {
    const multipoint = geometry as { points: number[][] }
    const points = Array.isArray(multipoint.points) ? multipoint.points.filter((point) => Array.isArray(point)) : []
    if (points.length === 0) {
      return { geoJson: JSON.stringify({ type: "MultiPoint", coordinates: [] }) }
    }
    if (points.length === 1) {
      const [x, y] = points[0]
      return {
        geoJson: JSON.stringify({ type: "Point", coordinates: points[0] }),
        centroid: { longitude: x, latitude: y }
      }
    }
    const centroid = computePathCentroid(points)
    return {
      geoJson: JSON.stringify({ type: "MultiPoint", coordinates: points }),
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
  if (geometry?.toJSON) {
    return { geoJson: JSON.stringify(geometry.toJSON()) }
  }
  return { geoJson: JSON.stringify(geometry ?? {}) }
}

export function convertGeoJsonToEsri(geoJson: any) {
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
    case "MultiPoint": {
      if (Array.isArray(geoJson.coordinates)) {
        return { type: "multipoint", points: geoJson.coordinates, spatialReference }
      }
      break
    }
    case "MultiPolygon": {
      if (Array.isArray(geoJson.coordinates)) {
        const rings: number[][][] = []
        for (const polygon of geoJson.coordinates) {
          if (Array.isArray(polygon)) {
            for (const ring of polygon) {
              if (Array.isArray(ring)) {
                rings.push(ring)
              }
            }
          }
        }
        return { type: "polygon", rings, spatialReference }
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

const POLYGON_SYMBOL: ArcgisSymbol = {
  type: "simple-fill",
  color: [56, 134, 196, 0.1],
  outline: { color: [56, 134, 196, 1], width: 2 }
}

const POLYLINE_SYMBOL: ArcgisSymbol = {
  type: "simple-line",
  color: [56, 134, 196, 1],
  width: 2
}

const POINT_SYMBOL: ArcgisSymbol = {
  type: "simple-marker",
  style: "circle",
  color: [56, 134, 196, 1],
  size: 10,
  outline: { color: [255, 255, 255, 1], width: 1 }
}

function cloneSymbol(symbol: ArcgisSymbol): ArcgisSymbol {
  const copy: ArcgisSymbol = { ...symbol }
  if (symbol.outline && typeof symbol.outline === "object") {
    copy.outline = { ...(symbol.outline as Record<string, unknown>) }
  }
  return copy
}

export function getDefaultSymbolForGeometry(geometry: any): ArcgisSymbol | undefined {
  const type = geometry?.type
  if (type === "polygon") {
    return cloneSymbol(POLYGON_SYMBOL)
  }
  if (type === "polyline") {
    return cloneSymbol(POLYLINE_SYMBOL)
  }
  if (type === "point" || type === "multipoint") {
    return cloneSymbol(POINT_SYMBOL)
  }
  return undefined
}

export function focusMapViewOnGeometry(view: any, geometry: any) {
  if (!view || typeof view.goTo !== "function" || !geometry) {
    return
  }

  const target = geometry.extent ?? geometry

  const ZOOM_DELTA = 2
  const MAX_ZOOM_LEVEL = 18
  const MIN_TARGET_ZOOM = 8
  const EXTENT_CONTRACT_RATIO = 0.75

  const applyZoomBoost = () => {
    if (!view || view.destroyed) {
      return
    }

    try {
      const geometryType = geometry?.type ?? geometry?.geometryType

      if (target && typeof target.clone === 'function' && typeof target.expand === 'function') {
        const cloned = target.clone()
        const contracted = cloned.expand(EXTENT_CONTRACT_RATIO)
        const extentPromise = view.goTo(contracted, { duration: 600 })
        if (extentPromise && typeof extentPromise.catch === 'function') {
          extentPromise.catch((error: any) => {
            if (error?.name !== 'AbortError') {
              console.error('focusMapViewOnGeometry: Extent zoom boost failed', error)
            }
          })
        }
        return
      }

      const currentZoom = typeof view.zoom === 'number' ? view.zoom : undefined
      const desiredZoom = Math.min(
        Math.max(currentZoom ? currentZoom + ZOOM_DELTA : MIN_TARGET_ZOOM, MIN_TARGET_ZOOM),
        MAX_ZOOM_LEVEL
      )

      const center = geometryType === 'point' || geometryType === 'multipoint' ? geometry : view.center
      if (center) {
        const zoomPromise = view.goTo({ center, zoom: desiredZoom }, { duration: 600 })
        if (zoomPromise && typeof zoomPromise.catch === 'function') {
          zoomPromise.catch((error: any) => {
            if (error?.name !== 'AbortError') {
              console.error('focusMapViewOnGeometry: Center zoom boost failed', error)
            }
          })
        }
      }
    } catch (error) {
      console.error('focusMapViewOnGeometry: Zoom boost threw error', error)
    }
  }

  const execute = () => {
    try {
      const promise = view.goTo(target, { duration: 1000 })
      if (promise && typeof promise.catch === "function") {
        promise
          .then(() => {
            applyZoomBoost()
          })
          .catch((error: any) => {
            console.error('focusMapViewOnGeometry: goTo failed', error)
          })
        return
      }
      applyZoomBoost()
    } catch (error) {
      console.error('focusMapViewOnGeometry: goTo threw error:', error)
    }
  }

  if (view.ready) {
    execute()
    return
  }

  if (typeof view.when === "function") {
    const result = view.when(() => {
      execute()
    })
    if (result && typeof result.catch === "function") {
      result.catch((error: any) => {
        console.error('focusMapViewOnGeometry: view.when() failed', error)
      })
    }
    return
  }

  execute()
  applyZoomBoost()
}
