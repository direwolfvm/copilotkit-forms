import { useEffect, useRef, useState } from "react"
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom"

import "./App.css"
import HomePage from "./HomePage"
import PortalPage from "./PortalPage"
import { ProjectsPage } from "./ProjectsPage"
import ResourceCheckPage from "./ResourceCheckPage"
import DeveloperToolsPage from "./DeveloperToolsPage"
import SettingsPage from "./SettingsPage"
import AboutPage from "./AboutPage"
import AnalyticsPage from "./AnalyticsPage"
import ResourcesPage from "./ResourcesPage"
import PermitStartPage from "./PermitStartPage"
import ComplexReviewStartPage from "./ComplexReviewStartPage"
import { PermitInfoPage } from "./PermitInfoPage"
import ResourcesHubPage from "./ResourcesHubPage"
import PortalHubPage from "./PortalHubPage"
import { useHolidayTheme } from "./holidayThemeContext"
import Snowfall from "./components/Snowfall"

function Layout() {
  const bannerRef = useRef<HTMLElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const bannerVisibleHeightRef = useRef<number | undefined>(undefined)
  const dropdownCloseTimeoutRef = useRef<number | null>(null)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<"resources" | "portal" | null>(null)
  const location = useLocation()
  const { isChristmasThemeEnabled } = useHolidayTheme()
  const isResourcesSection =
    location.pathname.startsWith("/resources") || location.pathname.startsWith("/resource-check")
  const isPortalSection =
    location.pathname.startsWith("/portal") ||
    location.pathname === "/projects" ||
    location.pathname === "/analytics"

  const clearDropdownCloseTimeout = () => {
    if (dropdownCloseTimeoutRef.current !== null) {
      window.clearTimeout(dropdownCloseTimeoutRef.current)
      dropdownCloseTimeoutRef.current = null
    }
  }

  const openNavDropdown = (dropdown: "resources" | "portal") => {
    clearDropdownCloseTimeout()
    setOpenDropdown(dropdown)
  }

  const scheduleCloseNavDropdown = () => {
    clearDropdownCloseTimeout()
    dropdownCloseTimeoutRef.current = window.setTimeout(() => {
      setOpenDropdown(null)
    }, 220)
  }

  const closeNavDropdown = () => {
    clearDropdownCloseTimeout()
    setOpenDropdown(null)
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const root = document.documentElement
    const updateLayoutMetrics = (visibleBannerHeight?: number) => {
      const bannerHeight = bannerRef.current?.offsetHeight ?? 0
      const headerHeight = headerRef.current?.offsetHeight ?? 0

      if (typeof visibleBannerHeight === "number") {
        bannerVisibleHeightRef.current = visibleBannerHeight
      }

      const storedVisibleHeight = bannerVisibleHeightRef.current
      const effectiveBannerHeight =
        typeof visibleBannerHeight === "number"
          ? visibleBannerHeight
          : typeof storedVisibleHeight === "number"
            ? storedVisibleHeight
            : bannerHeight

      if (typeof storedVisibleHeight !== "number") {
        bannerVisibleHeightRef.current = effectiveBannerHeight
      }

      root.style.setProperty("--site-banner-height", `${Math.max(0, effectiveBannerHeight)}px`)
      root.style.setProperty("--site-header-height", `${headerHeight}px`)
    }

    updateLayoutMetrics()

    const banner = bannerRef.current
    const header = headerRef.current
    const observers: ResizeObserver[] = []

    if (typeof ResizeObserver !== "undefined") {
      if (banner) {
        const observer = new ResizeObserver(() => {
          updateLayoutMetrics()
        })
        observer.observe(banner)
        observers.push(observer)
      }

      if (header) {
        const observer = new ResizeObserver(() => {
          updateLayoutMetrics()
        })
        observer.observe(header)
        observers.push(observer)
      }
    }

    const handleResize = () => {
      updateLayoutMetrics()
    }

    window.addEventListener("resize", handleResize)

    let intersectionObserver: IntersectionObserver | undefined
    let handleScroll: (() => void) | undefined

    if (banner && typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const visibleHeight =
              entry.isIntersecting || entry.intersectionRatio > 0
                ? entry.intersectionRect.height
                : 0
            updateLayoutMetrics(visibleHeight)
          })
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] }
      )
      intersectionObserver.observe(banner)
    } else if (banner) {
      handleScroll = () => {
        const rect = banner.getBoundingClientRect()
        const clampedTop = Math.min(Math.max(rect.top, 0), window.innerHeight)
        const clampedBottom = Math.min(Math.max(rect.bottom, 0), window.innerHeight)
        const visibleHeight = Math.max(0, clampedBottom - clampedTop)
        updateLayoutMetrics(visibleHeight)
      }
      window.addEventListener("scroll", handleScroll)
    }

    return () => {
      observers.forEach((observer) => observer.disconnect())
      window.removeEventListener("resize", handleResize)
      intersectionObserver?.disconnect()
      if (handleScroll) {
        window.removeEventListener("scroll", handleScroll)
      }
    }
  }, [])

  useEffect(() => {
    setIsNavOpen(false)
    closeNavDropdown()
  }, [location.pathname])

  useEffect(() => {
    return () => {
      clearDropdownCloseTimeout()
    }
  }, [])

  useEffect(() => {
    if (!isNavOpen || typeof window === "undefined") {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNavOpen(false)
        closeNavDropdown()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isNavOpen])

  return (
    <div className="site-shell">
      {isChristmasThemeEnabled ? <Snowfall /> : null}
      <section ref={bannerRef} className="site-banner" aria-label="Website disclaimer">
        <div className="site-banner__inner">
          <div className="site-banner__bar">
            <span className="site-banner__icon" aria-hidden="true">
              <svg
                className="site-banner__icon-graphic"
                viewBox="0 0 24 24"
                role="img"
                focusable="false"
                aria-hidden="true"
              >
                <path d="M12 1.75a4.75 4.75 0 0 0-4.75 4.75v2.5H6.5A2.75 2.75 0 0 0 3.75 11.75v7.5A2.75 2.75 0 0 0 6.5 22h11a2.75 2.75 0 0 0 2.75-2.75v-7.5A2.75 2.75 0 0 0 17.5 9.25h-.75v-2.5A4.75 4.75 0 0 0 12 1.75Zm-3.25 4.75a3.25 3.25 0 0 1 6.5 0v2.5h-6.5Zm8.75 4H6.5c-.69 0-1.25.56-1.25 1.25v7.5c0 .69.56 1.25 1.25 1.25h11c.69 0 1.25-.56 1.25-1.25v-7.5c0-.69-.56-1.25-1.25-1.25Z" />
              </svg>
            </span>
            <p className="site-banner__message">
              <strong>This is NOT a US government website at all</strong>, but it’s still safe to be here!
            </p>
            <details className="site-banner__details">
              <summary className="site-banner__summary">Here’s how you know</summary>
              <div className="site-banner__content">
                <p>
                  HelpPermitMe is a demonstration project and uses a custom domain instead of a
                  <code>.gov</code> address.
                </p>
                <ul>
                  <li>
                    Even without <code>.gov</code>, the <strong>https://</strong> prefix shows your connection is
                    encrypted.
                  </li>
                  <li>A lock icon next to the URL means your browser verified this site’s security certificate.</li>
                </ul>
              </div>
            </details>
          </div>
        </div>
      </section>
      <header ref={headerRef} className="site-header">
        <div className="site-header__inner">
          <div className="site-header__brand">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? "site-header__brand-link site-header__brand-link--active"
                  : "site-header__brand-link"
              }
            >
              <span className="site-header__title">HelpPermitMe</span>
              <span className="site-header__tagline">(an unofficial demo)</span>
            </NavLink>
          </div>
          <button
            type="button"
            className="site-nav-toggle"
            aria-expanded={isNavOpen}
            aria-controls="site-nav-primary"
            onClick={() => {
              setIsNavOpen((previous) => !previous)
            }}
          >
            <span className="site-nav-toggle__icon" aria-hidden="true">
              <span className="site-nav-toggle__bar" />
              <span className="site-nav-toggle__bar" />
              <span className="site-nav-toggle__bar" />
            </span>
            <span className="site-nav-toggle__label">{isNavOpen ? "Close" : "Menu"}</span>
          </button>
          <nav
            id="site-nav-primary"
            className={`site-nav${isNavOpen ? " site-nav--open" : ""}`}
            aria-label="Primary"
          >
            {isChristmasThemeEnabled ? (
              <span className="site-nav__holiday" aria-hidden="true" role="img">
                ❄️ 🎄 🎅 🎁 ❄️
              </span>
            ) : null}
            <NavLink
              to="/about"
              data-tour="nav-link"
              data-tour-title="About HelpPermitMe"
              data-tour-intro="Learn about the purpose of this demo experience."
              className={({ isActive }) =>
                isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
              }
            >
              About
            </NavLink>
            <div
              className={`site-nav__dropdown${openDropdown === "resources" ? " site-nav__dropdown--open" : ""}`}
              onMouseEnter={() => {
                openNavDropdown("resources")
              }}
              onMouseLeave={scheduleCloseNavDropdown}
              onFocusCapture={() => {
                openNavDropdown("resources")
              }}
              onBlurCapture={(event) => {
                const nextFocused = event.relatedTarget
                if (!(nextFocused instanceof Node) || !event.currentTarget.contains(nextFocused)) {
                  scheduleCloseNavDropdown()
                }
              }}
            >
              <NavLink
                to="/resources"
                data-tour="nav-link"
                data-tour-title="Resources"
                data-tour-intro="Explore geospatial screening and the permit and authorization inventory."
                className={`site-nav__link${isResourcesSection ? " site-nav__link--active" : ""}`}
                onClick={closeNavDropdown}
              >
                Resources
              </NavLink>
              <div className="site-nav__submenu" role="menu" aria-label="Resources pages">
                <NavLink
                  to="/resources/geospatial-screening"
                  className={({ isActive }) =>
                    isActive
                      ? "site-nav__submenu-link site-nav__submenu-link--active"
                      : "site-nav__submenu-link"
                  }
                  onClick={closeNavDropdown}
                >
                  Geospatial Screening
                </NavLink>
                <NavLink
                  to="/resources/permit-authorization-inventory"
                  className={({ isActive }) =>
                    isActive
                      ? "site-nav__submenu-link site-nav__submenu-link--active"
                      : "site-nav__submenu-link"
                  }
                  onClick={closeNavDropdown}
                >
                  Permit and Authorization Inventory
                </NavLink>
              </div>
            </div>
            <div
              className={`site-nav__dropdown${openDropdown === "portal" ? " site-nav__dropdown--open" : ""}`}
              onMouseEnter={() => {
                openNavDropdown("portal")
              }}
              onMouseLeave={scheduleCloseNavDropdown}
              onFocusCapture={() => {
                openNavDropdown("portal")
              }}
              onBlurCapture={(event) => {
                const nextFocused = event.relatedTarget
                if (!(nextFocused instanceof Node) || !event.currentTarget.contains(nextFocused)) {
                  scheduleCloseNavDropdown()
                }
              }}
            >
              <NavLink
                to="/portal"
                data-tour="nav-link"
                data-tour-title="Portal"
                data-tour-intro="Launch project workflows, track projects, and review analytics."
                className={`site-nav__link${isPortalSection ? " site-nav__link--active" : ""}`}
                onClick={closeNavDropdown}
              >
                Portal
              </NavLink>
              <div className="site-nav__submenu" role="menu" aria-label="Portal pages">
                <NavLink
                  to="/portal/new"
                  className={({ isActive }) =>
                    isActive
                      ? "site-nav__submenu-link site-nav__submenu-link--active"
                      : "site-nav__submenu-link"
                  }
                  onClick={closeNavDropdown}
                >
                  New project
                </NavLink>
                <NavLink
                  to="/projects"
                  className={({ isActive }) =>
                    isActive
                      ? "site-nav__submenu-link site-nav__submenu-link--active"
                      : "site-nav__submenu-link"
                  }
                  onClick={closeNavDropdown}
                >
                  Projects
                </NavLink>
                <NavLink
                  to="/analytics"
                  className={({ isActive }) =>
                    isActive
                      ? "site-nav__submenu-link site-nav__submenu-link--active"
                      : "site-nav__submenu-link"
                  }
                  onClick={closeNavDropdown}
                >
                  Analytics
                </NavLink>
              </div>
            </div>
            <NavLink
              to="/developer-tools"
              data-tour="nav-link"
              data-tour-title="Developer tools"
              data-tour-intro="See how CopilotKit integrations power this experience."
              className={({ isActive }) =>
                isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
              }
            >
              Developer tools
            </NavLink>
            <NavLink
              to="/settings"
              aria-label="Settings"
              data-tour="nav-link"
              data-tour-title="Settings"
              data-tour-intro="Adjust profile preferences and site options."
              className={({ isActive }) =>
                isActive
                  ? "site-nav__link site-nav__link--active site-nav__link--icon"
                  : "site-nav__link site-nav__link--icon"
              }
            >
              <span className="site-nav__icon" aria-hidden="true" role="img">
                ⚙️
              </span>
              <span className="visually-hidden">Settings</span>
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="resource-check" element={<Navigate to="/resources/geospatial-screening" replace />} />
        <Route path="portal">
          <Route index element={<PortalHubPage />} />
          <Route path="new" element={<PortalPage />} />
          <Route path=":projectId" element={<PortalPage />} />
        </Route>
        <Route path="resources">
          <Route index element={<ResourcesHubPage />} />
          <Route path="geospatial-screening" element={<ResourceCheckPage />} />
          <Route path="permit-authorization-inventory" element={<ResourcesPage />} />
        </Route>
        <Route path="permits/basic" element={<PermitStartPage />} />
        <Route path="reviews/complex" element={<ComplexReviewStartPage />} />
        <Route path="permit-info/:permitId" element={<PermitInfoPage />} />
        <Route path="developer-tools" element={<DeveloperToolsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
