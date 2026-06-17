/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type SeasonalTheme = "none" | "christmas" | "july4" | "unicorn"

type HolidayThemeContextValue = {
  seasonalTheme: SeasonalTheme
  setSeasonalTheme: (theme: SeasonalTheme) => void
}

const STORAGE_KEY = "seasonal-theme"
const LEGACY_STORAGE_KEY = "holiday-theme"
const DATA_ATTRIBUTE = "data-seasonal-theme"

const VALID_THEMES: readonly SeasonalTheme[] = ["none", "christmas", "july4", "unicorn"]

function isSeasonalTheme(value: string | null): value is SeasonalTheme {
  return value !== null && (VALID_THEMES as readonly string[]).includes(value)
}

function getStoredThemePreference(): SeasonalTheme {
  if (typeof window === "undefined") {
    return "none"
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY)
  if (isSeasonalTheme(storedValue)) {
    return storedValue
  }

  // Migrate the legacy boolean Christmas toggle to the new selection model.
  const legacyValue = window.localStorage.getItem(LEGACY_STORAGE_KEY)
  if (legacyValue === "true") {
    return "christmas"
  }

  return "none"
}

function applySeasonalTheme(theme: SeasonalTheme) {
  if (typeof document === "undefined") {
    return
  }

  if (theme === "none") {
    document.documentElement.removeAttribute(DATA_ATTRIBUTE)
  } else {
    document.documentElement.setAttribute(DATA_ATTRIBUTE, theme)
  }
}

const HolidayThemeContext = createContext<HolidayThemeContextValue | undefined>(undefined)

export function HolidayThemeProvider({ children }: { children: ReactNode }) {
  const [seasonalTheme, setSeasonalTheme] = useState<SeasonalTheme>(() => {
    const storedTheme = getStoredThemePreference()
    applySeasonalTheme(storedTheme)
    return storedTheme
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, seasonalTheme)
    }

    applySeasonalTheme(seasonalTheme)
  }, [seasonalTheme])

  const value = useMemo(
    () => ({
      seasonalTheme,
      setSeasonalTheme
    }),
    [seasonalTheme]
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
