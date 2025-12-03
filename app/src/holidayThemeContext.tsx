/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

type HolidayThemeContextValue = {
  isChristmasThemeEnabled: boolean
  setChristmasThemeEnabled: (enabled: boolean) => void
}

function getStoredThemePreference(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const storedValue = window.localStorage.getItem("holiday-theme")
  return storedValue === "true"
}

const HolidayThemeContext = createContext<HolidayThemeContextValue | undefined>(undefined)

export function HolidayThemeProvider({ children }: { children: ReactNode }) {
  const [isChristmasThemeEnabled, setChristmasThemeEnabled] = useState<boolean>(() => getStoredThemePreference())

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    window.localStorage.setItem("holiday-theme", isChristmasThemeEnabled ? "true" : "false")
  }, [isChristmasThemeEnabled])

  const value = useMemo(
    () => ({
      isChristmasThemeEnabled,
      setChristmasThemeEnabled
    }),
    [isChristmasThemeEnabled]
  )

  return <HolidayThemeContext.Provider value={value}>{children}</HolidayThemeContext.Provider>
}

export function useHolidayTheme() {
  const context = useContext(HolidayThemeContext)

  if (!context) {
    throw new Error("useHolidayTheme must be used within a HolidayThemeProvider")
  }

  return context
}
