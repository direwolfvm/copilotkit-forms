import { useCallback, useMemo, useState } from "react"
import type { ChangeEvent } from "react"

import { CopilotKit, useCopilotReadable } from "@copilotkit/react-core"
import { CopilotSidebar } from "@copilotkit/react-ui"
import "@copilotkit/react-ui/styles.css"

import "./copilot-overrides.css"
import "./App.css"

import { ArcgisSketchMap } from "./components/ArcgisSketchMap"
import type { GeometryChange, UploadedGisFile } from "./types/gis"
import type { GeospatialResultsState, NepassistSummaryItem } from "./types/geospatial"
import {
  DEFAULT_BUFFER_MILES,
  formatGeospatialResultsSummary,
  prepareGeospatialPayload,
  summarizeIpac,
  summarizeNepassist
} from "./utils/geospatial"
import { getPublicApiKey, getRuntimeUrl } from "./runtimeConfig"
import { COPILOT_CLOUD_CHAT_URL } from "@copilotkit/shared"

function createInitialGeospatialResults(): GeospatialResultsState {
  return {
    nepassist: { status: "idle" },
    ipac: { status: "idle" },
    messages: [],
    lastRunAt: undefined
  }
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) {
    return undefined
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

function countHighPriorityFindings(items: NepassistSummaryItem[] | undefined) {
  if (!items || items.length === 0) {
    return 0
  }
  return items.filter((item) => item.severity === "yes" || item.severity === "ondemand").length
}

function buildImplicationLines(results: GeospatialResultsState): string[] {
  const lines: string[] = []

  if (!results.lastRunAt) {
    return lines
  }

  const nepa = results.nepassist
  if (nepa.status === "success" && nepa.summary) {
    const elevated = countHighPriorityFindings(nepa.summary)
    if (elevated > 0) {
      lines.push(
        `NEPA: ${elevated} screened resources may require a higher level of NEPA review or mitigation planning. Review the NEPA Assist findings to scope the appropriate document and extraordinary circumstance checks.`
      )
    } else {
      lines.push(
        "NEPA: No elevated concerns were returned by NEPA Assist. Continue with the planned level of review and document any routine conditions."
      )
    }
  } else if (nepa.status === "error") {
    lines.push(
      `NEPA: Screening results were unavailable (${nepa.error ?? "unknown error"}). Document the outage and consider alternative mapping sources before advancing NEPA decisions.`
    )
  } else {
    lines.push("NEPA: Screening has not returned any findings yet.")
  }

  const ipac = results.ipac
  if (ipac.status === "success" && ipac.summary) {
    if (ipac.summary.listedSpecies.length > 0 || ipac.summary.criticalHabitats.length > 0) {
      const species = ipac.summary.listedSpecies.slice(0, 5).join(", ")
      const habitats = ipac.summary.criticalHabitats.slice(0, 5).join(", ")
      const speciesText = species ? `listed species (${species})` : "listed species"
      const habitatText = habitats ? `critical habitats (${habitats})` : "critical habitats"
      lines.push(
        `Endangered Species Act: IPaC identified ${speciesText} and ${habitatText}. Coordinate with the U.S. Fish and Wildlife Service for consultation needs and survey timing.`
      )
    } else {
      lines.push(
        "Endangered Species Act: IPaC did not flag listed species or critical habitats. Keep records of the IPaC response to support any No Effect determinations."
      )
    }

    if (ipac.summary.wetlands.length > 0) {
      const wetlands = ipac.summary.wetlands
        .slice(0, 5)
        .map((wetland) => (wetland.acres ? `${wetland.name} (${wetland.acres} ac)` : wetland.name))
        .join(", ")
      lines.push(
        `Clean Water Act: Wetlands of interest were noted (${wetlands}). Engage the U.S. Army Corps of Engineers early to confirm jurisdiction and permitting requirements.`
      )
    } else {
      lines.push(
        "Clean Water Act: No wetlands of concern were identified in IPaC. Field verification is still recommended before finalizing Section 404 determinations."
      )
    }

    if (ipac.summary.migratoryBirds.length > 0) {
      lines.push(
        "Clean Air Act: Sensitive biological resources were identified. Coordinate construction schedules and emissions planning to minimize indirect impacts alongside Clean Air Act conformity reviews."
      )
    } else {
      lines.push(
        "Clean Air Act: No migratory bird hotspots were highlighted. Continue with standard conformity analyses for the project area."
      )
    }
  } else if (ipac.status === "error") {
    lines.push(
      `Endangered Species Act: IPaC data was unavailable (${ipac.error ?? "unknown error"}). Document the outage and contact the U.S. Fish and Wildlife Service directly.`
    )
    lines.push("Clean Water Act: IPaC wetlands were unavailable; coordinate wetland delineations manually and consult the Corps as needed.")
    lines.push("Clean Air Act: Proceed with regular conformity analysis; no biological screening results were returned to adjust the approach.")
  } else {
    lines.push("Endangered Species Act: Screening results are pending.")
    lines.push("Clean Water Act: Screening results are pending.")
    lines.push("Clean Air Act: Screening results are pending.")
  }

  lines.push(
    "National Historic Preservation Act: Use these geospatial findings to inform the Area of Potential Effects and coordinate early with the SHPO/THPO; additional cultural resource surveys may still be required."
  )
  lines.push(
    "Tribal consultation: Share the screening summary with tribal partners and incorporate their knowledge of resources before scoping project alternatives."
  )

  return lines
}

function formatImplicationsForCopilot(results: GeospatialResultsState) {
  const lines = buildImplicationLines(results)
  if (!results.lastRunAt || lines.length === 0) {
    return "No geospatial screening has been completed yet."
  }

  return [
    "Resource implications summary:",
    `Last run: ${formatTimestamp(results.lastRunAt) ?? "unknown"}`,
    ...lines.map((line) => `- ${line}`)
  ].join("\n")
}

const publicApiKey = getPublicApiKey()
const defaultRuntimeUrl = getRuntimeUrl() || COPILOT_CLOUD_CHAT_URL

export function ResourceCheckContent() {
  const [geometry, setGeometry] = useState<string | undefined>(undefined)
  const [arcgisJson, setArcgisJson] = useState<string | undefined>(undefined)
  const [uploadedGisFile, setUploadedGisFile] = useState<UploadedGisFile | null>(null)
  const [locationNotes, setLocationNotes] = useState("")
  const [bufferInput, setBufferInput] = useState<string>(DEFAULT_BUFFER_MILES.toString())
  const [geospatialResults, setGeospatialResults] = useState<GeospatialResultsState>(
    () => createInitialGeospatialResults()
  )

  const bufferMiles = useMemo(() => {
    const value = Number.parseFloat(bufferInput)
    if (!Number.isFinite(value) || value < 0) {
      return DEFAULT_BUFFER_MILES
    }
    return value
  }, [bufferInput])

  const instructions = useMemo(
    () =>
      [
        "You help interpret project resource screenings and suggest next steps for environmental review.",
        "Highlight implications for NEPA, ESA, the Clean Water Act, Clean Air Act, NHPA, and tribal consultation.",
        "Use the latest geospatial results and summaries to tailor your guidance."
      ].join("\n"),
    []
  )

  const hasGeometry = Boolean(geometry)
  const lastRunLabel = formatTimestamp(geospatialResults.lastRunAt)
  const implicationLines = useMemo(() => buildImplicationLines(geospatialResults), [geospatialResults])

  useCopilotReadable(
    {
      description: "Latest geospatial screening results for Resource Check",
      value: geospatialResults,
      convert: (_, value) => formatGeospatialResultsSummary(value)
    },
    [geospatialResults]
  )

  useCopilotReadable(
    {
      description: "Resource implications derived from the current screening",
      value: geospatialResults,
      convert: (_, value) => formatImplicationsForCopilot(value)
    },
    [geospatialResults]
  )

  useCopilotReadable(
    {
      description: "Field notes captured during the Resource Check session",
      value: locationNotes,
      convert: (_, value) => value || "No notes provided."
    },
    [locationNotes]
  )

  const handleGeometryChange = useCallback((change: GeometryChange) => {
    const { geoJson, arcgisJson: arcgisString, source, uploadedFile } = change
    setGeometry(geoJson)
    setArcgisJson(arcgisString)
    if (source === "upload") {
      setUploadedGisFile(uploadedFile ?? null)
    } else if (uploadedFile === null || source) {
      setUploadedGisFile(null)
    }
  }, [])

  const handleClearGeometry = useCallback(() => {
    setGeometry(undefined)
    setArcgisJson(undefined)
    setUploadedGisFile(null)
  }, [])

  const handleBufferChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setBufferInput(event.target.value)
  }, [])

  const handleRunGeospatial = useCallback(async () => {
    const prepared = prepareGeospatialPayload(geometry ?? null)
    const messages = prepared.errors
    const ipacNotice = messages.find((message) => message.toLowerCase().includes("ipac"))
    const generalMessages = ipacNotice ? messages.filter((message) => message !== ipacNotice) : messages

    setGeospatialResults({
      nepassist: prepared.nepassist
        ? { status: "loading" }
        : { status: "error", error: generalMessages[0] ?? "Unable to prepare NEPA Assist request." },
      ipac: prepared.ipac
        ? { status: "loading" }
        : {
            status: "error",
            error: ipacNotice ?? generalMessages[0] ?? "IPaC is not available for this geometry."
          },
      lastRunAt: new Date().toISOString(),
      messages: generalMessages.length ? generalMessages : undefined
    })

    const tasks: Promise<void>[] = []

    if (prepared.nepassist) {
      const body = {
        coords: prepared.nepassist.coords,
        type: prepared.nepassist.type,
        bufferMiles
      }

      tasks.push(
        (async () => {
          try {
            const response = await fetch("/api/geospatial/nepassist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            })
            const text = await response.text()
            let payload: any = null
            if (text) {
              try {
                payload = JSON.parse(text)
              } catch {
                payload = { data: text }
              }
            }
            if (!response.ok) {
              const message =
                (payload && typeof payload === "object" && typeof payload.error === "string"
                  ? payload.error
                  : text) || `NEPA Assist request failed (${response.status})`
              throw new Error(message)
            }
            const data = payload && typeof payload === "object" && "data" in payload ? payload.data : payload
            setGeospatialResults((previous) => ({
              ...previous,
              nepassist: {
                status: "success",
                summary: summarizeNepassist(data),
                raw: data,
                meta: payload?.meta
              }
            }))
          } catch (error) {
            const message = error instanceof Error ? error.message : "NEPA Assist request failed."
            setGeospatialResults((previous) => ({
              ...previous,
              nepassist: { status: "error", error: message }
            }))
          }
        })()
      )
    }

    if (prepared.ipac) {
      const body = {
        projectLocationWKT: prepared.ipac.wkt,
        includeOtherFwsResources: true,
        includeCrithabGeometry: false,
        saveLocationForProjectCreation: false,
        timeout: 5
      }

      tasks.push(
        (async () => {
          try {
            const response = await fetch("/api/geospatial/ipac", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            })
            const text = await response.text()
            let payload: any = null
            if (text) {
              try {
                payload = JSON.parse(text)
              } catch {
                payload = { data: text }
              }
            }
            if (!response.ok) {
              const message =
                (payload && typeof payload === "object" && typeof payload.error === "string"
                  ? payload.error
                  : text) || `IPaC request failed (${response.status})`
              throw new Error(message)
            }
            const data = payload && typeof payload === "object" && "data" in payload ? payload.data : payload
            setGeospatialResults((previous) => ({
              ...previous,
              ipac: {
                status: "success",
                summary: summarizeIpac(data),
                raw: data,
                meta: payload?.meta
              }
            }))
          } catch (error) {
            const message = error instanceof Error ? error.message : "IPaC request failed."
            setGeospatialResults((previous) => ({
              ...previous,
              ipac: { status: "error", error: message }
            }))
          }
        })()
      )
    }

    if (tasks.length === 0) {
      return
    }

    await Promise.allSettled(tasks)
  }, [geometry, bufferMiles])

  const isRunning =
    geospatialResults.nepassist.status === "loading" || geospatialResults.ipac.status === "loading"

  return (
    <CopilotSidebar
      instructions={instructions}
      defaultOpen
      clickOutsideToClose={false}
      labels={{ title: "Resource Copilot" }}
    >
      <main className="app">
        <div className="app__inner">
          <header className="app-header">
            <div>
              <h1>Resource Check</h1>
              <p>
                Draw your project footprint, set an optional analysis buffer, and run the built-in screening tools. The
                Copilot summarizes the implications for key environmental reviews.
              </p>
            </div>
          </header>

          <section className="content">
            <div className="location-card">
              <div className="location-card__header">
                <div>
                  <h2>Project footprint</h2>
                  <p className="help-block">
                    Search for an address or navigate the map, then draw a point, line, or polygon to capture the project
                    area. Use the clear option to start over.
                  </p>
                </div>
                <button type="button" className="link-button" onClick={handleClearGeometry}>
                  Clear shape
                </button>
              </div>
              <textarea
                className="location-card__textarea"
                placeholder="Add optional notes about the location or constraints revealed during screening."
                value={locationNotes}
                onChange={(event) => setLocationNotes(event.target.value)}
                rows={3}
              />
              <div className="location-card__map">
                <ArcgisSketchMap
                  geometry={geometry}
                  onGeometryChange={handleGeometryChange}
                  enableFileUpload
                  activeUploadFileName={uploadedGisFile?.fileName}
                />
                <input type="hidden" name="location_object" value={geometry ?? ""} readOnly aria-hidden="true" />
                <input type="hidden" name="location_arcgis_json" value={arcgisJson ?? ""} readOnly aria-hidden="true" />
              </div>
            </div>

            <div className="form-panel">
              <div className="form-panel__header">
                <h2>Screening controls</h2>
                <p className="help-block">
                  Choose the analysis buffer for NEPA Assist (miles) and run the combined NEPA Assist and IPaC screening.
                </p>
              </div>
              <div className="form-panel__body">
                <label className="form-field">
                  <span>Buffer distance (miles)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={bufferInput}
                    onChange={handleBufferChange}
                  />
                </label>
                <button
                  type="button"
                  className="usa-button primary"
                  onClick={handleRunGeospatial}
                  disabled={!hasGeometry || isRunning}
                >
                  {isRunning ? "Running geospatial screen…" : "Run geospatial screen"}
                </button>
                {!hasGeometry ? (
                  <p className="help-block geospatial-footer__hint">
                    Draw a project geometry to enable the screening tools.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="form-panel">
              <div className="form-panel__header">
                <h2>Latest screening results</h2>
                <p className="help-block">
                  Review system messages and summaries, then check the resource implications below to inform next steps.
                </p>
              </div>
              <div className="form-panel__body">
                <div className="geospatial-results">
                  <div className="geospatial-results__header">
                    <h3>Geospatial services</h3>
                    <span className="geospatial-results__timestamp" aria-live="polite">
                      {lastRunLabel ? `Last run ${lastRunLabel}` : "Not yet run"}
                    </span>
                  </div>
                  {geospatialResults.messages && geospatialResults.messages.length > 0 ? (
                    <ul className="geospatial-results__messages">
                      {geospatialResults.messages.map((message, index) => (
                        <li key={`resource-message-${index}`}>{message}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="geospatial-results__cards">
                    <div className="geospatial-results__card" aria-live="polite">
                      <h4>NEPA Assist</h4>
                      {geospatialResults.nepassist.status === "loading" ? (
                        <p className="geospatial-results__status">Running geospatial query…</p>
                      ) : geospatialResults.nepassist.status === "error" ? (
                        <p className="geospatial-results__status error">
                          {geospatialResults.nepassist.error ?? "The screening request failed."}
                        </p>
                      ) : geospatialResults.nepassist.status === "success" &&
                        geospatialResults.nepassist.summary ? (
                        <div className="geospatial-results__table-wrapper">
                          <table className="geospatial-results__table">
                            <thead>
                              <tr>
                                <th scope="col">Question</th>
                                <th scope="col">Result</th>
                              </tr>
                            </thead>
                            <tbody>
                              {geospatialResults.nepassist.summary.map((item, index) => (
                                <tr key={`${item.question}-${index}`}>
                                  <td>{item.question}</td>
                                  <td>{item.displayAnswer}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="geospatial-results__status muted">
                          Run the geospatial screen to request NEPA Assist data.
                        </p>
                      )}
                    </div>
                    <div className="geospatial-results__card" aria-live="polite">
                      <h4>IPaC</h4>
                      {geospatialResults.ipac.status === "loading" ? (
                        <p className="geospatial-results__status">Running geospatial query…</p>
                      ) : geospatialResults.ipac.status === "error" ? (
                        <p className="geospatial-results__status error">
                          {geospatialResults.ipac.error ?? "The screening request failed."}
                        </p>
                      ) : geospatialResults.ipac.status === "success" && geospatialResults.ipac.summary ? (
                        <div className="geospatial-results__ipac">
                          <ul>
                            <li>
                              <strong>Location</strong>: {geospatialResults.ipac.summary.locationDescription || "Not provided"}
                            </li>
                            <li>
                              <strong>Listed species</strong>:
                              {geospatialResults.ipac.summary.listedSpecies.length ? (
                                <ul>
                                  {geospatialResults.ipac.summary.listedSpecies.map((item, index) => (
                                    <li key={`${item}-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="geospatial-results__status muted">None returned</span>
                              )}
                            </li>
                            <li>
                              <strong>Critical habitat</strong>:
                              {geospatialResults.ipac.summary.criticalHabitats.length ? (
                                <ul>
                                  {geospatialResults.ipac.summary.criticalHabitats.map((item, index) => (
                                    <li key={`${item}-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="geospatial-results__status muted">None returned</span>
                              )}
                            </li>
                            <li>
                              <strong>Migratory birds of concern</strong>:
                              {geospatialResults.ipac.summary.migratoryBirds.length ? (
                                <ul>
                                  {geospatialResults.ipac.summary.migratoryBirds.map((item, index) => (
                                    <li key={`${item}-${index}`}>{item}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="geospatial-results__status muted">None returned</span>
                              )}
                            </li>
                            <li>
                              <strong>Wetlands</strong>:
                              {geospatialResults.ipac.summary.wetlands.length ? (
                                <ul>
                                  {geospatialResults.ipac.summary.wetlands.map((wetland, index) => (
                                    <li key={`${wetland.name}-${index}`}>
                                      {wetland.name}
                                      {wetland.acres ? ` – ${wetland.acres} ac` : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="geospatial-results__status muted">None returned</span>
                              )}
                            </li>
                          </ul>
                        </div>
                      ) : (
                        <p className="geospatial-results__status muted">
                          Run the geospatial screen to request IPaC data.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="resource-implications" aria-live="polite">
                    <h4>Resource implications</h4>
                    {implicationLines.length > 0 ? (
                      <ul>
                        {implicationLines.map((line, index) => (
                          <li key={`implication-${index}`}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="geospatial-results__status muted">
                        Run the geospatial screen to generate resource implications.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </CopilotSidebar>
  )
}

export default function ResourceCheckPage() {
  const effectiveRuntimeUrl = defaultRuntimeUrl
  return (
    <CopilotKit publicApiKey={publicApiKey || undefined} runtimeUrl={effectiveRuntimeUrl || undefined}>
      <ResourceCheckContent />
    </CopilotKit>
  )
}
