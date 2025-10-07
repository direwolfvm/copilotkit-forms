import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom"

import "./App.css"
import PortalPage from "./PortalPage"
import { ProjectsPage } from "./ProjectsPage"

function Layout() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <span className="site-header__brand">Project Portal</span>
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
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="portal">
          <Route index element={<PortalPage />} />
          <Route path=":projectId" element={<PortalPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  )
}

export default App
