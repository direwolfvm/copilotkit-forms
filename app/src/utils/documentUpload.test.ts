import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../runtimeConfig", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
  getSupabaseAnonKey: () => "anon-key",
  getSupabaseTenantId: () => "9237f453-de19-4511-81b8-71a3fd7c3b32"
}))

import { saveProjectReportDocument } from "./projectPersistence"

// Anonymous writes to permit-documents were removed with the shared project's Storage policies
// (helppermitme2 202609060010). Uploads must go through helppermit-document-upload-sign, which
// mints a signed target after checking the path and tenant. These assertions pin that sequence so
// a regression to a direct object POST fails here rather than in production, where neither this
// suite nor the browser suite covered it.

type Call = { url: string; method: string; headers: Record<string, string> }
let calls: Call[] = []

function record(input: RequestInfo | URL, init?: RequestInit): Call {
  const headers: Record<string, string> = {}
  new Headers(init?.headers ?? undefined).forEach((value, key) => {
    headers[key] = value
  })
  return {
    url: typeof input === "string" ? input : input.toString(),
    method: (init?.method ?? "GET").toUpperCase(),
    headers
  }
}

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = record(input, init)
      calls.push(call)

      if (call.url.includes("helppermit-document-upload-sign")) {
        return new Response(
          JSON.stringify({
            signedUrl:
              "https://example.supabase.co/storage/v1/object/upload/sign/permit-documents/project-1/process-2/x.pdf?token=abc",
            token: "abc",
            path: "project-1/process-2/x.pdf"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      if (call.method === "PUT") {
        return new Response(JSON.stringify({ Key: "permit-documents/project-1/process-2/x.pdf" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      }
      // the document row insert that follows
      return new Response("[]", { status: 201, headers: { "content-type": "application/json" } })
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("document uploads", () => {
  it("signs first, then PUTs to the signed target, and never POSTs the object directly", async () => {
    await saveProjectReportDocument({
      blob: new Blob(["report"], { type: "application/pdf" }),
      projectId: 1,
      projectTitle: "Example",
      parentProcessId: 2,
      generatedAt: "2026-09-06T00:00:00.000Z"
    })

    const sign = calls.find((c) => c.url.includes("helppermit-document-upload-sign"))
    expect(sign, "must request a signed upload target").toBeDefined()
    expect(sign?.method).toBe("POST")

    const put = calls.find((c) => c.method === "PUT")
    expect(put, "must upload with PUT to the signed target").toBeDefined()
    expect(put?.url).toContain("/storage/v1/object/upload/sign/")
    expect(put?.url).toContain("token=")
    expect(put?.headers["x-upsert"]).toBe("true")

    // The direct object POST is exactly what row security now refuses.
    const directPost = calls.find(
      (c) => c.method === "POST" && /\/storage\/v1\/object\/permit-documents\//.test(c.url)
    )
    expect(directPost, "must not POST the object directly").toBeUndefined()

    expect(calls.indexOf(sign!)).toBeLessThan(calls.indexOf(put!))
  })

  it("fails with an actionable message when signing is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Document not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      )
    )

    await expect(
      saveProjectReportDocument({
        blob: new Blob(["report"], { type: "application/pdf" }),
        projectId: 1,
        projectTitle: "Example",
        parentProcessId: 2,
        generatedAt: "2026-09-06T00:00:00.000Z"
      })
    ).rejects.toThrow(/could not be authorized for upload/)
  })
})
