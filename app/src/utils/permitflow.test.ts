import { describe, expect, it } from "vitest"

import {
  buildLocationMapFeature,
  buildLocationMapScreening,
  sanitizeEvaluationDataForSchema
} from "./permitflow"
import type { GeospatialResultsState } from "../types/geospatial"

const applicantInfoSchema = {
  type: "object",
  properties: {
    applicant_name: { type: "string" },
    entity_type: {
      type: "string",
      oneOf: [
        { const: "individual", title: "Individual" },
        { const: "corporation", title: "Corporation" },
        { const: "partnership", title: "Partnership" }
      ]
    },
    hazardous_materials_involved: { type: "boolean" },
    plans_file: { type: "string" },
    suppl_articles_file: { type: "string" },
    suppl_status: {
      type: "string",
      oneOf: [{ const: "filed", title: "Filed" }]
    }
  }
}

describe("sanitizeEvaluationDataForSchema", () => {
  it("keeps oneOf/const selects only when the value is a valid const", () => {
    const result = sanitizeEvaluationDataForSchema(applicantInfoSchema, {
      entity_type: "corporation",
      applicant_name: "Acme"
    })
    expect(result.entity_type).toBe("corporation")
    expect(result.applicant_name).toBe("Acme")
  })

  it("omits empty strings and unknown values for oneOf selects", () => {
    expect(
      sanitizeEvaluationDataForSchema(applicantInfoSchema, { entity_type: "" })
    ).not.toHaveProperty("entity_type")
    expect(
      sanitizeEvaluationDataForSchema(applicantInfoSchema, { entity_type: "Corporation" })
    ).not.toHaveProperty("entity_type")
  })

  it("only keeps real booleans for boolean fields", () => {
    expect(
      sanitizeEvaluationDataForSchema(applicantInfoSchema, {
        hazardous_materials_involved: true
      })
    ).toEqual({ hazardous_materials_involved: true })
    expect(
      sanitizeEvaluationDataForSchema(applicantInfoSchema, {
        hazardous_materials_involved: "true"
      })
    ).not.toHaveProperty("hazardous_materials_involved")
  })

  it("drops suppl_* fields unless entity_type is corporation or partnership", () => {
    const individual = sanitizeEvaluationDataForSchema(applicantInfoSchema, {
      entity_type: "individual",
      suppl_articles_file: '{"documentId":1}',
      suppl_status: "filed"
    })
    expect(individual).toEqual({ entity_type: "individual" })

    const partnership = sanitizeEvaluationDataForSchema(applicantInfoSchema, {
      entity_type: "partnership",
      suppl_articles_file: '{"documentId":1}',
      suppl_status: "filed"
    })
    expect(partnership.suppl_articles_file).toBe('{"documentId":1}')
    expect(partnership.suppl_status).toBe("filed")
  })

  it("passes through keys the schema does not describe and drops undefined values", () => {
    const result = sanitizeEvaluationDataForSchema(applicantInfoSchema, {
      screening: { source: "ipac" },
      applicant_name: undefined
    })
    expect(result.screening).toEqual({ source: "ipac" })
    expect(result).not.toHaveProperty("applicant_name")
  })
})

function buildScreeningResults(): GeospatialResultsState {
  return {
    lastRunAt: "2026-07-10T12:00:00.000Z",
    nepassist: {
      status: "success",
      summary: [
        { question: "Wild and scenic river?", displayAnswer: "Yes", severity: "yes" }
      ],
      raw: { huge: "payload" }
    },
    ipac: {
      status: "success",
      summary: {
        listedSpecies: [{ commonName: "Mexican Spotted Owl", status: "Threatened" }],
        criticalHabitats: [],
        migratoryBirds: [],
        wetlands: []
      },
      raw: { huge: "payload" },
      meta: { endpoint: "ipac" }
    },
    environmentalMap: {
      status: "success",
      summary: { url: "https://example.com/map.png", latitude: 38.5, longitude: -109.5, bufferMiles: 0.5 }
    },
    messages: ["ran fine"]
  }
}

describe("buildLocationMapScreening", () => {
  it("keeps only per-service status and summary plus lastRunAt", () => {
    const screening = buildLocationMapScreening(buildScreeningResults())
    expect(screening).toEqual({
      lastRunAt: "2026-07-10T12:00:00.000Z",
      ipac: {
        status: "success",
        summary: {
          listedSpecies: [{ commonName: "Mexican Spotted Owl", status: "Threatened" }],
          criticalHabitats: [],
          migratoryBirds: [],
          wetlands: []
        }
      },
      nepassist: {
        status: "success",
        summary: [
          { question: "Wild and scenic river?", displayAnswer: "Yes", severity: "yes" }
        ]
      }
    })
  })

  it("returns undefined when no summaries exist", () => {
    expect(
      buildLocationMapScreening({
        nepassist: { status: "idle" },
        ipac: { status: "error", error: "boom" }
      })
    ).toBeUndefined()
    expect(buildLocationMapScreening(undefined)).toBeUndefined()
  })
})

describe("buildLocationMapFeature", () => {
  it("builds a Feature from the portal's bare GeoJSON geometry with screening attached", () => {
    const encoded = buildLocationMapFeature(
      {
        location_object: JSON.stringify({
          type: "LineString",
          coordinates: [
            [-109.549, 38.573],
            [-109.489, 38.612]
          ]
        })
      },
      buildScreeningResults()
    )
    const feature = JSON.parse(encoded ?? "{}")
    expect(feature.type).toBe("Feature")
    expect(feature.geometry.type).toBe("LineString")
    expect(feature.geometry.coordinates[0]).toEqual([-109.549, 38.573])
    expect(feature.properties.zoom).toBe(12)
    expect(feature.properties.screening.ipac.summary.listedSpecies).toHaveLength(1)
    expect(feature.properties.screening).not.toHaveProperty("environmentalMap")
  })

  it("unwraps Feature and FeatureCollection wrappers", () => {
    const wrapped = buildLocationMapFeature({
      location_object: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-109.55, 38.57] },
            properties: {}
          }
        ]
      })
    })
    expect(JSON.parse(wrapped ?? "{}").geometry).toEqual({
      type: "Point",
      coordinates: [-109.55, 38.57]
    })
  })

  it("falls back to a lon/lat Point from the coordinate fields", () => {
    const encoded = buildLocationMapFeature({ location_lat: 38.57, location_lon: -109.55 })
    const feature = JSON.parse(encoded ?? "{}")
    expect(feature.geometry).toEqual({ type: "Point", coordinates: [-109.55, 38.57] })
  })

  it("returns undefined without geometry and omits screening when absent", () => {
    expect(buildLocationMapFeature({ title: "No location" })).toBeUndefined()
    const noScreening = buildLocationMapFeature({ location_lat: 1, location_lon: 2 })
    expect(JSON.parse(noScreening ?? "{}").properties).not.toHaveProperty("screening")
  })
})
