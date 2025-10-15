import JSZip from "jszip"
import { kml as parseKmlDocument } from "@tmcw/togeojson"

import { convertGeoJsonToEsri } from "../components/arcgisResources"
import type { UploadedGisFile } from "../types/gis"

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  if (typeof btoa === "function") {
    return btoa(binary)
  }
  const globalBuffer = typeof globalThis !== "undefined" ? (globalThis as any).Buffer : undefined
  if (globalBuffer && typeof globalBuffer.from === "function") {
    return globalBuffer.from(binary, "binary").toString("base64")
  }
  throw new Error("Base64 conversion is not supported in this environment.")
}

function decodeArrayBuffer(buffer: ArrayBuffer): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(buffer)
  }
  const bytes = new Uint8Array(buffer)
  let text = ""
  for (let i = 0; i < bytes.length; i += 1) {
    text += String.fromCharCode(bytes[i])
  }
  return text
}

async function readKmlFromKmz(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const kmlEntry = zip.file(/\.kml$/i)[0]
  if (!kmlEntry) {
    throw new Error("The KMZ archive does not contain a KML file.")
  }
  return kmlEntry.async("string")
}

function parseKmlText(kmlText: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(kmlText, "application/xml")
  const errorNode = doc.querySelector("parsererror")
  if (errorNode) {
    throw new Error("The uploaded KML file is not well-formed XML.")
  }
  const geoJson = parseKmlDocument(doc) as any
  if (!geoJson || geoJson.type !== "FeatureCollection") {
    throw new Error("The uploaded file did not contain any map features.")
  }
  return geoJson
}

function toFeatureCollectionFromGeoJson(input: any): any {
  if (!input || typeof input !== "object") {
    throw new Error("The uploaded GeoJSON file did not contain any map features.")
  }

  const type = typeof input.type === "string" ? input.type.toLowerCase() : ""

  if (type === "featurecollection") {
    return input
  }

  if (type === "feature") {
    return {
      type: "FeatureCollection",
      features: [input]
    }
  }

  if (type === "geometrycollection") {
    const geometries = Array.isArray((input as any).geometries) ? (input as any).geometries : []
    if (geometries.length === 0) {
      throw new Error("The uploaded GeoJSON file did not contain any map features.")
    }
    return {
      type: "FeatureCollection",
      features: geometries.map((geometry: any) => ({
        type: "Feature",
        properties: {},
        geometry
      }))
    }
  }

  if (type) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: input
        }
      ]
    }
  }

  throw new Error("The uploaded GeoJSON file is not a supported GeoJSON structure.")
}

function combineFeatureCollection(featureCollection: any): any {
  const polygons: any[] = []
  const polylines: any[] = []
  const points: any[] = []

  const features = Array.isArray(featureCollection.features) ? featureCollection.features : []

  for (const feature of features) {
    const geometry = feature?.geometry
    if (!geometry || typeof geometry !== "object") {
      continue
    }
    const type = typeof geometry.type === "string" ? geometry.type.toLowerCase() : ""
    if (!type) {
      continue
    }
    switch (type) {
      case "polygon":
        if (Array.isArray(geometry.coordinates)) {
          polygons.push(geometry.coordinates)
        }
        break
      case "multipolygon":
        if (Array.isArray(geometry.coordinates)) {
          for (const polygon of geometry.coordinates) {
            if (Array.isArray(polygon)) {
              polygons.push(polygon)
            }
          }
        }
        break
      case "linestring":
        if (Array.isArray(geometry.coordinates)) {
          polylines.push(geometry.coordinates)
        }
        break
      case "multilinestring":
        if (Array.isArray(geometry.coordinates)) {
          for (const line of geometry.coordinates) {
            if (Array.isArray(line)) {
              polylines.push(line)
            }
          }
        }
        break
      case "point":
        if (Array.isArray(geometry.coordinates)) {
          points.push(geometry.coordinates)
        }
        break
      case "multipoint":
        if (Array.isArray(geometry.coordinates)) {
          for (const point of geometry.coordinates) {
            if (Array.isArray(point)) {
              points.push(point)
            }
          }
        }
        break
      default:
        break
    }
  }

  if (polygons.length > 0) {
    if (polygons.length === 1) {
      return { type: "Polygon", coordinates: polygons[0] }
    }
    return { type: "MultiPolygon", coordinates: polygons }
  }

  if (polylines.length > 0) {
    if (polylines.length === 1) {
      return { type: "LineString", coordinates: polylines[0] }
    }
    return { type: "MultiLineString", coordinates: polylines }
  }

  if (points.length > 0) {
    if (points.length === 1) {
      return { type: "Point", coordinates: points[0] }
    }
    return { type: "MultiPoint", coordinates: points }
  }

  throw new Error("No supported geometries were found in the uploaded file.")
}

export type ParsedGisUpload = {
  geoJson: string
  arcgisGeometryJson: any
  arcgisJson: string
  uploadedFile: UploadedGisFile
}

export async function parseUploadedGisFile(file: File): Promise<ParsedGisUpload> {
  const extensionMatch = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)
  const extension = extensionMatch ? extensionMatch[1] : undefined
  const mimeType = file.type ? file.type.toLowerCase() : undefined
  let format: UploadedGisFile["format"] = "kml"
  if (extension === "kmz") {
    format = "kmz"
  } else if (extension === "geojson" || extension === "json") {
    format = "geojson"
  } else if (mimeType === "application/geo+json" || mimeType === "application/vnd.geo+json") {
    format = "geojson"
  }

  const buffer = await file.arrayBuffer()
  const base64Data = arrayBufferToBase64(buffer)

  let geometry: any

  if (format === "geojson") {
    let geoJsonText: string
    try {
      geoJsonText = decodeArrayBuffer(buffer)
    } catch {
      throw new Error("Unable to read the uploaded GeoJSON file.")
    }

    let parsedGeoJson: any
    try {
      parsedGeoJson = JSON.parse(geoJsonText)
    } catch {
      throw new Error("The uploaded GeoJSON file is not valid JSON.")
    }

    const featureCollection = toFeatureCollectionFromGeoJson(parsedGeoJson)
    geometry = combineFeatureCollection(featureCollection)
  } else {
    const kmlText =
      format === "kmz"
        ? await readKmlFromKmz(buffer)
        : decodeArrayBuffer(buffer)

    const featureCollection = parseKmlText(kmlText)
    geometry = combineFeatureCollection(featureCollection)
  }

  const arcgisGeometryJson = convertGeoJsonToEsri(geometry)
  if (!arcgisGeometryJson) {
    throw new Error("The uploaded geometry could not be converted to an ArcGIS shape.")
  }

  const geoJson = JSON.stringify(geometry)
  const arcgisJson = JSON.stringify(arcgisGeometryJson)

  const uploadedFile: UploadedGisFile = {
    format,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || undefined,
    base64Data,
    lastModified: file.lastModified || undefined
  }

  return {
    geoJson,
    arcgisGeometryJson,
    arcgisJson,
    uploadedFile
  }
}
