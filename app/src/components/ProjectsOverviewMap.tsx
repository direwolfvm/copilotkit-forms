import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  convertGeoJsonToEsri,
  ensureArcgisResources,
  focusMapViewOnGeometry,
  getDefaultSymbolForGeometry
} from "./arcgisResources"
import type { ProjectHierarchy } from "../utils/projectPersistence"

type ProjectsOverviewMapProps = {
  projects: ProjectHierarchy[]
  activeProjectId?: number
}

type ArcgisModules = {
  GraphicsLayer: any
  Graphic: any
  geometryJsonUtils: any
}

type ModuleState = {
  layer: any | null
  view: any | null
  modules: ArcgisModules | null
}

export function ProjectsOverviewMap({ projects, activeProjectId }: ProjectsOverviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const moduleStateRef = useRef<ModuleState>({ layer: null, view: null, modules: null })
  const hasFitToProjectsRef = useRef(false)

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

  const updateGraphics = useCallback(() => {
    const state = moduleStateRef.current
    const layer = state.layer
    const view = state.view
    const modules = state.modules

    if (!layer || !view || !modules) {
      return
    }

    const { Graphic, geometryJsonUtils } = modules
    if (!Graphic || !geometryJsonUtils) {
      return
    }

    const newGeometries = new Map<number, any>()
    const graphics: any[] = []

    projects.forEach((entry) => {
      const geometryString = entry.project.geometry
      if (!geometryString) {
        return
      }

      try {
        const parsed = JSON.parse(geometryString)
        const esriJson = convertGeoJsonToEsri(parsed) ?? parsed
        const esriGeometry = geometryJsonUtils.fromJSON(esriJson)
        if (!esriGeometry) {
          return
        }

        const baseSymbol = getDefaultSymbolForGeometry(esriGeometry)
        let symbol: any = baseSymbol ? { ...baseSymbol } : undefined

        if (!symbol) {
          symbol = {
            type: "simple-marker",
            style: "circle",
            color: [56, 134, 196, 1],
            size: 10,
            outline: { color: [255, 255, 255, 1], width: 1 }
          }
        }

        if (symbol && activeProjectId === entry.project.id) {
          if (symbol.type === "simple-marker") {
            symbol = {
              ...symbol,
              size: (symbol.size ?? 10) + 2,
              color: [236, 72, 153, 1],
              outline: { color: [255, 255, 255, 1], width: 2 }
            }
          } else if (symbol.type === "simple-fill") {
            symbol = {
              ...symbol,
              color: [236, 72, 153, 0.18],
              outline: { color: [236, 72, 153, 0.9], width: 2 }
            }
          } else if (symbol.type === "simple-line") {
            symbol = {
              ...symbol,
              color: [236, 72, 153, 1],
              width: Math.max(2, symbol.width ?? 2)
            }
          }
        }

        const graphic = new Graphic({
          geometry: esriGeometry,
          symbol,
          attributes: {
            projectId: entry.project.id,
            title: entry.project.title ?? `Project ${entry.project.id}`
          }
        })

        graphics.push(graphic)
        newGeometries.set(entry.project.id, esriGeometry)
      } catch (error) {
        console.warn("Unable to parse project geometry", error)
      }
    })

    layer.removeAll()
    if (graphics.length > 0) {
      layer.addMany(graphics)
    }

    if (graphics.length > 0) {
      if (activeProjectId && newGeometries.has(activeProjectId)) {
        focusMapViewOnGeometry(view, newGeometries.get(activeProjectId))
      } else if (!hasFitToProjectsRef.current) {
        view.goTo(layer.graphics.toArray()).catch(() => {
          /* noop */
        })
        hasFitToProjectsRef.current = true
      }
    }
  }, [activeProjectId, projects])

  useEffect(() => {
    hasFitToProjectsRef.current = false
  }, [projects.length])

  useEffect(() => {
    updateGraphics()
  }, [updateGraphics])

  const initializeMap = useCallback(() => {
    if (!isReady || !containerRef.current) {
      return
    }

    const requireFn = (window as any).require
    if (typeof requireFn !== "function") {
      return
    }

    let isUnmounted = false

    requireFn(
      ["esri/Map", "esri/views/MapView", "esri/layers/GraphicsLayer", "esri/Graphic", "esri/geometry/support/jsonUtils"],
      (Map: any, MapView: any, GraphicsLayer: any, Graphic: any, geometryJsonUtils: any) => {
        if (isUnmounted || !containerRef.current) {
          return
        }

        const existingState = moduleStateRef.current
        if (existingState.view && !existingState.view.destroyed) {
          updateGraphics()
          return
        }

        const graphicsLayer = new GraphicsLayer()
        const map = new Map({ basemap: "topo-vector", layers: [graphicsLayer] })
        const view = new MapView({
          container: containerRef.current,
          map,
          center: [-98, 39],
          zoom: 4,
          constraints: { snapToZoom: false }
        })

        moduleStateRef.current = {
          layer: graphicsLayer,
          view,
          modules: { GraphicsLayer, Graphic, geometryJsonUtils }
        }

        updateGraphics()
      }
    )

    return () => {
      isUnmounted = true
    }
  }, [isReady, updateGraphics])

  useEffect(() => {
    if (!isReady) {
      return
    }

    const cleanup = initializeMap()
    return () => {
      cleanup?.()
    }
  }, [initializeMap, isReady])

  useEffect(() => {
    return () => {
      const state = moduleStateRef.current
      hasFitToProjectsRef.current = false
      if (state.view) {
        state.view.destroy()
      }
      if (state.layer) {
        state.layer.removeAll()
      }
      moduleStateRef.current = { layer: null, view: null, modules: null }
    }
  }, [])

  const hasGeometries = useMemo(() => {
    return projects.some((entry) => Boolean(entry.project.geometry))
  }, [projects])

  return (
    <div className="projects-overview-map">
      <div className="projects-overview-map__canvas" ref={containerRef}>
        {!isReady ? <div className="projects-overview-map__loading">Loading map…</div> : null}
      </div>
      {!hasGeometries ? (
        <p className="projects-overview-map__empty">Projects without saved locations will not appear on the map.</p>
      ) : null}
    </div>
  )
}
