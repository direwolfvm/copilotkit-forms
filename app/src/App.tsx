import { useEffect, useRef } from "react"
import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom"

import "./App.css"
import HomePage from "./HomePage"
import PortalPage from "./PortalPage"
import { ProjectsPage } from "./ProjectsPage"
import ResourceCheckPage from "./ResourceCheckPage"
import DeveloperToolsPage from "./DeveloperToolsPage"
import SettingsPage from "./SettingsPage"
import AboutPage from "./AboutPage"

function Layout() {
  const bannerRef = useRef<HTMLElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const bannerVisibleHeightRef = useRef<number | undefined>(undefined)

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

  return (
    <div className="site-shell">
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
                  HelpPermit.me is a demonstration project and uses a custom domain instead of a
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
              <span className="site-header__title">HelpPermit.me</span>
              <span className="site-header__tagline">(an unofficial demo)</span>
            </NavLink>
          </div>
          <nav className="site-nav" aria-label="Primary">
            <NavLink
              to="/projects"
              className={({ isActive }) =>
                isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
              }
            >
              Projects
            </NavLink>
            <NavLink
              to="/portal"
              className={({ isActive }) =>
                isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
              }
            >
              New Project Portal
            </NavLink>
            <NavLink
              to="/resource-check"
              className={({ isActive }) =>
                isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
              }
            >
              Resource Check
            </NavLink>
            <NavLink
              to="/developer-tools"
              className={({ isActive }) =>
                isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
              }
            >
              Developer Tools
            </NavLink>
            <NavLink
              to="/about"
              className={({ isActive }) =>
                isActive ? "site-nav__link site-nav__link--active" : "site-nav__link"
              }
            >
              About
            </NavLink>
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) =>
                isActive
                  ? "site-nav__link site-nav__link--active site-nav__link--icon"
                  : "site-nav__link site-nav__link--icon"
              }
            >
              <span className="site-nav__icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  role="img"
                  focusable="false"
                  aria-hidden="true"
                >
                  <path d="M9.48 3.11a3.63 3.63 0 0 1 5.04 0l.49.49a1.13 1.13 0 0 0 1.17.27l.66-.22a3.63 3.63 0 0 1 4.68 2.57l.17.68a1.13 1.13 0 0 0 .74.8l.66.22a3.63 3.63 0 0 1 0 6.92l-.66.22a1.13 1.13 0 0 0-.74.8l-.17.68a3.63 3.63 0 0 1-4.68 2.57l-.66-.22a1.13 1.13 0 0 0-1.17.27l-.49.49a3.63 3.63 0 0 1-5.04 0l-.49-.49a1.13 1.13 0 0 0-1.17-.27l-.66.22a3.63 3.63 0 0 1-4.68-2.57l-.17-.68a1.13 1.13 0 0 0-.74-.8l-.66-.22a3.63 3.63 0 0 1 0-6.92l.66-.22a1.13 1.13 0 0 0 .74-.8l.17-.68a3.63 3.63 0 0 1 4.68-2.57l.66.22a1.13 1.13 0 0 0 1.17-.27zm1.06 1.06-.49.49a2.63 2.63 0 0 1-2.73.64l-.66-.22a2.13 2.13 0 0 0-2.75 1.51l-.17.68a2.63 2.63 0 0 1-1.72 1.85l-.66.22a2.13 2.13 0 0 0 0 4.06l.66.22a2.63 2.63 0 0 1 1.72 1.85l.17.68a2.13 2.13 0 0 0 2.75 1.51l.66-.22a2.63 2.63 0 0 1 2.73.64l.49.49a2.13 2.13 0 0 0 3.02 0l.49-.49a2.63 2.63 0 0 1 2.73-.64l.66.22a2.13 2.13 0 0 0 2.75-1.51l.17-.68a2.63 2.63 0 0 1 1.72-1.85l.66-.22a2.13 2.13 0 0 0 0-4.06l-.66-.22a2.63 2.63 0 0 1-1.72-1.85l-.17-.68a2.13 2.13 0 0 0-2.75-1.51l-.66.22a2.63 2.63 0 0 1-2.73-.64l-.49-.49a2.13 2.13 0 0 0-3.02 0ZM12 9.25A2.75 2.75 0 1 1 9.25 12 2.75 2.75 0 0 1 12 9.25m0-1.5A4.25 4.25 0 1 0 16.25 12 4.25 4.25 0 0 0 12 7.75" />
                </svg>
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
        <Route path="portal">
          <Route index element={<PortalPage />} />
          <Route path=":projectId" element={<PortalPage />} />
        </Route>
        <Route path="resource-check" element={<ResourceCheckPage />} />
        <Route path="developer-tools" element={<DeveloperToolsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
