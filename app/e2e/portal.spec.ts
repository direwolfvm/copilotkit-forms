import { expect, test, type Locator, type Page } from "@playwright/test"

// End-to-end flow for the project portal page (new + existing project):
// auto-save, the action bar, expand-on-edit behavior, checklist integration links
// (including the Section 106 demo link), status-chip layout, and the permit-info CTA.

const TEST_TITLE = `E2E portal flow ${Date.now()} — safe to delete`

function cardByTitle(page: Page, title: string): Locator {
  return page
    .locator(".collapsible-card")
    .filter({ has: page.locator("h2, h3", { hasText: title }) })
    .first()
}

async function expectNoOverlap(a: Locator, b: Locator) {
  const boxA = await a.boundingBox()
  const boxB = await b.boundingBox()
  if (!boxA || !boxB) {
    return
  }
  const separated =
    boxA.x + boxA.width <= boxB.x + 1 ||
    boxB.x + boxB.width <= boxA.x + 1 ||
    boxA.y + boxA.height <= boxB.y + 1 ||
    boxB.y + boxB.height <= boxA.y + 1
  expect(separated, "header elements must not overlap").toBe(true)
}

test.describe("project portal", () => {
  test.beforeEach(async ({ page }) => {
    // The guided site tour auto-launches for first-time visitors and its overlay
    // intercepts pointer events; mark it complete before the app boots.
    await page.addInitScript(() => {
      window.localStorage.setItem("portalSiteTourComplete", "true")
    })
  })

  test("new project: auto-save, action bar, checklist demo link, edit behavior", async ({
    page
  }) => {
    await page.goto("/portal/new")

    // The action bar is visible outside the cards with both primary actions.
    const actionbar = page.locator(".portal-actionbar")
    await expect(actionbar).toBeVisible()
    const saveButton = actionbar.getByRole("button", { name: "Save project data" })
    const submitButton = actionbar.getByRole("button", { name: "Submit pre-screening" })
    await expect(saveButton).toBeEnabled()
    await expect(submitButton).toBeDisabled()

    // Typing a title triggers auto-save (2.5s debounce) without pressing any button.
    await page.locator("#root_title").fill(TEST_TITLE)
    await expect(actionbar.locator(".portal-actionbar__saved")).toContainText(
      "All changes saved",
      { timeout: 15_000 }
    )

    // Auto-save generated a project identifier and enabled pre-screening submission.
    const projectId = await page.locator("#root_id").inputValue()
    expect(projectId).toMatch(/^\d{8}$/)
    await expect(submitButton).toBeEnabled()

    // Existing-project view: core summary expanded, others collapsed, all editable.
    await page.goto(`/portal/${projectId}`)
    // Wait for the persisted project state (including the seeded checklist) to hydrate.
    await expect(cardByTitle(page, "Core Project Data")).toContainText(TEST_TITLE, {
      timeout: 15_000
    })
    const coreCard = cardByTitle(page, "Core Project Data")
    await expect(coreCard.locator(".collapsible-card__toggle")).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    const locationCard = cardByTitle(page, "Location and Geospatial Data")
    await expect(locationCard.locator(".collapsible-card__toggle")).toHaveAttribute(
      "aria-expanded",
      "false"
    )

    // Entering edit mode expands the pane; finishing keeps the summary expanded.
    await locationCard.getByRole("button", { name: "Edit" }).click()
    const locationEditCard = cardByTitle(page, "Location and Geospatial Data")
    await expect(locationEditCard.locator(".collapsible-card__toggle")).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    await locationEditCard.getByRole("button", { name: "Done editing" }).click()
    await expect(
      cardByTitle(page, "Location and Geospatial Data").locator(".collapsible-card__toggle")
    ).toHaveAttribute("aria-expanded", "true")

    // Add a Section 106 checklist item; it links to the demo system with the project id.
    const checklistCard = cardByTitle(page, "Permitting Checklist")
    await checklistCard.getByRole("button", { name: "Edit" }).click()
    await page.locator("#permitting-checklist-input").fill("Section 106 Review")
    await page.getByRole("button", { name: "Add item", exact: true }).click()
    const section106Link = page.getByRole("link", { name: "Start this permit — DEMO" })
    await expect(section106Link).toBeVisible()
    await expect(section106Link).toHaveAttribute(
      "href",
      `/reviews/section-106?projectId=${projectId}`
    )

    // Status chips never overlap the card titles or actions.
    for (const header of await page.locator(".collapsible-card__header").all()) {
      const title = header.locator(".collapsible-card__title-group")
      const status = header.locator(".collapsible-card__status")
      const actions = header.locator(".collapsible-card__actions")
      if ((await status.count()) > 0) {
        await expectNoOverlap(title, status.first())
        if ((await actions.count()) > 0) {
          await expectNoOverlap(status.first(), actions.first())
        }
      }
    }

    // Delete the project from the Projects page (also keeps the demo data clean).
    await page.goto("/projects")
    const projectItem = page
      .locator(".projects-tree__project")
      .filter({ hasText: TEST_TITLE })
      .first()
    await expect(projectItem).toBeVisible({ timeout: 20_000 })
    // Expand programmatically: the summary row hosts a navigation link and the list
    // re-renders while external-system processes merge in, making pointer clicks flaky.
    await projectItem.evaluate((element) => {
      const details = element.querySelector("details")
      if (details) {
        details.open = true
      }
    })
    await projectItem.getByRole("button", { name: "Delete project…" }).click()

    const modal = page.locator(".delete-project-modal")
    await expect(modal).toBeVisible()
    // No external applications were started for this project; uncheck anything detected.
    for (const checkbox of await modal.locator("input[type=checkbox]").all()) {
      await checkbox.uncheck()
    }
    await modal.getByRole("button", { name: "Delete project", exact: true }).click()
    await expect(modal.getByText("Project deleted.")).toBeVisible({ timeout: 30_000 })
    await modal.getByRole("button", { name: "Close", exact: true }).click()
    await expect(
      page.locator(".projects-tree__project").filter({ hasText: TEST_TITLE })
    ).toHaveCount(0, { timeout: 20_000 })
  })

  test("settings project maintenance uses the shared delete flow (no password)", async ({
    page
  }) => {
    await page.goto("/settings")
    await page.getByRole("button", { name: "Delete a project" }).click()

    const picker = page.locator(".settings__modal")
    await expect(picker).toBeVisible()
    await expect(picker.getByText("password")).toHaveCount(0)
    await picker.getByRole("button", { name: "Continue" }).click()

    // The shared confirmation modal opens with the external-system options; cancel out.
    const modal = page.locator(".delete-project-modal")
    await expect(modal).toBeVisible()
    await expect(modal).toContainText("Section 106 Case Manager (Demo)")
    await expect(modal.locator("input[type=password]")).toHaveCount(0)
    await modal.getByRole("button", { name: "Cancel" }).click()
    await expect(modal).toHaveCount(0)
  })

  test("permit info page advertises the Section 106 demo integration", async ({ page }) => {
    await page.goto("/permit-info/section-106-review")

    await expect(page.locator(".integration-badge__label")).toHaveText(
      "Integration with HelpPermitMe (Demo)"
    )
    const start = page.locator(".permit-info__start")
    await expect(start.getByRole("link", { name: "Start this permit — DEMO" })).toHaveAttribute(
      "href",
      "/reviews/section-106"
    )
    await expect(start).toContainText("not a system of record")
    await expect(
      page.locator(".permit-info__tool-name", { hasText: "Section 106 Case Manager (Demo)" })
    ).toBeVisible()
  })
})
