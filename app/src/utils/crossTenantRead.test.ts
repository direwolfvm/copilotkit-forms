import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const runtime = vi.hoisted(() => ({ url: undefined as string | undefined }))

vi.mock("../runtimeConfig", () => ({
  getCrossTenantReadFunctionUrl: () => runtime.url
}))

import {
  extractTableFromRestPath,
  fetchViaCrossTenantReadBroker,
  isCrossTenantReadBrokerEnabled
} from "./crossTenantRead"

beforeEach(() => {
  runtime.url = undefined
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("cross-tenant read broker", () => {
  it("is disabled until a URL is configured, so reads fall through unchanged", () => {
    expect(isCrossTenantReadBrokerEnabled()).toBe(false)
    runtime.url = "https://example.supabase.co/functions/v1/helppermit-cross-tenant-read"
    expect(isCrossTenantReadBrokerEnabled()).toBe(true)
  })

  it("only recognises PostgREST table paths", () => {
    expect(extractTableFromRestPath("/rest/v1/process_instance")).toBe("process_instance")
    expect(extractTableFromRestPath("/rest/v1/case_event?select=id")).toBe("case_event")
    expect(extractTableFromRestPath("/storage/v1/object/x")).toBeUndefined()
    expect(extractTableFromRestPath("/functions/v1/whatever")).toBeUndefined()
  })

  it("goes through the same-origin proxy in the browser, keeping the anon key server-side", async () => {
    runtime.url = "https://example.supabase.co/functions/v1/helppermit-cross-tenant-read"
    const seen: { url: string; body: unknown; headers: Record<string, string> }[] = []

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers: Record<string, string> = {}
        new Headers(init?.headers ?? undefined).forEach((v, k) => {
          headers[k] = v
        })
        seen.push({
          url: input.toString(),
          body: JSON.parse(String(init?.body ?? "{}")),
          headers
        })
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
      })
    )

    const response = await fetchViaCrossTenantReadBroker({
      table: "case_event",
      query: "select=id&tenant_id=eq.4d386bc1",
      tenantId: "4d386bc1",
      anonKey: "anon-key"
    })

    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0].body).toEqual({
      table: "case_event",
      query: "select=id&tenant_id=eq.4d386bc1",
      tenantId: "4d386bc1"
    })

    // jsdom provides window, so this is the browser path: same-origin through the proxy, and the
    // request carries no credential of its own — the server attaches it.
    expect(seen[0].url).toBe("/api/supabase/functions/v1/helppermit-cross-tenant-read")
    expect(seen[0].headers.authorization).toBeUndefined()
    expect(seen[0].headers.apikey).toBeUndefined()
    // No cross-origin request means the function never needs CORS preflight handling.
    expect(seen[0].url.startsWith("http")).toBe(false)
  })

  it("refuses to call an unconfigured broker rather than falling back silently", async () => {
    await expect(
      fetchViaCrossTenantReadBroker({
        table: "case_event",
        query: "",
        tenantId: "x",
        anonKey: "anon-key"
      })
    ).rejects.toThrow(/not configured/i)
  })
})
