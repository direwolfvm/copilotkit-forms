import express from "express";
import { join, dirname } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "url";

import { callIpacProxy, callNepassistProxy, ProxyError } from "./server/geospatialProxy.js";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "dist");
const port = parseInt(process.env.PORT ?? "8080", 10);
const customAdkBaseUrl =
  normalizeEnvValue(process.env.COPILOTKIT_CUSTOM_ADK_URL) ??
  "https://permitting-adk-650621702399.us-east4.run.app";

function resolveSupabaseUrl() {
  return (
    normalizeEnvValue(process.env.VITE_SUPABASE_URL) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    normalizeEnvValue(process.env.SUPABASE_URL)
  );
}

function resolveSupabaseAnonKey() {
  return (
    normalizeEnvValue(process.env.VITE_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.SUPABASE_PUBLIC_ANON_KEY)
  );
}

function resolvePermitflowUrl() {
  return (
    normalizeEnvValue(process.env.VITE_PERMITFLOW_SUPABASE_URL) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_PERMITFLOW_SUPABASE_URL) ??
    normalizeEnvValue(process.env.PERMITFLOW_SUPABASE_URL)
  );
}

function resolvePermitflowAnonKey() {
  return (
    normalizeEnvValue(process.env.VITE_PERMITFLOW_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_PERMITFLOW_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.PERMITFLOW_SUPABASE_ANON_KEY)
  );
}

function resolveReviewworksUrl() {
  return (
    normalizeEnvValue(process.env.VITE_REVIEWWORKS_SUPABASE_URL) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_REVIEWWORKS_SUPABASE_URL) ??
    normalizeEnvValue(process.env.REVIEWWORKS_SUPABASE_URL)
  );
}

function resolveReviewworksAnonKey() {
  return (
    normalizeEnvValue(process.env.VITE_REVIEWWORKS_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_REVIEWWORKS_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.REVIEWWORKS_SUPABASE_ANON_KEY)
  );
}

app.use(express.json({ limit: "1mb" }));

function normalizeEnvValue(value) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function proxyCustomAdkRequest(req, res) {
  if (shouldHandleGraphqlCustomAdk(req)) {
    await handleGraphqlCustomAdkRequest(req, res);
    return;
  }

  const requestedPath = req.url ?? "/";
  let proxyPath;

  // The Copilot Runtime expects requests to be routed through the `/agent` entrypoint.
  // When the frontend hits the base proxy URL we implicitly redirect to that path so the
  // deployment works even if the caller forgot the suffix.
  if (requestedPath === "/") {
    proxyPath = "/agent";
  } else if (requestedPath.startsWith("/?")) {
    proxyPath = `/agent${requestedPath.slice(1)}`;
  } else if (requestedPath.length === 0) {
    proxyPath = "/agent";
  } else {
    proxyPath = requestedPath;
  }

  const targetUrl = new URL(proxyPath, customAdkBaseUrl);

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
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === "transfer-encoding" ||
        lowerKey === "content-length" ||
        lowerKey === "content-encoding"
      ) {
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

async function proxySupabaseRequest(req, res) {
  const supabaseUrl = resolveSupabaseUrl();
  const supabaseAnonKey = resolveSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: "Supabase credentials are not configured" });
    return;
  }

  const targetUrl = new URL(req.url ?? "/", supabaseUrl);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) {
      continue;
    }

    const lowerKey = key.toLowerCase();
    if (lowerKey === "host" || lowerKey === "content-length") {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    } else {
      headers.set(key, value);
    }
  }

  headers.set("apikey", supabaseAnonKey);
  headers.set("Authorization", `Bearer ${supabaseAnonKey}`);

  const method = req.method?.toUpperCase() ?? "GET";
  const hasBody = !["GET", "HEAD"].includes(method);

  let body;
  if (hasBody) {
    if (req.is("application/json") && req.body && typeof req.body === "object") {
      body = JSON.stringify(req.body);
      headers.set("content-type", "application/json");
    } else if (typeof req.body === "string" || req.body instanceof Buffer) {
      body = req.body;
    } else {
      body = await readRawRequestBody(req);
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
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === "transfer-encoding" ||
        lowerKey === "content-length" ||
        lowerKey === "content-encoding"
      ) {
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
    console.error("Supabase proxy error", error);
    res.status(502).json({ error: "Failed to reach Supabase" });
  }
}

async function readRawRequestBody(req) {
  if (!req.readable || req.readableEnded) {
    return undefined;
  }

  const chunks = [];

  return new Promise((resolve, reject) => {
    req.on("error", reject);
    req.on("aborted", () => {
      reject(new Error("Client aborted the request while reading the body."));
    });
    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0));
    });
  });
}

