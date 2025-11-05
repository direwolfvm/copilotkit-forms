const DEFAULT_BUFFER_MILES = 0.1;
const NEPA_ARCGIS_URL = "https://nepassisttool.epa.gov/nepassist/api/arcgis/geometry/buffer";
const NEPA_BROKER_URL = "https://nepassisttool.epa.gov/nepassist/nepaRESTbroker.aspx";
const IPAC_URL = "https://ipac.ecosphere.fws.gov/location/api/resources";
const USER_AGENT = "copilotkit-forms-geospatial-proxy/1.0";

class ProxyError extends Error {
  constructor(message, status = 500, details) {
    super(message);
    this.name = "ProxyError";
    this.status = status;
    this.details = details;
  }
}

function normalizeBufferMiles(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return DEFAULT_BUFFER_MILES;
}

function flattenCoordinates(coords) {
  if (coords === undefined || coords === null) {
    return "";
  }
  if (Array.isArray(coords)) {
    if (coords.length === 0) {
      return "";
    }
    if (Array.isArray(coords[0])) {
      const flat = [];
      for (const value of coords) {
        if (!Array.isArray(value)) {
          continue;
        }
        if (typeof value[0] === "number" && typeof value[1] === "number") {
          flat.push(value[0], value[1]);
        } else if (Array.isArray(value[0])) {
          for (const nested of value) {
            if (Array.isArray(nested) && typeof nested[0] === "number" && typeof nested[1] === "number") {
              flat.push(nested[0], nested[1]);
            }
          }
        }
      }
      return flat.join(",");
    }
    return coords.join(",");
  }
  if (typeof coords === "object") {
    if (typeof coords.x === "number" && typeof coords.y === "number") {
      return `${coords.x},${coords.y}`;
    }
  }
  return String(coords);
}

async function tryFetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }
  return { response, data, rawText: text };
}

export async function callNepassistProxy(payload = {}) {
  const coordsParam = flattenCoordinates(payload.coords);
  const typeParam = typeof payload.type === "string" ? payload.type : "";
  const bufferMiles = normalizeBufferMiles(payload.bufferMiles ?? payload.bufferSize ?? payload.newBufferDistance);

  if (!coordsParam) {
    throw new ProxyError("Missing geometry coordinates for NEPA Assist request.", 400);
  }

  const brokerUrl = new URL(NEPA_BROKER_URL);
  brokerUrl.searchParams.set("ptitle", "");
  brokerUrl.searchParams.set("coords", coordsParam);
  brokerUrl.searchParams.set("type", typeParam);
  brokerUrl.searchParams.set("newBufferDistance", bufferMiles.toString());
  brokerUrl.searchParams.set("newBufferUnits", "miles");
  brokerUrl.searchParams.set("f", "pjson");

  const arcgisOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      coords: payload.coords,
      type: typeParam,
      bufferSize: bufferMiles,
      newBufferUnits: "miles"
    })
  };

  try {
    const { response, data, rawText } = await tryFetchJson(NEPA_ARCGIS_URL, arcgisOptions);
    if (response.ok && data) {
      return {
        data,
        meta: {
          upstreamUrl: NEPA_ARCGIS_URL,
          bufferMiles,
          type: typeParam,
          coords: coordsParam,
          usedFallback: false
        }
      };
    }
    if (!response.ok) {
      console.warn("NEPA ArcGIS endpoint returned status", response.status, rawText?.slice(0, 400));
    }
  } catch (error) {
    console.warn("Failed to reach NEPA ArcGIS endpoint, falling back to broker:", error?.message || error);
  }

  const { response: brokerResponse, data: brokerData, rawText: brokerRaw } = await tryFetchJson(
    brokerUrl.toString()
  );

  if (!brokerResponse.ok) {
    throw new ProxyError(
      `NEPA Assist upstream error ${brokerResponse.status}`,
      brokerResponse.status,
      typeof brokerData === "string" ? brokerData : brokerData?.error ?? brokerRaw
    );
  }

  return {
    data: brokerData,
    meta: {
      upstreamUrl: brokerUrl.toString(),
      bufferMiles,
      type: typeParam,
      coords: coordsParam,
      usedFallback: true
    }
  };
}

export async function callIpacProxy(payload = {}) {
  if (!payload || typeof payload !== "object") {
    throw new ProxyError("Invalid IPaC payload.", 400);
  }

  const bodyText = JSON.stringify(payload);

  const { response, data, rawText } = await tryFetchJson(IPAC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyText
  });

  if (!response.ok) {
    throw new ProxyError(
      `IPaC upstream error ${response.status}`,
      response.status,
      typeof data === "string" ? data : data?.error ?? rawText
    );
  }

  return {
    data,
    meta: {
      upstreamUrl: IPAC_URL,
      payloadSize: bodyText.length
    }
  };
}

export { ProxyError };
