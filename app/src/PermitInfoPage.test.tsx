import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { PermitInfoPage } from "./PermitInfoPage"

describe("PermitInfoPage", () => {
  it("keeps Section 106 information but starts the workflow from a saved project instead", () => {
    render(
      <MemoryRouter initialEntries={["/permit-info/section-106-review"]}>
        <Routes>
          <Route path="/permit-info/:permitId" element={<PermitInfoPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole("heading", { name: "Section 106 Review" })).toBeInTheDocument()
    expect(screen.getByText("Integration with HelpPermitMe (Demo)")).toBeInTheDocument()
    expect(screen.getByText("Section 106 Case Manager (Demo)")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Start from HelpPermitMe" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Start this permit — DEMO" })).not.toBeInTheDocument()
  })
})
