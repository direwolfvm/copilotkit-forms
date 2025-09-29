import express from "express";
import { join, dirname } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { Readable } from "stream";
import { fileURLToPath } from "url";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "dist");
const port = parseInt(process.env.PORT ?? "8080", 10);

const defaultAgentUrl =
  "https://api.cloud.copilotkit.ai/copilotkit/v1";

const agentProxyPath = normalizeEnvValue(process.env.COPILOTKIT_AGENT_PROXY_PATH) ?? "/agent";
const normalizedAgentProxyPath = agentProxyPath.startsWith("/")
  ? agentProxyPath
  : `/${agentProxyPath}`;
const agentServiceUrl =
  normalizeEnvValue(process.env.COPILOTKIT_AGENT_SERVICE_URL) ??
  normalizeEnvValue(process.env.COPILOTKIT_RUNTIME_URL) ??
  defaultAgentUrl;

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function normalizeEnvValue(value) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createAgentTargetUrl(requestUrl) {
  const targetUrl = new URL(agentServiceUrl);

  if (requestUrl && requestUrl !== "/") {
    const queryIndex = requestUrl.indexOf("?");
    const pathPart = queryIndex >= 0 ? requestUrl.slice(0, queryIndex) : requestUrl;
    const searchPart = queryIndex >= 0 ? requestUrl.slice(queryIndex) : "";

    if (pathPart && pathPart !== "/") {
      const basePath = targetUrl.pathname.endsWith("/")
        ? targetUrl.pathname.slice(0, -1)
        : targetUrl.pathname;
      const nextPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
      targetUrl.pathname = `${basePath}${nextPath}`;
    }

    if (searchPart) {
      targetUrl.search = searchPart;
    }
  }

  return targetUrl;
}

app.get("/env.js", (req, res) => {
  const config = {};

  const publicApiKey =
    normalizeEnvValue(process.env.VITE_COPILOTKIT_PUBLIC_API_KEY) ??
    normalizeEnvValue(process.env.COPILOTKIT_PUBLIC_API_KEY);
  if (publicApiKey) {
    config.publicApiKey = publicApiKey;
  }

  const runtimeUrl =
    normalizeEnvValue(process.env.VITE_COPILOTKIT_RUNTIME_URL) ??
    normalizeEnvValue(process.env.COPILOTKIT_RUNTIME_URL) ??
    normalizedAgentProxyPath;
  if (runtimeUrl) {
    config.runtimeUrl = runtimeUrl;
  }

  res.setHeader("Cache-Control", "no-store");
  res.type("application/javascript");

  res.send(
    `window.__COPILOTKIT_RUNTIME_CONFIG__ = ${JSON.stringify(config)};\n` +
      "Object.freeze(window.__COPILOTKIT_RUNTIME_CONFIG__);\n"
  );
});

/**
 * Helper to lazily resolve the most recently built asset that matches a given
 * filename pattern. We use this as a safety net for clients that are still
 * referencing a fingerprinted asset from a previous deployment.
 */
function findLatestAsset(prefix, extension) {
  const assetsDir = join(distDir, "assets");
  if (!existsSync(assetsDir)) {
    return null;
  }

  const matchingFiles = readdirSync(assetsDir)
    .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith(extension))
    .map((fileName) => ({
      fileName,
      mtimeMs: statSync(join(assetsDir, fileName)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return matchingFiles[0]?.fileName ?? null;
}

if (agentServiceUrl && normalizedAgentProxyPath) {
  app.use(
    normalizedAgentProxyPath,
    express.raw({ type: "*/*", limit: "10mb" })
  );

  app.use(normalizedAgentProxyPath, async (req, res, next) => {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        req.get("Access-Control-Request-Headers") ?? "content-type"
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.status(204).end();
      return;
    }

    try {
      const targetUrl = createAgentTargetUrl(req.url);
      const headers = {};

      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) {
          continue;
        }

        const lowerKey = key.toLowerCase();
        if (hopByHopHeaders.has(lowerKey) || lowerKey === "host") {
          continue;
        }

        if (Array.isArray(value)) {
          headers[key] = value.join(", ");
        } else if (typeof value === "string") {
          headers[key] = value;
        }
      }

      const body =
        req.method === "GET" || req.method === "HEAD" || req.body === undefined
          ? undefined
          : req.body;

      const controller = new AbortController();
      req.on("close", () => {
        controller.abort();
      });

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        signal: controller.signal,
      });

      res.status(response.status);

      response.headers.forEach((value, key) => {
        if (!hopByHopHeaders.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      if (!response.headers.has("access-control-allow-origin")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }

      if (!response.body) {
        res.end();
        return;
      }

      const readable = Readable.fromWeb(response.body);
      readable.on("error", (error) => {
        console.error("Error proxying agent response", error);
        res.destroy(error);
      });
      readable.pipe(res);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      console.error("Failed to proxy Copilot agent request", error);
      next(error);
    }
  });
}

const fallbackIndexJs = findLatestAsset("index-", ".js");
const fallbackIndexCss = findLatestAsset("index-", ".css");

/**
 * Cache hashed build artifacts for a long time while ensuring the HTML shell
 * is always fetched freshly. This prevents clients from holding on to an old
 * index.html that references fingerprinted assets that no longer exist after a
 * new deployment.
 */
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

if (!existsSync(join(distDir, "index.html"))) {
  console.error(
    "Build output not found. Make sure `npm run build` has been executed before starting the server."
  );
  process.exit(1);
}

app.use(
  express.static(distDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-store");
        return;
      }

      res.setHeader(
        "Cache-Control",
        `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`
      );
    },
  })
);

function serveLatestAsset(fallbackFile) {
  if (!fallbackFile) {
    return null;
  }

  const absolutePath = join(distDir, "assets", fallbackFile);

  return (req, res, next) => {
    if (!existsSync(absolutePath)) {
      next();
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.sendFile(absolutePath);
  };
}

const fallbackIndexJsHandler = serveLatestAsset(fallbackIndexJs);
if (fallbackIndexJsHandler) {
  app.get("/assets/index-:hash.js", fallbackIndexJsHandler);
}

const fallbackIndexCssHandler = serveLatestAsset(fallbackIndexCss);
if (fallbackIndexCssHandler) {
  app.get("/assets/index-:hash.css", fallbackIndexCssHandler);
}

app.get("*", (req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }

  if (req.path.includes(".")) {
    next();
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.sendFile(join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