function shouldHandleGraphqlCustomAdk(req) {
  if (req.method?.toUpperCase() !== "POST") {
    return false;
  }

  const contentType = req.headers["content-type"] || req.headers["Content-Type"];
  if (typeof contentType === "string" && !contentType.includes("application/json")) {
    return false;
  }

  if (!req.body || typeof req.body !== "object") {
    return false;
  }

  const { query, operationName } = req.body;
  if (typeof query !== "string") {
    return false;
  }

  if (operationName === "availableAgents" || query.includes("availableAgents")) {
    return true;
  }

  if (operationName === "loadAgentState" || query.includes("loadAgentState")) {
    return true;
  }

  if (operationName === "generateCopilotResponse" || query.includes("generateCopilotResponse")) {
    return true;
  }

  return false;
}

async function handleGraphqlCustomAdkRequest(req, res) {
  const { operationName, query, variables } = req.body ?? {};

  if (operationName === "availableAgents" || query?.includes("availableAgents")) {
    res.json({ data: { availableAgents: { agents: [] } } });
    return;
  }

  if (operationName === "loadAgentState" || query?.includes("loadAgentState")) {
    const threadId = variables?.data?.threadId ?? "";
    const agentName = variables?.data?.agentName ?? "";
    res.json({
      data: {
        loadAgentState: {
          threadId,
          agentName,
          messages: JSON.stringify([]),
        },
      },
    });
    return;
  }

  if (!(operationName === "generateCopilotResponse" || query?.includes("generateCopilotResponse"))) {
    res.status(400).json({ error: "Unsupported custom ADK operation" });
    return;
  }

  const runtimeData = variables?.data;
  if (!runtimeData || typeof runtimeData !== "object") {
    res.status(400).json({ error: "Invalid Copilot request payload" });
    return;
  }

  const threadId = typeof runtimeData.threadId === "string" && runtimeData.threadId
    ? runtimeData.threadId
    : randomUUID();
  const runId = typeof runtimeData.runId === "string" && runtimeData.runId
    ? runtimeData.runId
    : randomUUID();

  const tools = buildAdkTools(runtimeData.frontend?.actions ?? []);
  const messages = buildAdkMessages(runtimeData.messages ?? []);
  const context = buildAdkContext(runtimeData.frontend);
  const state = buildAdkState(runtimeData.agentStates ?? []);
  const forwardedProps = buildForwardedProps(runtimeData.forwardedParameters, variables?.properties);

  try {
    const response = await fetch(new URL("/agent", customAdkBaseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId,
        runId,
        state,
        messages,
        tools,
        context,
        forwardedProps,
      }),
    });

    if (!response.ok || !response.body) {
      const errorPayload = await safeParseJson(response);
      res.status(response.status).json(
        errorPayload ?? { error: "Custom ADK request failed", status: response.status },
      );
      return;
    }

    const events = await collectSseEvents(response.body);
    const gqlPayload = buildGraphqlResponseFromEvents(events, threadId, runId);
    res.json({ data: { generateCopilotResponse: gqlPayload } });
  } catch (error) {
    console.error("Custom ADK GraphQL bridge error", error);
    res.status(502).json({ error: "Failed to process custom ADK response" });
  }
}

function buildAdkTools(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .map((action) => {
      if (!action || typeof action !== "object") {
        return null;
      }

      const name = typeof action.name === "string" ? action.name : undefined;
      if (!name) {
        return null;
      }

      const description = typeof action.description === "string" ? action.description : "";
      let parameters;
      if (typeof action.jsonSchema === "string") {
        try {
          parameters = JSON.parse(action.jsonSchema);
        } catch (error) {
          console.warn("Failed to parse action jsonSchema", error);
          parameters = {};
        }
      } else if (action.jsonSchema && typeof action.jsonSchema === "object") {
        parameters = action.jsonSchema;
      } else {
        parameters = {};
      }

      return {
        name,
        description,
        parameters,
      };
    })
    .filter(Boolean);
}

function buildAdkMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const result = [];

  for (const entry of messages) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (entry.textMessage) {
      const text = entry.textMessage;
      const role = normalizeRole(text.role);
      const message = {
        id: entry.id ?? randomUUID(),
        role,
        content: typeof text.content === "string" ? text.content : "",
      };
      if (typeof text.parentMessageId === "string") {
        message.parentMessageId = text.parentMessageId;
      }
      result.push(message);
      continue;
    }

    if (entry.actionExecutionMessage) {
      const actionMessage = entry.actionExecutionMessage;
      const toolMessage = {
        id: entry.id ?? randomUUID(),
        role: "tool",
        content:
          typeof actionMessage.arguments === "string"
            ? actionMessage.arguments
            : JSON.stringify(actionMessage.arguments ?? {}),
        toolCallId: actionMessage.parentMessageId ?? entry.id ?? randomUUID(),
      };
      result.push(toolMessage);
      continue;
    }

    if (entry.resultMessage) {
      const resultMessage = entry.resultMessage;
      const toolMessage = {
        id: entry.id ?? randomUUID(),
        role: "tool",
        content:
          typeof resultMessage.result === "string"
            ? resultMessage.result
            : JSON.stringify(resultMessage.result ?? {}),
        toolCallId: resultMessage.actionExecutionId ?? entry.id ?? randomUUID(),
      };
      result.push(toolMessage);
      continue;
    }
  }

  return result;
}

