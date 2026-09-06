import { expect, test } from "@playwright/test"

// The portal reads process models, decision elements and legal structures belonging to the
// PermitFlow and ReviewWorks tenants with the anon key. Those reads are governed by row security
// in a Supabase project we share with other teams, and a tightening there has already broken this
// path once (helppermitme2 migration 202609060011, repaired in 202609060016) without either side's
// browser suite noticing. These tests exercise the exact lookups so the next one fails loudly.

test.describe("cross-tenant catalog reads", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("portalSiteTourComplete", "true")
    })
  })

  test("complex review resolves a ReviewWorks process model and its legal structure", async ({
    page
  }) => {
    const failures: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") {
        failures.push(message.text())
      }
    })

    await page.goto("/reviews/complex")

    const details = page.locator(".process-information, article").first()
    await expect(details).toContainText("Complex Environmental Review", { timeout: 20_000 })

    // The legal structure lives in the ReviewWorks tenant and is read without a tenant filter.
    // If anon loses that read, the citation is the first thing to disappear.
    await expect(details).toContainText("NEPA", { timeout: 20_000 })
    await expect(details).toContainText("42 U.S.C.", { timeout: 20_000 })

    // Decision elements come from the same tenant.
    await expect(details).toContainText("Decision elements")

    expect(failures, "no console errors while resolving the cross-tenant catalog").toEqual([])
  })

  test("basic permit resolves the PermitFlow SF-299 model and its sections", async ({ page }) => {
    await page.goto("/permits/basic")

    const details = page.locator(".process-information, article").first()
    // Resolved by title inside a tenant filter, never by bare numeric id — permitfast2 seeded a
    // model with this exact title and the same sf299-v2-* reference ids in its own tenant.
    await expect(details).toContainText("Basic Permit (SF-299)", { timeout: 20_000 })
    await expect(details).toContainText("Right of Way Authorization")
  })
})
