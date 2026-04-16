import { describe, expect, it } from "vitest"

import { isPermitChecklistComplete, isWorkflowBackedChecklistItem } from "./projectStatus"
import type { ProjectHierarchy } from "./projectPersistence"

function buildEntry(
  checklist: ProjectHierarchy["permittingChecklist"]
): ProjectHierarchy {
  return {
    project: {
      id: 1,
      title: "Test project",
      description: null,
      lastUpdated: null,
      geometry: null,
      currentStatus: null,
      createdAt: null
    },
    processes: [],
    permittingChecklist: checklist
  }
}

describe("projectStatus", () => {
  it("treats Basic Permit, Complex Review, and IPaC consultation as workflow-backed checklist items", () => {
    expect(isWorkflowBackedChecklistItem({ label: "Basic Permit" })).toBe(true)
    expect(isWorkflowBackedChecklistItem({ label: "Complex Review" })).toBe(true)
    expect(
      isWorkflowBackedChecklistItem({ label: "Endangered Species Act Consultation (DOI / FWS)" })
    ).toBe(true)
    expect(isWorkflowBackedChecklistItem({ label: "Clean Water Act Section 404 Permit" })).toBe(false)
  })

  it("computes checklist completion using only non-workflow-backed items", () => {
    const completeEntry = buildEntry([
      { label: "Basic Permit", completed: false },
      { label: "Complex Review", completed: false },
      { label: "Endangered Species Act Consultation (DOI / FWS)", completed: false },
      { label: "Clean Water Act Section 404 Permit", completed: true }
    ])

    const incompleteEntry = buildEntry([
      { label: "Basic Permit", completed: false },
      { label: "Clean Water Act Section 404 Permit", completed: false }
    ])

    expect(isPermitChecklistComplete(completeEntry)).toBe(true)
    expect(isPermitChecklistComplete(incompleteEntry)).toBe(false)
  })
})
