import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent } from "react"

import {
  convertGeoJsonToEsri,
  convertToGeoJsonGeometry,
  ensureArcgisResources,
  focusMapViewOnGeometry,
  getDefaultSymbolForGeometry
} from "./arcgisResources"
import type { GeometryChange, GeometrySource, UploadedGisFile } from "../types/gis"
import { parseUploadedGisFile } from "../utils/kmlConversion"

const DEFAULT_VIEW_CENTER: [number, number] = [-98, 39]
const DEFAULT_VIEW_ZOOM = 3

type ArcgisSketchMapProps = {
  geometry?: string
  onGeometryChange: (change: GeometryChange) => void
  isVisible?: boolean
  hideSketchWidget?: boolean
  enableFileUpload?: boolean
  activeUploadFileName?: string
}

export function ArcgisSketchMap({
  geometry,
  onGeometryChange,
  isVisible = true,
  hideSketchWidget = false,
  enableFileUpload = false,
  activeUploadFileName
}: ArcgisSketchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [mapView, setMapView] = useState<any>(null)
  const [uploadStatus, setUploadStatus] = useState<{ message?: string; error?: string }>({})
  const [isUploading, setIsUploading] = useState(false)
  const isMountedRef = useRef(true)
  const containerClassName = hideSketchWidget ? "location-map location-map--hide-sketch" : "location-map"
  const lastFocusedGeometryRef = useRef<any>(null)

  type UpdateGeometryOptions = {
    source?: GeometrySource
    uploadedFile?: UploadedGisFile | null
    arcgisOverride?: any
    geoJsonOverride?: string
  }

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
      console.error("ArcgisSketchMap: Failed to clear view graphics", error)
    }

    try {
      const promise = mapView.goTo({ center: DEFAULT_VIEW_CENTER, zoom: DEFAULT_VIEW_ZOOM })
      if (promise && typeof promise.catch === "function") {
        promise.catch((error: any) => {
          if (error?.name !== "AbortError") {
            console.error("ArcgisSketchMap: Map view reset failed", error)
          }
        })
      }
    } catch (error) {
      console.error("ArcgisSketchMap: Map view reset threw error", error)
    }

    lastFocusedGeometryRef.current = null
  }, [mapView])

  const updateGeometryFromEsri = useCallback(
    (incomingGeometry: any | undefined, options?: UpdateGeometryOptions) => {
      const source = options?.source

      if (!incomingGeometry) {
        onGeometryChange({
          geoJson: undefined,
          arcgisJson: undefined,
          latitude: undefined,
          longitude: undefined,
          source,
          uploadedFile: source === "upload" ? options?.uploadedFile ?? null : null
        })
        lastFocusedGeometryRef.current = null
        if (source && source !== "upload") {
          setUploadStatus({})
        }
        return
      }

      const requireFn = (window as any).require
      if (!requireFn) {
        console.error("ArcgisSketchMap: updateGeometryFromEsri aborted - require function missing")
        return
      }

      requireFn(
        ["esri/geometry/support/webMercatorUtils", "esri/geometry/support/jsonUtils"],
        (webMercatorUtils: any, geometryJsonUtils: any) => {
          let geographic: any = incomingGeometry
          try {
            if ((incomingGeometry as any).spatialReference?.wkid !== 4326) {
              geographic = webMercatorUtils.webMercatorToGeographic(incomingGeometry)
            }
          } catch {
            geographic = incomingGeometry
          }

          const { geoJson: derivedGeoJson, centroid } = convertToGeoJsonGeometry(geographic)
          const geoJson = options?.geoJsonOverride ?? derivedGeoJson

          let arcgisObject = options?.arcgisOverride
          if (!arcgisObject && geometryJsonUtils && typeof geometryJsonUtils.toJSON === "function") {
            try {
              arcgisObject = geometryJsonUtils.toJSON(geographic ?? incomingGeometry)
            } catch (error) {
              console.error("ArcgisSketchMap: Failed to serialize ArcGIS geometry", error)
              arcgisObject = undefined
            }
          }

          const arcgisJson = arcgisObject ? JSON.stringify(arcgisObject) : undefined
          const uploadedFilePayload = source === "upload" ? options?.uploadedFile ?? null : null

          onGeometryChange({
            geoJson,
            arcgisJson,
            latitude: centroid?.latitude,
            longitude: centroid?.longitude,
            source,
            uploadedFile: uploadedFilePayload
          })
          lastFocusedGeometryRef.current = incomingGeometry
          focusMapViewOnGeometry(mapView, incomingGeometry)

          if (source && source !== "upload") {
            setUploadStatus({})
          }
        }
      )
    },
    [mapView, onGeometryChange, setUploadStatus]
  )

  useEffect(() => {
    let cancelled = false
    ensureArcgisResources()
      .then(() => {
        if (!cancelled) {
          setIsReady(true)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("ArcgisSketchMap: Failed to load ArcGIS resources", error)
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
      const view = event.detail?.view
      if (view && typeof view.goTo === "function") {
        setMapView(view)
      }
    }

    const existingView = mapElement.view
    if (existingView && typeof existingView.goTo === "function") {
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

    const applyFocus = () => {
      const geometry = lastFocusedGeometryRef.current
      if (!geometry) {
        return
      }
      try {
        focusMapViewOnGeometry(mapView, geometry)
      } catch (error) {
        console.error("ArcgisSketchMap: Map view refocus error", error)
      }
    }

    if (typeof mapView.resize === "function") {
      requestAnimationFrame(() => {
        try {
          mapView.resize()
        } catch (error) {
          console.error("ArcgisSketchMap: Map view resize error", error)
        }
        applyFocus()
      })
      return
    }

    applyFocus()
  }, [focusMapViewOnGeometry, isVisible, mapView])

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
        console.error("ArcgisSketchMap: Failed to hide sketch widget", error)
      }
    }

    const handleCreate = (event: CustomEvent) => {
      if (event.detail?.state === "complete") {
        if (event.detail?.graphic) {
          applyDefaultSymbolToGraphic(event.detail.graphic)
        }
        updateGeometryFromEsri(event.detail.graphic?.geometry, { source: "draw", uploadedFile: null })
      }
    }

    const handleUpdate = (event: CustomEvent) => {
      if (event.detail?.state === "complete" && event.detail.graphics?.[0]) {
        event.detail.graphics.forEach((graphic: any) => {
          applyDefaultSymbolToGraphic(graphic)
        })
        updateGeometryFromEsri(event.detail.graphics[0].geometry, { source: "draw", uploadedFile: null })
      }
    }

    const handleDelete = () => {
      updateGeometryFromEsri(undefined, { source: "draw", uploadedFile: null })
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
    if (!isReady || !containerRef.current) {
      return undefined
    }

    const sketchElement = containerRef.current.querySelector("arcgis-sketch") as any
    if (!sketchElement) {
      return undefined
    }

    const layer: any = sketchElement.layer

    if (!geometry) {
      try {
        layer?.graphics?.removeAll?.()
      } catch (error) {
        console.error("ArcgisSketchMap: Failed to clear sketch graphics", error)
      }
      resetMapView()
      if (uploadStatus.message || uploadStatus.error || activeUploadFileName) {
        setUploadStatus({})
      }
      return undefined
    }

    if (!mapView || mapView.destroyed) {
      return undefined
    }

    const requireFn = (window as any).require
    if (!requireFn) {
      return undefined
    }

    requireFn(
      ["esri/Graphic", "esri/geometry/support/jsonUtils"],
      (Graphic: any, geometryJsonUtils: any) => {
        if (!layer) {
          return
        }

        if (typeof layer.removeAll === "function") {
          try {
            layer.removeAll()
          } catch (error) {
            console.error("ArcgisSketchMap: Failed to clear existing sketch graphics", error)
            return
          }
        }

        try {
          const parsed = JSON.parse(geometry)
          if (!parsed) {
            return
          }

          const esriGeometryJson = convertGeoJsonToEsri(parsed)
          const esriGeometry = esriGeometryJson
            ? geometryJsonUtils.fromJSON(esriGeometryJson)
            : geometryJsonUtils.fromJSON(parsed)
          if (!esriGeometry) {
            return
          }
          const graphic = new (Graphic as any)({ geometry: esriGeometry })
          applyDefaultSymbolToGraphic(graphic)
          layer.graphics.add(graphic)

          lastFocusedGeometryRef.current = esriGeometry
          focusMapViewOnGeometry(mapView, esriGeometry)
        } catch (error) {
          console.error("ArcgisSketchMap: Error processing geometry", error)
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
    resetMapView,
    activeUploadFileName,
    setUploadStatus,
    uploadStatus.error,
    uploadStatus.message
  ])

  // Cleanup effect to ensure proper component unmounting
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (mapView) {
        try {
          // Clear any pending operations
          if (mapView.graphics) {
            mapView.graphics.removeAll()
          }
        } catch (error) {
          console.error("ArcgisSketchMap: Cleanup error", error)
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
        updateGeometryFromEsri(geometry, { source: "search", uploadedFile: null })
      }
    }

    const handleSearchComplete = (event: CustomEvent) => {
      const firstResult = event?.detail?.results?.find?.((group: any) => group?.results?.length)
      const geometry = firstResult?.results?.[0]?.feature?.geometry
      if (geometry) {
        updateGeometryFromEsri(geometry, { source: "search", uploadedFile: null })
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

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target
      const file = input.files?.[0]
      input.value = ""

      if (!file || !enableFileUpload) {
        return
      }

      setIsUploading(true)
      setUploadStatus({})

      try {
        await ensureArcgisResources()
        const parsed = await parseUploadedGisFile(file)

        const requireFn = (window as any).require
        if (!requireFn) {
          throw new Error("ArcGIS resources are not yet available. Try again in a moment.")
        }

        requireFn(["esri/geometry/support/jsonUtils"], (geometryJsonUtils: any) => {
          try {
            if (!geometryJsonUtils || typeof geometryJsonUtils.fromJSON !== "function") {
              throw new Error("ArcGIS geometry utilities are unavailable.")
            }

            const esriGeometry = geometryJsonUtils.fromJSON(parsed.arcgisGeometryJson)
            if (!esriGeometry) {
              throw new Error("Unable to create an ArcGIS geometry from the uploaded file.")
            }

            updateGeometryFromEsri(esriGeometry, {
              source: "upload",
              uploadedFile: parsed.uploadedFile,
              arcgisOverride: parsed.arcgisGeometryJson,
              geoJsonOverride: parsed.geoJson
            })

            setUploadStatus({ message: `Uploaded ${file.name}` })
          } catch (callbackError) {
            console.error("ArcgisSketchMap: Failed to apply uploaded geometry", callbackError)
            const message =
              callbackError instanceof Error
                ? callbackError.message
                : "Failed to apply the uploaded geometry."
            setUploadStatus({ error: message })
          }
        })
      } catch (error) {
        console.error("ArcgisSketchMap: Failed to process uploaded file", error)
        const message = error instanceof Error ? error.message : "Unable to process the uploaded file."
        setUploadStatus({ error: message })
      } finally {
        setIsUploading(false)
      }
    },
    [enableFileUpload, setUploadStatus, updateGeometryFromEsri]
  )

  return (
    <div className={containerClassName} ref={containerRef}>
      {map}
      {enableFileUpload ? (
        <div className="location-map__controls" aria-live="polite">
          <label className={`location-map__upload-button${isUploading ? " location-map__upload-button--loading" : ""}`}>
            <span>{isUploading ? "Processing…" : "Upload KML/KMZ/GeoJSON"}</span>
            <input
              type="file"
              accept=".kml,.kmz,.geojson,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json,application/json"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
          {(() => {
            const statusText = uploadStatus.error
              ? uploadStatus.error
              : isUploading
              ? "Processing upload…"
              : uploadStatus.message
              ? uploadStatus.message
              : activeUploadFileName
              ? `Active upload: ${activeUploadFileName}`
              : undefined
            if (!statusText) {
              return null
            }
            const statusClass = uploadStatus.error
              ? "location-map__status location-map__status--error"
              : "location-map__status"
            return <div className={statusClass}>{statusText}</div>
          })()}
        </div>
      ) : null}
    </div>
  )
}

export type { GeometryChange } from "../types/gis"
