import RuntimeSelectionControl from "./components/RuntimeSelectionControl"

import "./App.css"

export default function SettingsPage() {
  return (
    <div className="settings" aria-labelledby="settings-heading">
      <div className="settings__inner">
        <header className="settings__header">
          <h1 id="settings-heading">Settings</h1>
          <p>Configure how HelpPermit.me connects to Copilot runtimes used throughout the portal.</p>
        </header>

        <section className="settings__section" aria-labelledby="settings-runtime-heading">
          <h2 id="settings-runtime-heading">Copilot runtime</h2>
          <p className="settings__description">
            Choose between the hosted Copilot Cloud or the local Permitting ADK proxy for development and testing.
          </p>
          <div className="settings__control">
            <RuntimeSelectionControl />
          </div>
          <p className="settings__hint">
            Switching to the Permitting ADK routes Copilot requests through the local <code>/api/custom-adk</code> proxy.
          </p>
        </section>
      </div>
    </div>
  )
}
