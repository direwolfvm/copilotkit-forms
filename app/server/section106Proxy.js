// Proxy for the Section 106 Case Manager (Demo) exchange API.
//
// The Case Manager (one-oh-six-bot) runs NHPA Section 106 reviews and exposes a REST
// translation API in the CEQ/PIC data-standard shapes. It authenticates with an API key
// and does not send CORS headers, so the browser talks to this same-origin proxy and the
// key stays server-side (mirrors the /api/supabase pattern).

const DEFAULT_EXCHANGE_URL = "https://one-oh-six-bot.app.cloud.gov/api/exchange/v1";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH"]);

function normalizeEnvValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveSection106ExchangeUrl() {
  return (
    normalizeEnvValue(process.env.SECTION106_EXCHANGE_URL) ??
    normalizeEnvValue(process.env.VITE_SECTION106_EXCHANGE_URL) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SECTION106_EXCHANGE_URL) ??
    DEFAULT_EXCHANGE_URL
  );
}

export function resolveSection106ApiKey() {
  const key =
    normalizeEnvValue(process.env.SECTION106_EXCHANGE_API_KEY) ??
    normalizeEnvValue(process.env.VITE_SECTION106_EXCHANGE_API_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SECTION106_EXCHANGE_API_KEY);
  if (key) {
    return key;
  }
  // The Case Manager's built-in dev key only exists on non-production instances; use it
  // automatically only when pointing at a local instance.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(resolveSection106ExchangeUrl())) {
    return "demo-portal-key";
  }
  return undefined;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  // Express has already parsed JSON bodies; the Vite/connect dev server has not.
  if (req.body !== undefined) {
    if (typeof req.body === "string" || req.body instanceof Buffer) {
      return req.body;
    }
    if (req.body && typeof req.body === "object") {
      return JSON.stringify(req.body);
    }
  }
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", (error) => reject(error));
  });
}

/**
 * Node-style middleware that forwards requests to the exchange API. Mount it under
 * /api/section106 in both Express and the Vite dev server — both strip the mount prefix,
 * so req.url arrives as the exchange path (e.g. /process-models).
 */
export function createSection106ProxyMiddleware() {
  return async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      sendJson(res, 405, {
        error: { code: "method_not_allowed", message: `Method ${method} is not allowed.` }
      });
      return;
    }

    const apiKey = resolveSection106ApiKey();
    if (!apiKey) {
      sendJson(res, 503, {
        error: {
          code: "section106_not_configured",
          message:
            "The Section 106 Case Manager (Demo) integration is not configured. Set SECTION106_EXCHANGE_API_KEY (key provided by the Case Manager team)."
        }
      });
      return;
    }

    const baseUrl = resolveSection106ExchangeUrl().replace(/\/+$/, "");
    const path = req.url && req.url !== "/" ? req.url : "";
    const targetUrl = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = {
      "X-API-Key": apiKey,
      accept: "application/json"
    };

    let body;
    if (method !== "GET") {
      body = await readRequestBody(req);
      headers["content-type"] = "application/json";
    }

    try {
      const upstream = await fetch(targetUrl, { method, headers, body: body || undefined });
      const responseText = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
      res.setHeader("cache-control", "no-store");
      const correlationId = upstream.headers.get("x-correlation-id");
      if (correlationId) {
        res.setHeader("x-correlation-id", correlationId);
      }
      res.end(responseText);
    } catch (error) {
      console.error("[section106] Exchange API request failed", error);
      sendJson(res, 502, {
        error: {
          code: "section106_upstream_unreachable",
          message: "The Section 106 Case Manager (Demo) exchange API could not be reached."
        }
      });
    }
  };
}
