const ARCGIS_JS_URL = "https://js.arcgis.com/4.33/"
const ARCGIS_COMPONENTS_URL = "https://js.arcgis.com/4.32/map-components/"
const ARCGIS_CSS_URL = "https://js.arcgis.com/4.33/esri/themes/light/main.css"

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
