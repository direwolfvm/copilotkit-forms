import type { ProcessInformation } from "./projectPersistence"

export const IPAC_SHADOW_WORKFLOW_TITLE_SUFFIX = "IPaC ESA Consultation"
export const IPAC_SHADOW_LEGAL_STRUCTURE_ID = 2
export const IPAC_SHADOW_PROCESS_MODEL_ID = 2

export const IPAC_SHADOW_DECISION_ELEMENT_IDS = {
  geospatialData: 8,
  projectCreated: 9,
  consultationComplete: 10
} as const

export const IPAC_SHADOW_PROCESS_INFORMATION: ProcessInformation = {
  processModel: {
    id: IPAC_SHADOW_PROCESS_MODEL_ID,
    title: "IPaC ESA Consultation Shadow Workflow",
    description:
      "This local shadow workflow tracks an endangered species consultation that is carried out in IPaC after the project footprint is submitted from HelpPermitMe. The process model is defined locally because IPaC does not publish decision elements or form metadata for in-app execution.",
    notes:
      "Users still authenticate with login.gov and complete the authoritative consultation in IPaC. HelpPermitMe tracks the milestone state needed for permit management.",
    screeningDescription:
      "Submit project geospatial data to IPaC, create the project externally, then mark the consultation complete once the external review is finished.",
    agency: "DOI / U.S. Fish and Wildlife Service (IPaC)",
    legalStructureId: IPAC_SHADOW_LEGAL_STRUCTURE_ID,
    legalStructureText: "Endangered Species Act Section 7 consultation via IPaC manual integration",
    lastUpdated: "2026-03-18T00:00:00.000Z"
  },
  legalStructure: {
    id: IPAC_SHADOW_LEGAL_STRUCTURE_ID,
    title: "Endangered Species Act Section 7 Consultation",
    citation: "16 U.S.C. 1536",
    description:
      "Federal agencies must consult with the U.S. Fish and Wildlife Service when an action may affect listed species or designated critical habitat. This workflow records the external IPaC handoff and completion milestones in HelpPermitMe.",
    issuingAuthority: "U.S. Fish and Wildlife Service",
    url: "https://ipac.ecosphere.fws.gov/",
    effectiveDate: null
  },
  decisionElements: [
    {
      id: IPAC_SHADOW_DECISION_ELEMENT_IDS.geospatialData,
      createdAt: null,
      processModelId: IPAC_SHADOW_PROCESS_MODEL_ID,
      legalStructureId: IPAC_SHADOW_LEGAL_STRUCTURE_ID,
      title: "Geospatial data",
      description:
        "The project footprint is submitted from HelpPermitMe to IPaC. This decision element completes automatically when the user submits project data on the permit page.",
      measure: "Project footprint submitted",
      threshold: null,
      spatial: true,
      intersect: false,
      spatialReference: null,
      formText: "Use the saved project line or polygon footprint.",
      formResponseDescription:
        "Completed automatically after HelpPermitMe receives a successful IPaC project-creation response.",
      formData: null,
      evaluationMethod: "Application event",
      evaluationDmn: null,
      category: "System",
      processModelInternalReferenceId: "ipac-shadow-geospatial-data",
      parentDecisionElementId: null,
      other: null,
      expectedEvaluationData: null,
      responseData: null,
      recordOwnerAgency: "HelpPermitMe",
      dataSourceAgency: "HelpPermitMe",
      dataSourceSystem: "project-portal",
      dataRecordVersion: null,
      lastUpdated: "2026-03-18T00:00:00.000Z",
      retrievedTimestamp: null
    },
    {
      id: IPAC_SHADOW_DECISION_ELEMENT_IDS.projectCreated,
      createdAt: null,
      processModelId: IPAC_SHADOW_PROCESS_MODEL_ID,
      legalStructureId: IPAC_SHADOW_LEGAL_STRUCTURE_ID,
      title: "Project Created",
      description:
        "The user creates the IPaC project after authenticating through login.gov and copying project details into the external system.",
      measure: "IPaC project initialized",
      threshold: null,
      spatial: false,
      intersect: false,
      spatialReference: null,
      formText: "Mark complete after the project has been created in IPaC.",
      formResponseDescription:
        "Completed manually by the user on the permit page after they initialize the project in IPaC.",
      formData: null,
      evaluationMethod: "User attestation",
      evaluationDmn: null,
      category: "Manual",
      processModelInternalReferenceId: "ipac-shadow-project-created",
      parentDecisionElementId: null,
      other: null,
      expectedEvaluationData: null,
      responseData: null,
      recordOwnerAgency: "HelpPermitMe",
      dataSourceAgency: "HelpPermitMe",
      dataSourceSystem: "project-portal",
      dataRecordVersion: null,
      lastUpdated: "2026-03-18T00:00:00.000Z",
      retrievedTimestamp: null
    },
    {
      id: IPAC_SHADOW_DECISION_ELEMENT_IDS.consultationComplete,
      createdAt: null,
      processModelId: IPAC_SHADOW_PROCESS_MODEL_ID,
      legalStructureId: IPAC_SHADOW_LEGAL_STRUCTURE_ID,
      title: "Consultation Complete",
      description:
        "The user finishes the endangered species consultation workflow in IPaC and records completion back in HelpPermitMe.",
      measure: "External consultation completed",
      threshold: null,
      spatial: false,
      intersect: false,
      spatialReference: null,
      formText: "Mark complete when the IPaC consultation is finished.",
      formResponseDescription:
        "Completed manually by the user on the permit page after the external workflow has concluded.",
      formData: null,
      evaluationMethod: "User attestation",
      evaluationDmn: null,
      category: "Manual",
      processModelInternalReferenceId: "ipac-shadow-consultation-complete",
      parentDecisionElementId: null,
      other: null,
      expectedEvaluationData: null,
      responseData: null,
      recordOwnerAgency: "HelpPermitMe",
      dataSourceAgency: "HelpPermitMe",
      dataSourceSystem: "project-portal",
      dataRecordVersion: null,
      lastUpdated: "2026-03-18T00:00:00.000Z",
      retrievedTimestamp: null
    }
  ]
}
