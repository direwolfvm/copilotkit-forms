import type { ChangeEvent } from "react"

import { useCopilotRuntimeSelection } from "../copilotRuntimeContext"

export default function RuntimeSelectionControl() {
  const { runtimeMode, setRuntimeMode } = useCopilotRuntimeSelection()

  const handleModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value === "custom" ? "custom" : "default"
    setRuntimeMode(value)
  }

  return (
    <label className="runtime-toggle">
      <span className="runtime-toggle__label">Copilot runtime</span>
      <select
        className="runtime-toggle__select"
        value={runtimeMode}
        onChange={handleModeChange}
        aria-label="Select Copilot runtime"
      >
        <option value="default">Copilot Cloud</option>
        <option value="custom">Permitting ADK</option>
      </select>
    </label>
  )
}
