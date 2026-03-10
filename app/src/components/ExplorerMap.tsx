import { createElement, useEffect, useMemo, useRef, useState } from "react"
import { ensureArcgisResources } from "./arcgisResources"

type ExplorerMapProject = {
  id: number
  title?: string | null
  locationLat?: number | null
  locationLon?: number | null
  currentStatus?: string | null
}

type ExplorerMapProps = {
  projects: ExplorerMapProject[]
  onProjectClick?: (projectId: number) => void
}

export function ExplorerMap({ projects, onProjectClick }: ExplorerMapProps) {
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

    const handleViewReadyChange = () => {
      if (mapElement.view) {
        setMapView(mapElement.view)
      }
    }

    if (mapElement.view) {
      setMapView(mapElement.view)
    }

    mapElement.addEventListener("arcgisViewReadyChange", handleViewReadyChange)

    return () => {
      mapElement.removeEventListener("arcgisViewReadyChange", handleViewReadyChange)
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
          // ignore teardown errors
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

    requireFn(
      ["esri/Graphic", "esri/geometry/Point", "esri/symbols/SimpleMarkerSymbol", "esri/PopupTemplate"],
      (Graphic: any, Point: any, SimpleMarkerSymbol: any, PopupTemplate: any) => {
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
          return
        }

        if (typeof target.removeAll === "function") {
          target.removeAll()
        }

        const GraphicCtor = (Graphic as any)?.default ?? Graphic
        const PointCtor = (Point as any)?.default ?? Point
        const SymbolCtor = (SimpleMarkerSymbol as any)?.default ?? SimpleMarkerSymbol
        const PopupCtor = (PopupTemplate as any)?.default ?? PopupTemplate

        const symbol = new SymbolCtor({
          color: [14, 124, 102, 0.85],
          outline: { color: [255, 255, 255, 0.9], width: 1.2 },
          size: "8px"
        })

        const popupTemplate = new PopupCtor({
          title: "{title}",
          content: "{status}"
        })

        const mappableProjects = projects.filter(
          (p) => typeof p.locationLat === "number" && typeof p.locationLon === "number"
        )

        for (const project of mappableProjects) {
          const point = new PointCtor({
            longitude: project.locationLon,
            latitude: project.locationLat
          })

          const graphic = new GraphicCtor({
            geometry: point,
            symbol,
            attributes: {
              id: project.id,
              title: project.title ?? `Project ${project.id}`,
              status: project.currentStatus ?? "Unknown"
            },
            popupTemplate
          })

          if (typeof target.add === "function") {
            target.add(graphic)
          }
        }
      }
    )

    return () => {
      isMounted = false
      const layer = graphicsLayerRef.current
      if (layer && typeof layer.removeAll === "function") {
        layer.removeAll()
      } else if (mapView.graphics && typeof mapView.graphics.removeAll === "function") {
        mapView.graphics.removeAll()
      }
    }
  }, [isReady, mapView, projects])

  useEffect(() => {
    if (!mapView || !onProjectClick) {
      return undefined
    }

    const handler = mapView.on?.("click", (event: any) => {
      mapView.hitTest(event).then((response: any) => {
        const result = response?.results?.[0]
        if (result?.graphic?.attributes?.id) {
          onProjectClick(result.graphic.attributes.id)
        }
      })
    })

    return () => {
      handler?.remove?.()
    }
  }, [mapView, onProjectClick])

  const map = useMemo(() => {
    if (!isReady) {
      return <div className="explorer-map__loading">Loading map…</div>
    }
    return createElement("arcgis-map", { basemap: "topo-vector", center: "-98,39", zoom: "4" })
  }, [isReady])

  return (
    <div className="explorer-map" ref={containerRef}>
      {map}
    </div>
  )
}