function normalizeRole(role) {
  if (typeof role !== "string") {
    return "user";
  }
  return role.toLowerCase();
}

function buildAdkContext(frontend) {
  if (!frontend || typeof frontend !== "object") {
    return [];
  }

  const context = [];
  if (typeof frontend.url === "string" && frontend.url) {
    context.push({ description: "Request origin", value: frontend.url });
  }

  if (typeof frontend.toDeprecate_fullContext === "string" && frontend.toDeprecate_fullContext) {
    context.push({ description: "Form context", value: frontend.toDeprecate_fullContext });
  }

  return context;
}

function buildAdkState(agentStates) {
  if (!Array.isArray(agentStates) || agentStates.length === 0) {
    return {};
  }

  return { agentStates };
}

function buildForwardedProps(forwardedParameters, properties) {
  const props = {};
  if (forwardedParameters && typeof forwardedParameters === "object") {
    props.forwardedParameters = forwardedParameters;
  }
  if (properties && typeof properties === "object") {
    props.properties = properties;
  }
  return props;
}

async function safeParseJson(response) {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

async function collectSseEvents(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const lines = rawEvent.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }

        try {
          events.push(JSON.parse(payload));
        } catch (error) {
          console.warn("Failed to parse SSE payload", payload, error);
        }
      }
    }
  }

  return events;
}

function buildGraphqlResponseFromEvents(events, threadId, runId) {
  const textMessages = new Map();
  const toolMessages = new Map();

  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }

    switch (event.type) {
      case "TEXT_MESSAGE_START": {
        const id = event.messageId ?? randomUUID();
        textMessages.set(id, {
          id,
          role: event.role ?? "assistant",
          parts: [],
        });
        break;
      }
      case "TEXT_MESSAGE_CONTENT": {
        const id = event.messageId;
        if (!id || !textMessages.has(id)) {
          break;
        }
        const entry = textMessages.get(id);
        entry.parts.push(typeof event.delta === "string" ? event.delta : "");
        break;
      }
      case "TEXT_MESSAGE_END": {
        const id = event.messageId;
        if (!id || !textMessages.has(id)) {
          break;
        }
        const entry = textMessages.get(id);
        entry.finished = true;
        break;
      }
      case "TOOL_CALL_START": {
        const id = event.toolCallId ?? randomUUID();
        toolMessages.set(id, {
          id,
          name: event.toolCallName ?? "tool_call",
          parentMessageId: event.parentMessageId ?? null,
          parts: [],
        });
        break;
      }
      case "TOOL_CALL_ARGS": {
        const id = event.toolCallId;
        if (!id || !toolMessages.has(id)) {
          break;
        }
        const entry = toolMessages.get(id);
        entry.parts.push(typeof event.delta === "string" ? event.delta : "");
        break;
      }
      case "TOOL_CALL_END": {
        const id = event.toolCallId;
        if (!id || !toolMessages.has(id)) {
          break;
        }
        const entry = toolMessages.get(id);
        entry.finished = true;
        break;
      }
      default:
        break;
    }
  }

  const messages = [];

  for (const entry of textMessages.values()) {
    const content = entry.parts.join("");
    messages.push({
      __typename: "TextMessageOutput",
      id: entry.id,
      createdAt: new Date().toISOString(),
      role: entry.role,
      parentMessageId: null,
      content: [content],
      status: {
        __typename: "SuccessMessageStatus",
        code: "OK",
      },
    });
  }

  for (const entry of toolMessages.values()) {
    const args = entry.parts.join("");
    messages.push({
      __typename: "ActionExecutionMessageOutput",
      id: entry.id,
      createdAt: new Date().toISOString(),
      name: entry.name,
      arguments: [args],
      parentMessageId: entry.parentMessageId,
      status: {
        __typename: "SuccessMessageStatus",
        code: "OK",
      },
    });
  }

  return {
    threadId,
    runId,
    extensions: null,
    status: {
      __typename: "BaseResponseStatus",
      code: "OK",
    },
    messages,
    metaEvents: [],
  };
}

app.use("/api/supabase", proxySupabaseRequest);

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

  const supabaseUrl = resolveSupabaseUrl();
  if (supabaseUrl) {
    config.supabaseUrl = supabaseUrl;
  }

  const supabaseAnonKey = resolveSupabaseAnonKey();
  if (supabaseAnonKey) {
    config.supabaseAnonKey = supabaseAnonKey;
  }

  const permitflowUrl = resolvePermitflowUrl();
  if (permitflowUrl) {
    config.permitflowUrl = permitflowUrl;
  }

  const permitflowAnonKey = resolvePermitflowAnonKey();
  if (permitflowAnonKey) {
    config.permitflowAnonKey = permitflowAnonKey;
  }

  const reviewworksUrl = resolveReviewworksUrl();
  if (reviewworksUrl) {
    config.reviewworksUrl = reviewworksUrl;
  }

  const reviewworksAnonKey = resolveReviewworksAnonKey();
  if (reviewworksAnonKey) {
    config.reviewworksAnonKey = reviewworksAnonKey;
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
