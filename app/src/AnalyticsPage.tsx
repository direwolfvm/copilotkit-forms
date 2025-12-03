import { useEffect, useMemo, useState } from "react"
import {
  CopilotKit,
  useCopilotReadable
} from "@copilotkit/react-core"
import { CopilotSidebar } from "@copilotkit/react-ui"
import type { TooltipProps } from "recharts"
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts"
import "@copilotkit/react-ui/styles.css"

import "./copilot-overrides.css"
import "./App.css"
import "./AnalyticsPage.css"

import { COPILOT_CLOUD_CHAT_URL } from "@copilotkit/shared"
import { getPublicApiKey, getRuntimeUrl } from "./runtimeConfig"
import { useCopilotRuntimeSelection } from "./copilotRuntimeContext"
import {
  loadPreScreeningAnalytics,
  type PreScreeningAnalyticsPoint
} from "./utils/projectPersistence"

const publicApiKey = getPublicApiKey()
const defaultRuntimeUrl = getRuntimeUrl() || COPILOT_CLOUD_CHAT_URL
const CUSTOM_ADK_PROXY_URL = "/api/custom-adk/agent"

const ANALYTICS_INSTRUCTIONS = [
  "You are an analytics copilot for the HelpPermit.me pre-screening workflow.",
  "Interpret completion volumes and average completion times to surface notable trends and anomalies.",
  "Reference missing data explicitly when gaps appear in the series."
].join("\n")

const COMPLETIONS_COLOR = "#1f4f99"
const COMPLETIONS_ACCENT_COLOR = "#0f2f66"
const AVERAGE_COLOR = "#f08a24"
const AVERAGE_ACCENT_COLOR = "#f4c95f"

type LoadState = "idle" | "loading" | "success" | "error"

type ChartDatum = {
  date: string
  completions: number | null
  averageDays: number | null
  durationSampleSize: number
}

function formatSummaryForCopilot(points: PreScreeningAnalyticsPoint[]): string {
  if (!Array.isArray(points) || points.length === 0) {
    return "No pre-screening completions are available."
  }

  const completedPoints = points.filter((point) => typeof point.completionCount === "number")
  if (completedPoints.length === 0) {
    return "No pre-screening completions are available."
  }

  const totalCompletions = completedPoints.reduce(
    (sum, point) => sum + (point.completionCount ?? 0),
    0
  )
  const durationSampleSize = points.reduce((sum, point) => sum + point.durationSampleSize, 0)
  const durationTotalDays = points.reduce(
    (sum, point) => sum + (point.durationTotalDays ?? 0),
    0
  )
  const overallAverage =
    durationSampleSize > 0
      ? Math.round((durationTotalDays / durationSampleSize) * 100) / 100
      : null
  const firstDate = completedPoints[0].date
  const lastDate = completedPoints[completedPoints.length - 1].date
  const dailyBreakdown = points
    .map((point) => {
      const completions =
        point.completionCount === null ? "null" : point.completionCount.toString()
      const average =
        point.averageCompletionDays === null
          ? "null"
          : point.averageCompletionDays.toString()
      return `${point.date}: completions=${completions}, avgDays=${average}`
    })
    .join("; ")

  return [
    `Total completed pre-screening processes: ${totalCompletions}.`,
    overallAverage !== null
      ? `Overall average completion time: ${overallAverage} days based on ${durationSampleSize} processes with start and completion timestamps.`
      : "Average completion time is unavailable because matching start timestamps are missing.",
    `Completions span from ${firstDate} to ${lastDate}.`,
    `Daily breakdown: ${dailyBreakdown}.`
  ].join("\n")
}

function formatDisplayDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!value) {
    return undefined
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) {
    return undefined
  }
  return date.toLocaleDateString(undefined, options)
}

function formatAxisDate(value: string) {
  return (
    formatDisplayDate(value, {
      month: "short",
      day: "numeric"
    }) ?? value
  )
}

