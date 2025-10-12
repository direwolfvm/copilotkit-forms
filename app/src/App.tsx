import { useEffect, useRef } from "react"
import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom"

import "./App.css"
import HomePage from "./HomePage"
import PortalPage from "./PortalPage"
import { ProjectsPage } from "./ProjectsPage"
import ResourceCheckPage from "./ResourceCheckPage"
import DeveloperToolsPage from "./DeveloperToolsPage"

function Layout() {
  const bannerRef = useRef<HTMLElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const root = document.documentElement
    const updateLayoutMetrics = () => {
      const bannerHeight = bannerRef.current?.offsetHeight ?? 0
      const headerHeight = headerRef.current?.offsetHeight ?? 0
      root.style.setProperty("--site-banner-height", `${bannerHeight}px`)
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

    window.addEventListener("resize", updateLayoutMetrics)
    return () => {
      observers.forEach((observer) => observer.disconnect())
      window.removeEventListener("resize", updateLayoutMetrics)
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
