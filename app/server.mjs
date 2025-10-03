import express from "express";
import { join, dirname } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "url";

import { callIpacProxy, callNepassistProxy, ProxyError } from "./server/geospatialProxy.js";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "dist");
const port = parseInt(process.env.PORT ?? "8080", 10);
const customAdkBaseUrl =
  normalizeEnvValue(process.env.COPILOTKIT_CUSTOM_ADK_URL) ??
  "https://permitting-adk-650621702399.us-east4.run.app";

app.use(express.json({ limit: "1mb" }));

function normalizeEnvValue(value) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function proxyCustomAdkRequest(req, res) {
  const targetUrl = new URL(req.url || "/", customAdkBaseUrl);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) {
      continue;
    }
    if (key.toLowerCase() === "host") {
      continue;
    }
    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method?.toUpperCase() ?? "GET";
  const hasBody = !["GET", "HEAD"].includes(method);

  let body;
  if (hasBody) {
    if (req.is("application/json") && req.body && typeof req.body === "object") {
      body = JSON.stringify(req.body);
      headers.set("content-type", "application/json");
    } else if (typeof req.body === "string" || req.body instanceof Buffer) {
      body = req.body;
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "follow",
    });

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding" || key.toLowerCase() === "content-length") {
        return;
      }
      res.setHeader(key, value);
    });

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Custom ADK proxy error", error);
    res.status(502).json({ error: "Failed to reach custom ADK runtime" });
  }
}

app.use("/api/custom-adk", proxyCustomAdkRequest);

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
    normalizeEnvValue(process.env.COPILOTKIT_RUNTIME_URL);
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

function handleProxyResponse(res, result) {
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
}

function handleProxyError(res, error) {
  if (error instanceof ProxyError) {
    res.status(error.status ?? 500).json({
      error: error.message,
      details: error.details ?? null
    });
    return;
  }

  console.error("Unexpected proxy error", error);
  res.status(500).json({ error: "Unexpected server error" });
}

app.post("/api/geospatial/nepassist", async (req, res) => {
  try {
    const result = await callNepassistProxy(req.body ?? {});
    handleProxyResponse(res, result);
  } catch (error) {
    handleProxyError(res, error);
  }
});

app.post("/api/geospatial/ipac", async (req, res) => {
  try {
    const result = await callIpacProxy(req.body ?? {});
    handleProxyResponse(res, result);
  } catch (error) {
    handleProxyError(res, error);
  }
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
