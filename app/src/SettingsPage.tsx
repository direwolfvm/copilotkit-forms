import { useEffect, useMemo, useState } from "react"

import RuntimeSelectionControl from "./components/RuntimeSelectionControl"
import {
  ProjectPersistenceError,
  fetchProjectHierarchy,
  type ProjectHierarchy
} from "./utils/projectPersistence"
import { DeleteProjectModal } from "./components/DeleteProjectModal"
import { useHolidayTheme, type SeasonalTheme } from "./holidayThemeContext"
import { useDesignTheme, type DesignTheme } from "./designThemeContext"

import "./App.css"

function formatProjectLabel(project: ProjectHierarchy): string {
  const title = project.project.title?.trim()
  const baseLabel = title?.length ? title : `Project ${project.project.id}`
  const updated = project.project.lastUpdated
  return updated ? `${baseLabel} (updated ${new Date(updated).toLocaleString()})` : baseLabel
}

type SettingsDeletePickerProps = {
  projects: ProjectHierarchy[]
  onClose: () => void
  onSelect: (entry: ProjectHierarchy) => void
}

function SettingsDeletePicker({ projects, onClose, onSelect }: SettingsDeletePickerProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">(
    () => projects[0]?.project.id ?? ""
  )
  const hasProjects = projects.length > 0
  const selected = projects.find((entry) => entry.project.id === selectedProjectId)

  return (
    <div className="process-info-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="process-info-modal settings__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-delete-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="process-info-modal__header">
          <p className="process-info-modal__eyebrow">Project maintenance</p>
          <h2 id="settings-delete-picker-title">Delete a project</h2>
          <button className="process-info-modal__close" type="button" onClick={onClose} aria-label="Close dialog">
            <svg viewBox="0 0 18 18" aria-hidden="true">
              <path d="m4.5 4.5 9 9m0-9-9 9" fill="none" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="process-info-modal__body settings__modal-body">
          <p>
            Choose the project to delete. The next step confirms exactly what will be removed,
            including optional cleanup of linked permit applications in PermitFast, ReviewWorks,
            and the Section 106 Case Manager (Demo).
          </p>
          <label className="settings__field">
            <span className="settings__label">Select a project</span>
            <select
              className="settings__select"
              value={selectedProjectId}
              onChange={(event) =>
                setSelectedProjectId(event.target.value === "" ? "" : Number(event.target.value))
              }
              disabled={!hasProjects}
            >
              {!hasProjects ? <option value="">No projects available</option> : null}
              {projects.map((project) => (
                <option key={project.project.id} value={project.project.id}>
                  {formatProjectLabel(project)}
                </option>
              ))}
            </select>
          </label>
          <div className="settings__modal-actions">
            <button
              className="settings__button settings__button--danger"
              type="button"
              disabled={!selected}
              onClick={() => selected && onSelect(selected)}
            >
              Continue
            </button>
            <button className="settings__button settings__button--ghost" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [projects, setProjects] = useState<ProjectHierarchy[]>([])
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null)
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<ProjectHierarchy | null>(null)
  const { seasonalTheme, setSeasonalTheme } = useHolidayTheme()
  const { designTheme, setDesignTheme } = useDesignTheme()

  useEffect(() => {
    let isActive = true

    const loadProjects = async () => {
      setIsLoadingProjects(true)
      setProjectLoadError(null)
      try {
        const hierarchy = await fetchProjectHierarchy()
        if (isActive) {
          setProjects(hierarchy)
        }
      } catch (error) {
        if (isActive) {
          const message = error instanceof ProjectPersistenceError ? error.message : "Unable to load projects."
          setProjectLoadError(message)
          setProjects([])
        }
      } finally {
        if (isActive) {
          setIsLoadingProjects(false)
        }
      }
    }

    loadProjects()

    return () => {
      isActive = false
    }
  }, [])

  const availableProjects = useMemo(() => projects, [projects])

  const handleProjectDeleted = (projectId: number) => {
    setProjects((previous) => previous.filter((project) => project.project.id !== projectId))
  }

  return (
    <div className="settings" aria-labelledby="settings-heading">
      <div className="settings__inner">
        <header className="settings__header">
          <h1 id="settings-heading">Settings</h1>
          <p>Configure how HelpPermitMe connects to Copilot runtimes used throughout the portal.</p>
        </header>

        <section className="settings__section" aria-labelledby="settings-runtime-heading">
          <h2 id="settings-runtime-heading">Copilot runtime</h2>
          <p className="settings__description">
            Choose between the hosted Copilot Cloud runtime and the local Permitting ADK proxy.
          </p>
          <div className="settings__control">
            <RuntimeSelectionControl />
          </div>
          <p className="settings__hint">
            Permitting ADK uses <code>/api/custom-adk</code>. NEPA guidance is now available to the main
            portal copilot through the integrated NEPA query tool, so it can use the live project, checklist,
            and geospatial context already loaded in the app.
          </p>
        </section>

        <section className="settings__section" aria-labelledby="settings-theme-heading">
          <h2 id="settings-theme-heading">Seasonal theme</h2>
          <p className="settings__description">
            Add a festive touch to HelpPermitMe with floating decorations, themed colors, and cheer in the navigation.
          </p>
          <div className="settings__control">
            <label className="settings__field" htmlFor="settings-seasonal-theme-select">
              <span className="settings__label">Seasonal theme</span>
              <select
                id="settings-seasonal-theme-select"
                className="settings__select"
                value={seasonalTheme}
                onChange={(event) => setSeasonalTheme(event.target.value as SeasonalTheme)}
              >
                <option value="none">None</option>
                <option value="christmas">❄️ Christmas — falling snow &amp; holiday cheer</option>
                <option value="july4">🎆 Fourth of July — fireworks, red, white &amp; blue</option>
                <option value="unicorn">🦄 Unicorn — sparkles, pink &amp; purple magic</option>
              </select>
              <span className="settings__hint">
                Floating decorations and themed colors appear across the site. Saved to this device.
              </span>
            </label>
          </div>
        </section>

        <section className="settings__section" aria-labelledby="settings-design-theme-heading">
          <h2 id="settings-design-theme-heading">Visual theme</h2>
          <p className="settings__description">
            Choose between multiple visual themes. Your selection is saved to this device.
          </p>
          <div className="settings__control">
            <label className="settings__field" htmlFor="settings-design-theme-select">
              <span className="settings__label">Theme</span>
              <select
                id="settings-design-theme-select"
                className="settings__select"
                value={designTheme}
                onChange={(event) => setDesignTheme(event.target.value as DesignTheme)}
              >
                <option value="old">Legacy</option>
                <option value="new">New (token baseline)</option>
                <option value="gold-marble">Gold + Marble</option>
              </select>
              <span className="settings__hint">Theme preference is stored in local browser storage.</span>
            </label>
          </div>
        </section>

        <section className="settings__section settings__section--danger" aria-labelledby="settings-projects-heading">
          <h2 id="settings-projects-heading">Project maintenance</h2>
          <p className="settings__description">
            Remove projects and their associated data from Supabase when they are no longer needed.
          </p>

          {projectLoadError ? <p className="settings__error">{projectLoadError}</p> : null}
          {!projectLoadError && isLoadingProjects ? (
            <p className="settings__hint">Loading projects…</p>
          ) : (
            <p className="settings__hint">
              Projects, processes, decision payloads, supporting documents, GIS uploads, and case events will be
              deleted together.
            </p>
          )}

          <div className="settings__danger-actions">
            <button
              className="settings__button settings__button--danger"
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isLoadingProjects || (!!projectLoadError && projects.length === 0)}
            >
              Delete a project
            </button>
          </div>
        </section>
      </div>

      {showDeleteModal && !entryToDelete ? (
        <SettingsDeletePicker
          projects={availableProjects}
          onClose={() => setShowDeleteModal(false)}
          onSelect={(entry) => setEntryToDelete(entry)}
        />
      ) : null}

      {entryToDelete ? (
        <DeleteProjectModal
          entry={entryToDelete}
          onDismiss={() => setEntryToDelete(null)}
          onDeleted={() => {
            handleProjectDeleted(entryToDelete.project.id)
            setEntryToDelete(null)
            setShowDeleteModal(false)
          }}
        />
      ) : null}
    </div>
  )
}
