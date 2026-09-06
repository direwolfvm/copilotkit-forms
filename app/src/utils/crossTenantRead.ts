import { getCrossTenantReadFunctionUrl } from "../runtimeConfig"

const SUPABASE_PROXY_PREFIX = "/api/supabase"

/**
 * Reads PermitFlow and ReviewWorks data through the cross-tenant read broker.
 *
 * Those reads run as `anon` today and the shared Supabase project is removing anonymous
 * cross-tenant reads (migration 014). The broker holds the service credential inside Supabase and
 * is expected to enforce the table allowlist, the tenant filter and the column projection, exactly
 * as helppermit-portal-write does for writes.
 *
 * Only the anonymous path is routed. Requests that already carry a user JWT are authenticated and
 * are not what migration 014 closes, so they keep going straight to PostgREST.
 */
export type CrossTenantReadRequest = {
  table: string
  query: string
  tenantId: string
  anonKey: string
}

export function isCrossTenantReadBrokerEnabled(): boolean {
  return typeof getCrossTenantReadFunctionUrl() === "string"
}

export function extractTableFromRestPath(path: string): string | undefined {
  const match = /^\/rest\/v1\/([a-z_]+)$/.exec(path.split("?")[0])
  return match?.[1]
}

export async function fetchViaCrossTenantReadBroker({
  table,
  query,
  tenantId,
  anonKey
}: CrossTenantReadRequest): Promise<Response> {
  const brokerUrl = getCrossTenantReadFunctionUrl()
  if (!brokerUrl) {
    throw new Error("Cross-tenant read broker is not configured.")
  }

  // In the browser, go through the same-origin /api/supabase proxy the rest of the portal uses.
  // That keeps the anon key server-side and avoids a cross-origin preflight on every catalog and
  // analytics read — the function never has to implement CORS.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    Accept: "application/json"
  }
  let target = brokerUrl

  if (typeof window === "undefined") {
    headers.apikey = anonKey
    headers.Authorization = `Bearer ${anonKey}`
  } else {
    const parsed = new URL(brokerUrl, window.location.origin)
    target = `${SUPABASE_PROXY_PREFIX}${parsed.pathname}${parsed.search}`
  }

  return fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ table, query, tenantId })
  })
}