function AnalyticsTooltip({
  active,
  payload,
  label
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const dateLabel = formatDisplayDate(label, {
    month: "long",
    day: "numeric",
    year: "numeric"
  })

  const datum = payload[0]?.payload as ChartDatum | undefined
  const completionsEntry = payload.find((entry) => entry.dataKey === "completions")
  const averageEntry = payload.find((entry) => entry.dataKey === "averageDays")

  return (
    <div className="analytics-tooltip">
      <p className="analytics-tooltip__title">{dateLabel ?? label}</p>
      <ul className="analytics-tooltip__list">
        <li>
          <span className="analytics-tooltip__label">Completed processes</span>
          <span className="analytics-tooltip__value">
            {typeof completionsEntry?.value === "number" ? completionsEntry.value : "—"}
          </span>
        </li>
        <li>
          <span className="analytics-tooltip__label">Average completion time</span>
          <span className="analytics-tooltip__value">
            {typeof averageEntry?.value === "number"
              ? `${averageEntry.value} days`
              : "—"}
            {datum && datum.durationSampleSize > 0
              ? ` (n=${datum.durationSampleSize})`
              : ""}
          </span>
        </li>
      </ul>
    </div>
  )
}

function AnalyticsContent() {
  const [points, setPoints] = useState<PreScreeningAnalyticsPoint[]>([])
  const [status, setStatus] = useState<LoadState>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    ;(async () => {
      setStatus("loading")
      setError(null)
      try {
        const analytics = await loadPreScreeningAnalytics()
        if (!isMounted) {
          return
        }
        setPoints(analytics)
        setStatus("success")
      } catch (caught) {
        if (!isMounted) {
          return
        }
        const message =
          caught instanceof Error
            ? caught.message
            : "Failed to load analytics data."
        setError(message)
        setStatus("error")
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  useCopilotReadable(
    {
      description:
        "Daily counts of completed pre-screening processes and the corresponding average completion time in days.",
      value: points,
      convert: (_, value) => formatSummaryForCopilot(value)
    },
    [points]
  )

  const chartData: ChartDatum[] = useMemo(
    () =>
      points.map((point) => ({
        date: point.date,
        completions: point.completionCount,
        averageDays: point.averageCompletionDays,
        durationSampleSize: point.durationSampleSize
      })),
    [points]
  )

  const hasCompletions = useMemo(
    () => points.some((point) => typeof point.completionCount === "number"),
    [points]
  )

  const summary = useMemo(() => {
    const totalCompletions = points.reduce(
      (sum, point) => sum + (point.completionCount ?? 0),
      0
    )
    const durationSampleSize = points.reduce((sum, point) => sum + point.durationSampleSize, 0)
    const durationTotal = points.reduce(
      (sum, point) => sum + (point.durationTotalDays ?? 0),
      0
    )
    const overallAverage =
      durationSampleSize > 0
        ? Math.round((durationTotal / durationSampleSize) * 100) / 100
        : null
    const firstCompletion = points.find((point) => typeof point.completionCount === "number")
    const lastCompletion = [...points]
      .reverse()
      .find((point) => typeof point.completionCount === "number")

    return {
      totalCompletions,
      overallAverage,
      firstCompletionDate: firstCompletion?.date,
      latestCompletionDate: lastCompletion?.date
    }
  }, [points])

  return (
    <CopilotSidebar
      instructions={ANALYTICS_INSTRUCTIONS}
      defaultOpen
      clickOutsideToClose={false}
      labels={{ title: "Analytics Copilot" }}
    >
      <main className="app">
        <div className="app__inner">
          <header className="app-header">
            <div>
              <h1>Analytics</h1>
              <p>
                Track daily pre-screening completions and the time it takes to finish each review. Use the
                Copilot to interpret trends or spot gaps in the workflow.
              </p>
            </div>
          </header>

          <section className="content">
            <article className="analytics-card">
              <header className="analytics-card__header">
                <div>
                  <h2 className="analytics-card__title">Pre-screening overview</h2>
                  <p className="analytics-card__subtitle">
                    Totals and timing for all captured pre-screening completions.
                  </p>
                </div>
              </header>
              <div className="analytics-card__body">
                <dl className="analytics-summary">
                  <div className="analytics-summary__item">
                    <dt className="analytics-summary__label">Total completed</dt>
                    <dd className="analytics-summary__value">{summary.totalCompletions}</dd>
                  </div>
                  <div className="analytics-summary__item">
                    <dt className="analytics-summary__label">Overall average</dt>
                    <dd className="analytics-summary__value">
                      {summary.overallAverage !== null
                        ? `${summary.overallAverage} days`
                        : "—"}
                    </dd>
                    {summary.overallAverage !== null ? (
                      <dd className="analytics-summary__hint">
                        Based on {points.reduce((sum, point) => sum + point.durationSampleSize, 0)}
                        {' '}processes.
                      </dd>
                    ) : null}
                  </div>
                  <div className="analytics-summary__item">
                    <dt className="analytics-summary__label">Latest completion</dt>
                    <dd className="analytics-summary__value">
                      {summary.latestCompletionDate
                        ? formatDisplayDate(summary.latestCompletionDate, {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          })
                        : "—"}
                    </dd>
                    {summary.firstCompletionDate && summary.latestCompletionDate ? (
                      <dd className="analytics-summary__hint">
                        Range {formatDisplayDate(summary.firstCompletionDate, {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        })}{" "}
                        –{" "}
                        {formatDisplayDate(summary.latestCompletionDate, {
                          month: "short",
                          day: "numeric",
                          year: "numeric"
                        })}
                      </dd>
                    ) : null}
                  </div>
                </dl>
              </div>
            </article>

            <article className="analytics-card analytics-card--chart">
              <header className="analytics-card__header">
                <div>
                  <h2 className="analytics-card__title">Daily pre-screening outcomes</h2>
                  <p className="analytics-card__subtitle">
                    A line chart with markers showing completed pre-screenings and the average completion
                    time in days.
                  </p>
                </div>
              </header>
              <div className="analytics-card__body">
                {status === "loading" ? (
                  <p className="analytics-status">Loading analytics…</p>
                ) : null}
                {status === "error" ? (
                  <p className="analytics-status analytics-status--error">{error}</p>
                ) : null}
                {status === "success" ? (
                  hasCompletions ? (
                    <div className="analytics-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={chartData}
                          margin={{ top: 16, right: 28, left: 12, bottom: 20 }}
                        >
                          <CartesianGrid stroke="rgba(7, 29, 66, 0.1)" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatAxisDate}
                            tick={{ fontSize: 12, fill: "#071d42" }}
                          />
                          <YAxis
                            yAxisId="left"
                            allowDecimals={false}
                            tick={{ fontSize: 12, fill: COMPLETIONS_COLOR, fontWeight: 600 }}
                            axisLine={{ stroke: COMPLETIONS_COLOR }}
                            tickLine={{ stroke: COMPLETIONS_COLOR }}
                            label={{
                              value: "Completed processes",
                              angle: -90,
                              position: "insideLeft",
                              offset: 12,
                              fill: COMPLETIONS_COLOR,
                              fontWeight: 600
                            }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 12, fill: AVERAGE_COLOR, fontWeight: 600 }}
                            axisLine={{ stroke: AVERAGE_COLOR }}
                            tickLine={{ stroke: AVERAGE_COLOR }}
                            label={{
                              value: "Avg completion (days)",
                              angle: 90,
                              position: "insideRight",
                              offset: 12,
                              fill: AVERAGE_COLOR,
                              fontWeight: 600
                            }}
                          />
                          <Tooltip content={<AnalyticsTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="completions"
                            name="Completed processes"
                            stroke={COMPLETIONS_COLOR}
                            strokeWidth={2}
                            connectNulls
                            dot={{ r: 4, fill: COMPLETIONS_COLOR, stroke: COMPLETIONS_ACCENT_COLOR, strokeWidth: 2 }}
                            yAxisId="left"
                          />
                          <Line
                            type="monotone"
                            dataKey="averageDays"
                            name="Average completion time"
                            stroke={AVERAGE_COLOR}
                            strokeWidth={2}
                            connectNulls
                            dot={{ r: 4, fill: AVERAGE_ACCENT_COLOR, stroke: AVERAGE_COLOR, strokeWidth: 2 }}
                            yAxisId="right"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="analytics-status analytics-status--muted">
                      No pre-screening completions have been recorded yet.
                    </p>
                  )
                ) : null}
              </div>
            </article>
          </section>
        </div>
      </main>
    </CopilotSidebar>
  )
}

export default function AnalyticsPage() {
  const { runtimeMode } = useCopilotRuntimeSelection()
  const effectiveRuntimeUrl =
    runtimeMode === "custom" ? CUSTOM_ADK_PROXY_URL : defaultRuntimeUrl

  return (
    <CopilotKit
      publicApiKey={publicApiKey || undefined}
      runtimeUrl={effectiveRuntimeUrl || undefined}
    >
      <AnalyticsContent />
    </CopilotKit>
  )
}
