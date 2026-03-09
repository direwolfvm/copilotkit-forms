// Agency case management tools from "Tracking IT Functions - Permitting and Environmental Review"
// Cross-referenced with permit inventory on detail pages

export interface AgencyCaseMgmtTool {
  agencySystemOwner: string
  systemName: string
  functionalityDescription: string
  applicablePermitOrReview: string
}

export const agencyCaseMgmtTools: AgencyCaseMgmtTool[] = [
  {
    agencySystemOwner: "ACHP",
    systemName: "ACHPConnect",
    functionalityDescription: "Intake form and internal case management for Section 106 process milestones and ACHP staff tasks for those reviews that ACHP is involved in.",
    applicablePermitOrReview: "NHPA Section 106",
  },
  {
    agencySystemOwner: "DHS / USCG",
    systemName: "Online Bridge Permit Application System",
    functionalityDescription: "Permit intake and internal processing case management system for USCG Bridge Permit - would integrate with existing USAIMS database.",
    applicablePermitOrReview: "USCG Bridge Permit; NEPA Compliance",
  },
  {
    agencySystemOwner: "DOC / NOAA",
    systemName: "ECO - Environmental Consultation Organizer",
    functionalityDescription: "Internal tracking system for ESA and EFH consultation processes and documents used by NMFS - includes a public portal for consultation status information and records.",
    applicablePermitOrReview: "ESA Section 7 consultation; EFH consultation",
  },
  {
    agencySystemOwner: "DOC / NOAA",
    systemName: "APPS - Authorizations and Permits for Protected Species",
    functionalityDescription: "Internal tracking system for MMPA authorization processes and documents used by NMFS.",
    applicablePermitOrReview: "MMPA Incidental Take Authorizations; ESA Incidental Take Permits",
  },
  {
    agencySystemOwner: "DOC / NOAA",
    systemName: "OSPREY - Online Sanctuary Permitting, Reporting and Evaluation System",
    functionalityDescription: "Internal tracking system for NMSA permit processes and documentation used by ONMS.",
    applicablePermitOrReview: "NMSA General or Special Use Permits; NEPA Compliance",
  },
  {
    agencySystemOwner: "DOC / NTIA",
    systemName: "ESAPTT - Environmental Screening and Permitting Tracking Tool",
    functionalityDescription: "Case management system used by eligible entities to screen projects, transmit and host NEPA documents and track timelines - used by NTIA staff to review and approve NEPA decisions.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "DOE / GDO",
    systemName: "CITAP - Coordinated Interagency Transmission Authorizations and Permits Portal",
    functionalityDescription: "Public portal for transmission project proponents to track permit status, submit materials, communicate with DOE, and for federal agencies to review submitted materials and provide feedback.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "DOI / BLM",
    systemName: "ePlanning",
    functionalityDescription: "A public website (NEPA Register) providing access to BLM NEPA and land use planning documents and project information.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "DOI / BLM",
    systemName: "MLRS - Mineral & Land Records System",
    functionalityDescription: "Public portal for filing, managing, and tracking mineral and realty actions, and for researching mineral and lands data and geospatial information.",
    applicablePermitOrReview: "Various BLM permits and approvals (e.g., APDs, ROWs, mineral leases)",
  },
  {
    agencySystemOwner: "DOI / BLM",
    systemName: "RAPTOR - Recreation and Permit Tracking Online Reporting",
    functionalityDescription: "Public portal for submitting applications to BLM for special recreation permits, paleontological resource use permits, and scientific research permits and authorizations.",
    applicablePermitOrReview: "Special Recreation Permits, Research Permits and Authorizations",
  },
  {
    agencySystemOwner: "DOI / BOEM BSEE",
    systemName: "TIMS - Technical Information Management System",
    functionalityDescription: "Web application for energy companies to submit data to BOEM and/or BSEE; serves as document management system.",
    applicablePermitOrReview: "OCSLA Related Permits",
  },
  {
    agencySystemOwner: "DOI / NPS",
    systemName: "PEPC - Planning, Environment and Public Comment",
    functionalityDescription: "An internal system to track project progress and document compliance; support NPS staff collaboration and documentation of NEPA and NHPA compliance; and, comment analysis and response - provides the public with access to certain documents and can collect public comments.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "DOI / NPS",
    systemName: "Use Manager",
    functionalityDescription: "Internal land resource database designed for permit case management for NPS lands and data on rights of way - integrated with PEPC.",
    applicablePermitOrReview: "Right of Way Authorization",
  },
  {
    agencySystemOwner: "DOI / USFWS",
    systemName: "IPaC - Information for Planning and Consultation",
    functionalityDescription: "Automated project planning tool for public users and agencies to identify USFWS-managed species and habitats present, conduct an ESA consultation (in certain cases), and build full consultation packages (when needed).",
    applicablePermitOrReview: "Endangered Species Act Section 7 Consultation",
  },
  {
    agencySystemOwner: "DOI / USFWS",
    systemName: "ePermits",
    functionalityDescription: "Public portal for project proponents to apply for and obtain certain types of USFWS-administered permits. Built on ECOSphere enterprise cloud internal system that houses species and habitat data and contains multiple permitting and environmental review workflows.",
    applicablePermitOrReview: "Various USFWS managed permitting processes (e.g., BGEPA)",
  },
  {
    agencySystemOwner: "DOT / FHWA",
    systemName: "PAPAI - Project and Program Action Information System",
    functionalityDescription: "Internal tracking system for major milestones in the NEPA process for FHWA reviews.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "DOT / FRA",
    systemName: "CATS - CE Approval Tracking System",
    functionalityDescription: "Internal system to document environmental reviews, track performance, and automatically generate CE determinations.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "DOT / FRA",
    systemName: "PMT - Project Management Tracker",
    functionalityDescription: "Internal tracking database for grants and environmental reviews.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "DOW / USACE",
    systemName: "RRS - Regulatory Request System",
    functionalityDescription: "Public portal for project proponents to submit permit applications or other requests to USACE Regulatory Program.",
    applicablePermitOrReview: "Section 404 Clean Water Act; Section 10 of the Rivers and Harbors Act of 1899; Section 103 of the Marine Protection, Research, and Sanctuaries Act; Jurisdictional Determinations",
  },
  {
    agencySystemOwner: "EPA / OAR",
    systemName: "EPS - Electronic Permit System",
    functionalityDescription: "Tracking system for state and local permitting authorities to submit draft, proposed, and final permits and supporting permit documents to EPA - documents are available to the public on EPA's Permit Hub.",
    applicablePermitOrReview: "Clean Air Act Permits",
  },
  {
    agencySystemOwner: "EPA / OECA",
    systemName: "NPDES Permit Portal (NeT) - General Permits",
    functionalityDescription: "Electronic reporting system for certain EPA general permit reports and submission materials.",
    applicablePermitOrReview: "NPDES General Permits",
  },
  {
    agencySystemOwner: "EPA / OW",
    systemName: "Underground Injection Control Permit Portal",
    functionalityDescription: "GSDT currently serves as a data repository. UIC permit portal proposed - functionality to be determined.",
    applicablePermitOrReview: "Underground Injection Control Permitting Class VI",
  },
  {
    agencySystemOwner: "EPA / OW",
    systemName: "NPDES Permit Portal - Individual Permits",
    functionalityDescription: "Would build upon permit commons approach for individual NPDES permits.",
    applicablePermitOrReview: "NPDES individual permits or State-issued permits",
  },
  {
    agencySystemOwner: "EPA",
    systemName: "Permit Commons and Permit Hub",
    functionalityDescription: "Proposal to build common internal infrastructure for permit management across EPA offices, and provide access to information on relevant EPA and State permits.",
    applicablePermitOrReview: "All EPA Permitting Programs",
  },
  {
    agencySystemOwner: "FERC",
    systemName: "FERC Online / eLibrary",
    functionalityDescription: "Portal for project proponents to upload applications and repository for documents related to FERC authorization processes and NEPA review.",
    applicablePermitOrReview: "Federal Power Act, Natural Gas Act authorizations",
  },
  {
    agencySystemOwner: "FERC",
    systemName: "ATMS - Activity Management Tracking System",
    functionalityDescription: "Internal case management system for workflow processes for FERC staff involved in authorization processes and NEPA reviews.",
    applicablePermitOrReview: "Federal Power Act, Natural Gas Act authorizations",
  },
  {
    agencySystemOwner: "FERC",
    systemName: "Open Data Portal",
    functionalityDescription: "Public website showing a dashboard of NEPA review schedules and process status for projects under FERC review - currently includes natural gas projects.",
    applicablePermitOrReview: "Federal Power Act, Natural Gas Act authorizations",
  },
  {
    agencySystemOwner: "HUD",
    systemName: "HEROS - HUD Environmental Review Online System",
    functionalityDescription: "Internal system for HUD and Responsible Entities to develop, document, and manage environmental reviews for HUD funding programs.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "NRC",
    systemName: "ADAMS - Agency-wide Documents Access and Management System",
    functionalityDescription: "Repository for documents related to NRC licensing and regulatory processes and NEPA reviews.",
    applicablePermitOrReview: "Nuclear Power Plant Licensing",
  },
  {
    agencySystemOwner: "USDA / USFS",
    systemName: "ELMS - Electronic Land Management System",
    functionalityDescription: "Internal case management system for NEPA review processes associated with USFS land management actions - currently includes a CE documentation module.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "USDA / USFS",
    systemName: "Pinyon / Box",
    functionalityDescription: "Repository for documents related to USFS land management actions and NEPA reviews.",
    applicablePermitOrReview: "Special Use Permits",
  },
  {
    agencySystemOwner: "USDA / USFS",
    systemName: "SUDS - Special Uses Data System",
    functionalityDescription: "Internal system for special uses administrators to authorize permit leases and easements; used by program managers to collect, analyze, and track data about special use permits.",
    applicablePermitOrReview: "Special Use Permits",
  },
  {
    agencySystemOwner: "USDA / FSA",
    systemName: "WEAT - Web Environmental Analysis Tool",
    functionalityDescription: "System for preparing categorical exclusion worksheets using geospatial screening and external APIs from Federal agency data sources.",
    applicablePermitOrReview: "NEPA Compliance",
  },
  {
    agencySystemOwner: "USDA / RD",
    systemName: "REAPER - Rapid Environmental Approval Portal-Electronic Review",
    functionalityDescription: "Intake portal for electric utilities to provide project files and environmental review data, and support USDA staff screening of projects against available CEs.",
    applicablePermitOrReview: "NEPA Compliance",
  },
]

