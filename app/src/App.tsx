import { useEffect, useRef } from "react"
import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom"

import "./App.css"
import PortalPage from "./PortalPage"
import { ProjectsPage } from "./ProjectsPage"

function Layout() {
  const headerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const headerElement = headerRef.current
    if (!headerElement || typeof window === "undefined") {
      return
    }

    const root = document.documentElement

    const setHeaderHeight = (height: number) => {
      root.style.setProperty("--site-header-height", `${height}px`)
    }

    const updateHeaderHeight = () => {
      setHeaderHeight(headerElement.offsetHeight)
    }

    updateHeaderHeight()

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target !== headerElement) {
            continue
          }

          const borderSize = Array.isArray(entry.borderBoxSize)
            ? entry.borderBoxSize[0]
            : entry.borderBoxSize

          const height =
            typeof borderSize === "object" && borderSize
              ? borderSize.blockSize
              : entry.contentRect.height

          setHeaderHeight(height)
        }
      })

      observer.observe(headerElement)

      return () => {
        observer.disconnect()
      }
    }

    window.addEventListener("resize", updateHeaderHeight)

    return () => {
      window.removeEventListener("resize", updateHeaderHeight)
    }
  }, [])

  return (
    <div className="site-shell">
      <header ref={headerRef} className="site-header">
        <div className="site-header__inner">
          <div className="site-header__brand">
            <span className="site-header__title">HelpPermit.me</span>
            <span className="site-header__tagline">(an unofficial demo)</span>
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
        <Route index element={<Navigate to="/portal" replace />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="portal">
          <Route index element={<PortalPage />} />
          <Route path=":projectId" element={<PortalPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Route>
    </Routes>
  )
}

export default App
