import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const TENANT = "9237f453-de19-4511-81b8-71a3fd7c3b32"

// Numeric catalog ids come from a sequence shared with every other tenant in the Supabase
// project, so these guards exist to stop the portal ever resolving a catalog row by bare id.
const runtime = vi.hoisted(() => ({
  url: "https://example.supabase.co" as string | undefined,
  key: "anon-key" as string | undefined,
  // literal, not TENANT: vi.hoisted runs before module-level consts are initialised
  tenant: "9237f453-de19-4511-81b8-71a3fd7c3b32" as string | undefined
}))

vi.mock("../runtimeConfig", () => ({
  getSupabaseUrl: () => runtime.url,
  getSupabaseAnonKey: () => runtime.key,
  getSupabaseTenantId: () => runtime.tenant
}))

import {
  PRE_SCREENING_PROCESS_MODEL_TITLE,
  resetIpacShadowCatalogCache,
  resetPreScreeningProcessModelCache,
  resolveIpacShadowCatalogIds,
  resolvePreScreeningProcessModelId
} from "./projectPersistence"

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}

let requestedUrls: string[] = []

beforeEach(() => {
  runtime.url = "https://example.supabase.co"
  runtime.key = "anon-key"
  runtime.tenant = TENANT
  requestedUrls = []
  resetPreScreeningProcessModelCache()
  resetIpacShadowCatalogCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(handler: (url: URL) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString()
      requestedUrls.push(raw)
      return jsonResponse(handler(new URL(raw, "https://example.supabase.co")))
    })
  )
}

describe("pre-screening process model resolution", () => {
  it("matches by title inside a tenant filter, never by bare numeric id", async () => {
    stubFetch((url) => {
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT}`)
      return url.searchParams.get("title") === `eq.${PRE_SCREENING_PROCESS_MODEL_TITLE}`
        ? [{ id: 41 }]
        : []
    })

    await expect(resolvePreScreeningProcessModelId()).resolves.toBe(41)
    expect(requestedUrls).toHaveLength(1)
    expect(requestedUrls[0]).toContain(`tenant_id=eq.${TENANT}`)
  })

  it("keeps the numeric fallback tenant-scoped", async () => {
    stubFetch((url) => {
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT}`)
      return url.searchParams.has("title") ? [] : [{ id: 1 }]
    })

    await expect(resolvePreScreeningProcessModelId()).resolves.toBe(1)
    expect(requestedUrls).toHaveLength(2)
    for (const url of requestedUrls) {
      expect(url).toContain(`tenant_id=eq.${TENANT}`)
    }
  })

  it("throws a seeding hint rather than returning another tenant's model", async () => {
    stubFetch(() => [])
    await expect(resolvePreScreeningProcessModelId()).rejects.toThrow(/was not found for this tenant/)
  })

  it("refuses to query at all when no tenant is configured", async () => {
    runtime.tenant = undefined
    stubFetch(() => [{ id: 1 }])

    await expect(resolvePreScreeningProcessModelId()).rejects.toThrow(/tenant is not configured/i)
    expect(requestedUrls).toHaveLength(0)
  })
})

describe("IPaC shadow catalog resolution", () => {
  it("maps decision elements by reference id within the tenant", async () => {
    stubFetch((url) => {
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT}`)
      if (url.pathname.endsWith("/process_model")) {
        return [{ id: 42 }]
      }
      expect(url.searchParams.get("process_model")).toBe("eq.42")
      return [
        { id: 90, process_model_internal_reference_id: "ipac-shadow-geospatial-data" },
        { id: 91, process_model_internal_reference_id: "ipac-shadow-project-created" },
        { id: 92, process_model_internal_reference_id: "ipac-shadow-consultation-complete" }
      ]
    })

    await expect(resolveIpacShadowCatalogIds()).resolves.toEqual({
      processModelId: 42,
      geospatialData: 90,
      projectCreated: 91,
      consultationComplete: 92
    })
  })

  it("yields nulls when the catalog is unseeded, so no foreign key is written", async () => {
    stubFetch(() => [])

    await expect(resolveIpacShadowCatalogIds()).resolves.toEqual({
      processModelId: null,
      geospatialData: null,
      projectCreated: null,
      consultationComplete: null
    })
  })
})
