import { describe, expect, it } from "vitest"

import {
  isOpenProponentTask,
  parseSection106CaseEvent,
  parseSection106ErrorEnvelope,
  seedSection106SectionEvaluationData,
  type Section106Element
} from "./section106"

describe("parseSection106ErrorEnvelope", () => {
  it("extracts code, message, and correlation id from the error envelope", () => {
    const error = parseSection106ErrorEnvelope(
      422,
      JSON.stringify({
        error: {
          code: "exchange_unknown_model",
          message: "Unknown process model 99",
          correlationId: "abc123"
        }
      })
    )
    expect(error.code).toBe("exchange_unknown_model")
    expect(error.status).toBe(422)
    expect(error.correlationId).toBe("abc123")
    expect(error.message).toContain("Unknown process model 99")
    expect(error.message).toContain("abc123")
  })

  it("falls back to a generic message for non-envelope bodies", () => {
    const error = parseSection106ErrorEnvelope(502, "Bad Gateway")
    expect(error.message).toContain("502")
    expect(error.code).toBeUndefined()
  })
})

describe("parseSection106CaseEvent / isOpenProponentTask", () => {
  it("parses an information request with the task payload in other", () => {
    const event = parseSection106CaseEvent({
      id: 42,
      name: "Provide drawings",
      type: "information_request",
      status: "pending",
      datetime: "2026-07-28T12:00:00Z",
      other: {
        direction: "out",
        assigned_entity: "proponent",
        task: "Upload elevation drawings for the north facade",
        respond_by: "2026-08-15"
      }
    })
    expect(event).toBeDefined()
    expect(event?.assignedEntity).toBe("proponent")
    expect(event?.task).toBe("Upload elevation drawings for the north facade")
    expect(event?.respondBy).toBe("2026-08-15")
    expect(event?.direction).toBe("out")
    expect(event && isOpenProponentTask(event)).toBe(true)
  })

  it("treats completed requests and other event types as non-tasks", () => {
    const completed = parseSection106CaseEvent({
      id: 1,
      type: "information_request",
      status: "completed",
      other: { assigned_entity: "proponent" }
    })
    expect(completed && isOpenProponentTask(completed)).toBe(false)

    const statusChange = parseSection106CaseEvent({
      id: 2,
      type: "status_change",
      following_segment_name: "Consultation",
      other: { direction: "out" }
    })
    expect(statusChange?.followingSegmentName).toBe("Consultation")
    expect(statusChange && isOpenProponentTask(statusChange)).toBe(false)
  })
})

describe("seedSection106SectionEvaluationData", () => {
  const undertakingElement: Section106Element = {
    id: 2,
    referenceId: "s106-v1-undertaking",
    title: "Undertaking Description",
    hasForm: true,
    formSchema: {
      type: "object",
      properties: {
        description: { type: "string" },
        federal_involvement: { type: "string" },
        ground_disturbance: { type: "boolean" }
      }
    }
  }

  const applicantElement: Section106Element = {
    id: 3,
    referenceId: "s106-v1-applicant-info",
    title: "Applicant Information",
    hasForm: true,
    formSchema: {
      type: "object",
      properties: {
        organization_name: { type: "string" },
        contact_email: { type: "string" }
      }
    }
  }

  it("seeds only fields the element schema declares", () => {
    const seeded = seedSection106SectionEvaluationData(undertakingElement, {
      title: "Bridge repair",
      description: "Replace deck panels on the historic bridge."
    })
    expect(seeded).toEqual({ description: "Replace deck panels on the historic bridge." })
  })

  it("prefers the sponsor contact organization for applicant info", () => {
    const seeded = seedSection106SectionEvaluationData(applicantElement, {
      sponsor: "Fallback Org",
      sponsor_contact: { organization: "Acme Restoration", email: "team@acme.example" }
    })
    expect(seeded).toEqual({
      organization_name: "Acme Restoration",
      contact_email: "team@acme.example"
    })
  })

  it("seeds location_map as a GeoJSON Feature string for the location element", () => {
    const locationElement: Section106Element = {
      id: 4,
      referenceId: "s106-v1-location-geometry",
      title: "Project Location & Geometry",
      hasForm: true,
      formSchema: {
        type: "object",
        properties: { location_map: { type: "string" } }
      }
    }
    const seeded = seedSection106SectionEvaluationData(locationElement, {
      location_lat: 38.9,
      location_lon: -77.03
    })
    const feature = JSON.parse((seeded.location_map as string) ?? "{}")
    expect(feature.type).toBe("Feature")
    expect(feature.geometry).toEqual({ type: "Point", coordinates: [-77.03, 38.9] })
  })

  it("returns an empty object when the schema has no matching fields", () => {
    expect(
      seedSection106SectionEvaluationData(
        { id: 9, referenceId: "s106-v1-undertaking", hasForm: false, formSchema: undefined },
        { description: "text" }
      )
    ).toEqual({})
  })
})
