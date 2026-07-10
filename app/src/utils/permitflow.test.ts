import { describe, expect, it } from "vitest"

import { sanitizeEvaluationDataForSchema } from "./permitflow"

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
