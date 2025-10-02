import type { HTMLAttributes } from "react"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "arcgis-map": HTMLAttributes<HTMLElement>
      "arcgis-search": HTMLAttributes<HTMLElement>
      "arcgis-sketch": HTMLAttributes<HTMLElement>
    }
  }
}

export {}
