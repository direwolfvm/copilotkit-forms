import { describe, expect, it, vi } from "vitest"

vi.mock("../runtimeConfig", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
  getSupabaseAnonKey: () => "anon-key",
  getSupabaseTenantId: () => "9237f453-de19-4511-81b8-71a3fd7c3b32"
}))

import { buildDocumentDownloadUrl } from "./projectPersistence"

const BUCKET = "permit-documents"

describe("buildDocumentDownloadUrl", () => {
  it("returns a same-origin route rather than a public storage object URL", () => {
    const url = buildDocumentDownloadUrl(BUCKET, "project-1/process-2/report.pdf")

    expect(url.startsWith("/api/documents/download?")).toBe(true)
    // The whole point: no public object path is handed to the browser.
    expect(url).not.toContain("/storage/v1/object/public/")
    expect(url).not.toContain("supabase.co")
  })

  it("strips a bucket prefix so document.url can be passed through verbatim", () => {
    const withPrefix = buildDocumentDownloadUrl(BUCKET, `${BUCKET}/project-1/report.pdf`)
    const withoutPrefix = buildDocumentDownloadUrl(BUCKET, "project-1/report.pdf")

    expect(withPrefix).toBe(withoutPrefix)
    expect(new URLSearchParams(withPrefix.split("?")[1]).get("path")).toBe("project-1/report.pdf")
  })

  it("encodes the bucket and path as query parameters", () => {
    const params = new URLSearchParams(
      buildDocumentDownloadUrl(BUCKET, "project-1/a file & thing.pdf").split("?")[1]
    )

    expect(params.get("bucket")).toBe(BUCKET)
    expect(params.get("path")).toBe("project-1/a file & thing.pdf")
  })

  it("drops leading slashes and empty segments", () => {
    const params = new URLSearchParams(
      buildDocumentDownloadUrl(BUCKET, "//project-1//process-2//report.pdf").split("?")[1]
    )

    expect(params.get("path")).toBe("project-1/process-2/report.pdf")
  })

  it("returns an empty string when there is no object path to link to", () => {
    expect(buildDocumentDownloadUrl(BUCKET, "")).toBe("")
    expect(buildDocumentDownloadUrl(BUCKET, `${BUCKET}/`)).toBe("")
  })
})
