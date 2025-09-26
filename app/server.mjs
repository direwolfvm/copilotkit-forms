import express from "express";
import { join, dirname } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "dist");
const port = parseInt(process.env.PORT ?? "8080", 10);

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