// Explicit mapping from permit inventory IDs to tool indices for reliable cross-referencing.
// Each key is a permit ID from permitInventory.ts; values are indices into agencyCaseMgmtTools.
const permitToToolIndices: Record<string, number[]> = {
  "section-106-review": [0],
  "uscg-bridge-permit": [1],
  "endangered-species-act-consultation-noaa-nmfs": [2],
  "magnuson-stevens-fishery-conservation-and-management-act-section-305": [2],
  "marine-mammal-protection-act-mmpa-incidental-take-authorization": [3],
  "endangered-species-act-consultation-doi-fws": [13],
  "national-marine-sanctuaries-act-issuance-of-a-general-permit": [4],
  "national-marine-sanctuaries-act-special-use-permit": [4],
  "national-marine-sanctuaries-act-section-304d-consultation": [4],
  "section-404-clean-water-act": [18],
  "section-10-of-the-rivers-and-harbors-act-of-1899": [18],
  "section-103-of-the-marine-protection-research-and-sanctuaries-act": [18],
  "section-408-permit": [18],
  "clean-water-act-section-402-permit": [20, 22],
  "construction-and-operations-plan": [10],
  "development-and-production-plan": [10],
  "outer-continental-shelf-ocs-air-permit": [10],
  "oil-spill-response-plan-doi-bsee": [10],
  "nps-permit": [11],
  "non-impairment-determination": [11],
  "right-of-way-authorization-doi-bia": [12],
  "right-of-way-authorization-doi-blm": [12],
  "right-of-way-authorization-doi-fws": [12],
  "bald-and-golden-eagle-protection-permit": [14],
  "migratory-bird-treaty-act-permits": [14],
  "fish-and-wildlife-coordination-act-review-doi-fws": [13],
  "authorization-for-liquefied-natural-gas-terminal-facilities-": [24, 25, 26],
  "certificate-of-public-convenience-and-necessity": [24, 25, 26],
  "natural-gas-export-authorization": [24, 25, 26],
  "non-federal-hydropower-licenses": [24, 25, 26],
  "nuclear-power-plant-combined-license": [28],
  "nuclear-power-plant-construction-permit": [28],
  "special-use-permit-blm": [30, 31],
  "special-use-permit-fs": [30, 31],
  "site-license-doi-blm": [8],
  "geothermal-lease": [8],
  "geothermal-drilling-permit-gdp": [8],
  "geothermal-project-utilization-plan": [8],
  "geothermal-exploration-bond": [8],
  "geothermal-sundry-notice": [8],
  "form-3200-9-notice-of-intent": [8],
  "oil-and-gas-sundry-notice": [8],
  "operations-plan-surface-use-plan": [8],
  "business-resource-lease": [8],
  "clean-water-act-section-401-water-quality-certification": [20],
}

/**
 * Find agency case management tools associated with a given permit ID.
 */
export function findToolsForPermit(permitId: string): AgencyCaseMgmtTool[] {
  const indices = permitToToolIndices[permitId]
  if (!indices || indices.length === 0) {
    return []
  }
  const seen = new Set<number>()
  const result: AgencyCaseMgmtTool[] = []
  for (const idx of indices) {
    if (!seen.has(idx) && idx >= 0 && idx < agencyCaseMgmtTools.length) {
      seen.add(idx)
      result.push(agencyCaseMgmtTools[idx])
    }
  }
  return result
}
