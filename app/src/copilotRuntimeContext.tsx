/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

type CopilotRuntimeMode = "default" | "custom"

type CopilotRuntimeContextValue = {
  runtimeMode: CopilotRuntimeMode
  setRuntimeMode: (mode: CopilotRuntimeMode) => void
}

const CopilotRuntimeContext = createContext<CopilotRuntimeContextValue | undefined>(undefined)

export function CopilotRuntimeProvider({ children }: { children: ReactNode }) {
  const [runtimeMode, setRuntimeMode] = useState<CopilotRuntimeMode>("default")

  const value = useMemo(
    () => ({
      runtimeMode,
      setRuntimeMode
    }),
    [runtimeMode]
  )

  return <CopilotRuntimeContext.Provider value={value}>{children}</CopilotRuntimeContext.Provider>
}

export function useCopilotRuntimeSelection() {
  const context = useContext(CopilotRuntimeContext)
  if (!context) {
    throw new Error("useCopilotRuntimeSelection must be used within a CopilotRuntimeProvider")
  }
  return context
}

export type { CopilotRuntimeMode }
