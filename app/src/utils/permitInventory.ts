// Auto-generated from Environmental Review and Authorization Inventory (3.27.23).xlsx
// Do not edit manually

export type IntegrationStatus = "integrated" | "modern-app" | "manual"

export interface PermitInfo {
  id: string
  name: string
  responsibleAgency: string
  responsibleOffice: string
  projectType: string
  activityTrigger: string
  description: string
  statuteRegulation: string
  integrationStatus: IntegrationStatus
}

const MODERN_APP_PERMIT_IDS = new Set([
  "section-404-clean-water-act",
  "endangered-species-act-consultation-doi-fws"
])

export function getIntegrationStatus(permitId: string): IntegrationStatus {
  if (MODERN_APP_PERMIT_IDS.has(permitId)) {
    return "modern-app"
  }
  return "manual"
}

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  "integrated": "Integration with HelpPermit.me",
  "modern-app": "Modern Web Application",
  "manual": "No Integration / Manual Process"
}

type RawPermitInfo = Omit<PermitInfo, "integrationStatus">

const rawPermitInventory: RawPermitInfo[] = [
  {
    id: "authorization-for-liquefied-natural-gas-terminal-facilities-",
    name: "Authorization for Liquefied Natural Gas Terminal Facilities, Onshore or in State Waters",
    responsibleAgency: "FERC",
    responsibleOffice: "Office of Energy Projects and Office of Energy Market Regulation",
    projectType: "Liquefied Natural Gas Terminal Facilities (Onshore or in State Water), and associated Natural Gas Pipelines",
    activityTrigger: "Application for the siting, construction, expansion, or operation of an LNG terminal filed pursuant to section 3 of the Natural Gas Act",
    description: "Applications for the siting, construction, expansion, or operation of an LNG Terminal must be submitted to FERC. An LNG Terminal includes all natural gas facilities located onshore or in State waters that are used to receive, unload, load, store, transport, gasify, liquefy, or process natural gas that is: (1) imported to the U.S. from a foreign country; (2) exported to a foreign country from the U.S.; or (3) transported in interstate commerce by waterborne vessel.",
    statuteRegulation: "Section 3 of the Natural Gas Act [15\nU.S.C. 717b]; 18 C.F.R. 153. Section 7(c) of the Natural Gas Act [15 U.S.C. 717f]; 18 C.F.R. 157."
  },
  {
    id: "bald-and-golden-eagle-protection-permit",
    name: "Bald and Golden Eagle Protection Permit",
    responsibleAgency: "DOI",
    responsibleOffice: "FWS",
    projectType: "All",
    activityTrigger: "Possible take/harm of eagles",
    description: "The Bald and Golden Eagle Protection Act prohibits anyone from \"taking\" bald or golden eagles. Among other actions, \"take\" includes disturbance of eagles to the degree that it substantially interferes with breeding, feeding, or sheltering behavior or results in injury. The FWS can issue a permit for taking eagles when the take is associated with, but not the purpose of, an activity and cannot practicably be avoided. We refer to this type of take as \"non‐purposeful take.\" Authorization is subject to conditions to minimize impacts. The regulation authorizing non‐purposeful take permits for bald and golden eagles is in 50 CFR 22.26.",
    statuteRegulation: "Bald and Golden Eagle Protection Act"
  },
  {
    id: "business-resource-lease",
    name: "Business Resource Lease",
    responsibleAgency: "DOI",
    responsibleOffice: "BIA",
    projectType: "Wind: Other than Federal Offshore \nWind: Federal Offshore\nSolar Geothermal",
    activityTrigger: "Contract approved by the Secretary that authorizes possession of Indian land for a specific purpose and term.",
    description: "Lease development activity to allow the possession of Indian land for wind or solar development or business purposes in exchange for pre‐defined royalties.",
    statuteRegulation: "25 CFR 162 ‐ Leases and Permits. 25 CFR § 162.565 ‐ 162.599 for Wind Energy Evaluation Leases (WEEL) and Wind Solar Resource (WSR) Leases. 25 USC 380, 393, 394, 397, 402, 403 and 415"
  },
  {
    id: "certificate-of-public-convenience-and-necessity-for-intersta",
    name: "Certificate of Public Convenience and Necessity for Interstate Natural Gas Pipelines",
    responsibleAgency: "FERC",
    responsibleOffice: "Office of Energy Projects and Office of Energy Market Regulation",
    projectType: "Interstate Natural Gas Pipelines",
    activityTrigger: "Application for a certificate of public convenience and necessity to construct or extend interstate natural gas pipeline filed pursuant to section 7(c) of the Natural Gas Act",
    description: "Applications must be submitted to FERC for a certificate of public convenience and necessity for the construction or extension of natural gas facilities used for the sale or transportation of natural gas in interstate commerce. No construction or extension of natural gas facilities that are subject to the jurisdiction of FERC can be undertaken unless there is a certification of public convenience and necessity issued by FERC authorizing such acts or operations. As provided by FERC regulations, environmental reviews are conducted for interstate natural gas pipelines and related jurisdictional facilities, including underground storage and LNG peak‐shaving facilities.",
    statuteRegulation: "Section 7(c) of the Natural Gas Act [15\nU.S.C. 717f]; 18 C.F.R. 157. See also 18 C.F.R. 153.2, 380.5."
  },
  {
    id: "clean-water-act-section-402-permit-national-pollutant-discha",
    name: "Clean Water Act Section 402 Permit, National Pollutant Discharge Elimination System (EPA)",
    responsibleAgency: "EPA or a State regulatory agency having delegated authority under CWA Section 404(b) State Permit Programs",
    responsibleOffice: "EPA Region or a State regulatory agency having delegated authority under Section 404(b) State Permit Programs; NPDES permits are issued by states that have obtained EPA approval to issue permits or are issued by EPA Regions in states without such approval. ",
    projectType: "All",
    activityTrigger: "Proposed projects that would discharge pollutants regulated under the Clean Water Act through a point source of discharge into a water of the United States.  Pollutant is defined as any type of industrial, municipal, or agricultural waste discharged into water. ",
    description: "Any person who discharges or proposes to discharge pollutants...  and who does not have an effective permit, except persons covered by general permits under 40 CFR 122.28, excluded under 40 CFR 122.3, or a user of a privately owned treatment works unless the Director requires otherwise under 40 CFR 122.44(m), must submit a complete application to the EPA Region or delegated State Agency in accordance with 40 CFR 122 and 40 CFR 124, or in accordance with NPDES regulations of delegated State Agencies under 40 CFR 123.  ",
    statuteRegulation: "Clean Water Act Section 404; 40 CFR 122.21 Application for a permit (also applicable to State programs, see 40 CFR 123.25)."
  },
  {
    id: "commercial-use-permit",
    name: "Commercial Use Permit",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Commercial use of federal lands for geothermal energy development",
    description: "Prior to the commercial generation of electricity, an application for a Commercial Use Permit is submitted on a Sundry Notice form and approved by BLM prior to any commercial operations from a Federal geothermal lease, a Federal Unit, or a production facility. This document describes the location of all wells, allocation of that production, location of meters, allocation of schedules, power purchase agreement, and a number of other items. It generally takes about a month for BLM approval of a Commercial Use Permit.",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy and Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "conditional-letter-of-map-revision",
    name: "Conditional Letter of Map Revision",
    responsibleAgency: "DHS",
    responsibleOffice: "FEMA",
    projectType: "All",
    activityTrigger: "Activity that modifies the floodway by causing any increase in the base flood discharge in regulatory floodways, or more than one foot increase in any portion of a Special Flood Hazard Area if no regulatory floodway is designated.",
    description: "A Conditional Letter of Map Revision (CLOMR) is FEMA's comment on a proposed project that would, upon construction, affect the hydrologic or hydraulic characteristics of a flooding source and thus result in the modification of the existing regulatory floodway, the effective Base Flood Elevations (BFEs), or the Special Flood Hazard Area (SFHA). The letter does not revise an effective NFIP map, it indicates whether the project, if built as proposed, would be recognized by FEMA. FEMA charges a fee for processing a CLOMR to recover the costs associated with the review. Building permits cannot be issued based on a CLOMR, because a CLOMR does not change the NFIP map.",
    statuteRegulation: "44 CFR 60.3; 44 CFR 65.7"
  },
  {
    id: "construction-and-operations-plan",
    name: "Construction and Operations Plan",
    responsibleAgency: "DOI",
    responsibleOffice: "BOEM",
    projectType: "Wind: Other than Federal Offshore \nWind: Federal Offshore",
    activityTrigger: "Construction and operations of a commercial wind energy project on the OCS.",
    description: "Prior to beginning construction activities on an OCS wind lease, a lessee must have an approved construction and operations plan (COP). The COP must describe all proposed activities including construction, commercial operations, and conceptual decommissioning of all facilities. BOEM regulations at 39 CFR 585.620 describe the information that must be in the COP.",
    statuteRegulation: "Outer Continental Shelf Lands Act 43\nU.S.C. 1337(p) and BOEM regulations at 30 CFR 585"
  },
  {
    id: "development-and-production-plan",
    name: "Development and Production Plan",
    responsibleAgency: "DOI",
    responsibleOffice: "BOEM",
    projectType: "Offshore Oil & Gas",
    activityTrigger: "Development and production of oil and gas on the Outer Continental Shelf",
    description: "Prior to developing outer continental shelf oil and gas resources, a lessee must have an approved development and production plan. The plan must describe the objectives and tentative schedule for start to completion. BOEM regulations at 30 CFR 550. 242 describe the information that must accompany the plan. BOEM conducts both technical and environmental reviews of the plan. The plan must meet adequate provisions for safety, environmental protection, and conservation of natural resources and comply with the Outer Continental Shelf Lands Act and implementing regulations, and other Federal laws.",
    statuteRegulation: "Outer Continental Shelf Lands Act 43\nU.S.C. 1351 and BOEM regulations at 30 CFR 550"
  },
  {
    id: "dod-military-mission-impact-process",
    name: "DOD Military Mission Impact Process",
    responsibleAgency: "DOD",
    responsibleOffice: "DOD",
    projectType: "All",
    activityTrigger: "Developer files action with FAA or contacts DoD Siting Clearinghouse for a preliminary review",
    description: "OE/AAA process protects national airspace from safety of flight hazards",
    statuteRegulation: ""
  },
  {
    id: "dod-mission-compatibility-evaluation-process-part-211-of-tit",
    name: "DOD Mission Compatibility Evaluation Process, Part 211 of Title 32 CFR",
    responsibleAgency: "DOD; DOT",
    responsibleOffice: "The DoD Siting Clearinghouse, established under the Deputy Under Secretary of Defense (Installations & Environment)",
    projectType: "All",
    activityTrigger: "If the Secretary of Transportation decides that constructing or altering a structure may result in... after consultation with the Secretary of Defense, an adverse impact on military operations and readiness, the Secretary of Transportation shall conduct an aeronautical study to decide the extent of any adverse impact on the safe and efficient use of the airspace, facilities, or equipment.",
    description: "A formal DOD review of a proposed project begins with the receipt from the Secretary of Transportation by the DOD Clearinghouse of a proper application filed with the Secretary of Transportation pursuant to 49 U.S.C. 44718... Not later than 30 days after receiving the application from the Secretary of Transportation, the Clearinghouse shall evaluate all comments and recommendations received and take one of three actions:\n\n(i) Determine that the proposed project will not have an adverse impact on military operations and readiness, in which case it shall notify the Secretary of Transportation of such determination.\n\n(ii) Determine that the proposed project will have an adverse impact on military operations and readiness but that the adverse impact involved is sufficiently attenuated that it does not require mitigation. When the Clearinghouse makes such a determination, it shall notify the Secretary of Transportation of such determination.\n\n(iii) Determine that the proposed project may have an adverse impact on military operations and readiness. ",
    statuteRegulation: "DOD Mission Compatibility Evaluation Process, 32 CFR § 211.6 Initiating a formal DoD review of a proposed project; 49 U.S.C 44718, Structures interfering with air commerce or national security"
  },
  {
    id: "easement-administrative-action-usda-nrcs",
    name: "Easement Administrative Action (USDA - NRCS)",
    responsibleAgency: "USDA",
    responsibleOffice: "NRCS",
    projectType: "All",
    activityTrigger: "Identification of land use easements issued under the Agricultural Conservation Easement Program and the Healthy Forests Reserve Program during scoping by proponent, lead or cooperating agencies",
    description: "Project lands may be held under easements through NRCS programs and identified such that any potential impacts may be mitigated during the Environmental Analysis.  The Agricultural Conservation Easement Program (ACEP) helps landowners, land trusts, and other entities protect, restore, and enhance wetlands, grasslands, and working farms and ranches through conservation easements. Under the Agricultural Land Easements component, NRCS helps American Indian tribes, state and local governments and non-governmental organizations protect working agricultural lands and limit non-agricultural uses of the land.  Under the Wetlands Reserve Easements component, NRCS helps to restore, protect and enhance enrolled wetlands.",
    statuteRegulation: "2018 Farm Bill"
  },
  {
    id: "endangered-species-act-consultation-doi-fws",
    name: "Endangered Species Act Consultation (DOI-FWS)",
    responsibleAgency: "DOI",
    responsibleOffice: "FWS",
    projectType: "All",
    activityTrigger: "The proposed action may affect threatened/endangered species and/ or their designated critical habitat",
    description: "Under Section 7 of the ESA, Federal agencies must consult with NMFS and/or the USFWS when an action the agency carries out, funds, or authorizes (such as through a permit) may affect a listed endangered or threatened species and/or designated critical habitat. The purpose of the consultation is to assist the action agency in meeting its duty to insure that its action is not likely to jeopardize the continued existence of any listed species or result in the destruction or adverse modification of designated critical habitat. Upon completion of consultation the USFWS and/or NMFS provides the action agency with either a letter of concurrence that the proposed project is not likely to adversely affect any listed species or a biological opinion. If the biological opinion concludes that the project is not likely to jeopardize the continued existence of any listed species and is not likely to result in destruction or adverse modification of critical habitat for any listed species, the USFWS and/or NMFS also provides an incidental take statement including terms and conditions, which if complied with, provide an exemption from the ESA's prohibitions on incidental take of listed species. If the biological opinion concludes that the proposed action is likely to jeopardize the continued existence of any listed species (or result in the destruction or adverse modification of designated critical habitat), the USFWS and NMFS develop reasonable and prudent alternatives that would avoid jeopardy or adverse modification that are shared and discussed with the action agency prior to completion of the biological opinion. NOAA generally manages marine species. The USFWS generally manages freshwater and terrestrial species. NOAA and the USFWS share responsibility for sea turtles, Atlantic salmon, and gulf sturgeon.",
    statuteRegulation: "Endangered Species Act (16 USC 1531‐ 1544) Focus on ESA Section 7(a)(2), ESA Section 9, and ESA Section 7(a)(1)\nResponsibilities of Federal Agencies To Protect Migratory Birds (EO 13186)"
  },
  {
    id: "endangered-species-act-consultation-noaa-nmfs",
    name: "Endangered Species Act Consultation (NOAA-NMFS)",
    responsibleAgency: "DOC",
    responsibleOffice: "NOAA ‐ NMFS",
    projectType: "All",
    activityTrigger: "The proposed action may affect threatened/endangered species and/ or their designated critical habitat",
    description: "Under Section 7 of the ESA, Federal agencies must consult with NMFS and/or the USFWS when an action the agency carries out, funds, or authorizes (such as through a permit) may affect a listed endangered or threatened species and/or designated critical habitat. The purpose of the consultation is to assist the action agency in meeting its duty to insure that its action is not likely to jeopardize the continued existence of any listed species or result in the destruction or adverse modification of designated critical habitat. Upon completion of consultation the USFWS and/or NMFS provides the action agency with either a letter of concurrence that the proposed project is not likely to adversely affect any listed species or a biological opinion. If the biological opinion concludes that the project is not likely to jeopardize the continued existence of any listed species and is not likely to result in destruction or adverse modification of critical habitat for any listed species, the USFWS and/or NMFS also provides an incidental take statement including terms and conditions, which if complied with, provide an exemption from the ESA's prohibitions on incidental take of listed species. If the biological opinion concludes that the proposed action is likely to jeopardize the continued existence of any listed species (or result in the destruction or adverse modification of designated critical habitat), the USFWS and NMFS develop reasonable and prudent alternatives that would avoid jeopardy or adverse modification that are shared and discussed with the action agency prior to completion of the biological opinion. NOAA generally manages marine species. The USFWS generally manages freshwater and terrestrial species. NOAA and the USFWS share responsibility for sea turtles, Atlantic salmon, and gulf sturgeon.",
    statuteRegulation: "Endangered Species Act (16 USC 1531‐ 1544) Focus on ESA Section 7(a)(2), ESA Section 9, and ESA Section 7(a)(1)\nResponsibilities of Federal Agencies To Protect Migratory Birds (EO 13186)"
  },
  {
    id: "fish-and-wildlife-coordination-act-review-doi-fws",
    name: "Fish and Wildlife Coordination Act Review (DOI - FWS)",
    responsibleAgency: "DOI",
    responsibleOffice: "FWS",
    projectType: "All",
    activityTrigger: "Coast Guard permits, Corps Section 10/404/103 permits, EPA Section 402 permits, FERC licenses, NRC power station licensing, BR water resource projects.",
    description: "The amendments enacted in 1946 require consultation with the Fish and Wildlife Service and the fish and wildlife agencies of States where the \"waters of any stream or other body of water are proposed or authorized, permitted or licensed to be impounded, diverted . . . or otherwise controlled or modified\" by any agency under a Federal permit or license. Consultation is to be undertaken for the purpose of \"preventing loss of and damage to wildlife resources.\"",
    statuteRegulation: "Fish and Wildlife Coordination Act 16\nU.S.C. 661‐667e"
  },
  {
    id: "fish-and-wildlife-coordination-act-review-noaa",
    name: "Fish and Wildlife Coordination Act Review (NOAA)",
    responsibleAgency: "DOC",
    responsibleOffice: "NOAA - NMFS",
    projectType: "All",
    activityTrigger: "Coast Guard permits, Corps Section 10/404/103 permits, EPA Section 402 permits, FERC licenses, NRC power station licensing, BR water resource projects, other actions dependent upon or resulting in the diversion, control or modification of a stream or other body of water.\n",
    description: "The amendments enacted in 1946 require consultation with the National Oceanic and Atmospheric Administration (NOAA)*, the Fish and Wildlife Service, and the fish and wildlife agencies of States where the \"waters of any stream or other body of water are proposed or authorized, permitted or licensed to be impounded, diverted . . . or otherwise controlled or modified\" by any agency under a Federal permit or license. Consultation is to be undertaken for the purpose of \"preventing loss of and damage to wildlife resources.\"\n\n* Congress has not amended the FWCA since 1958, and, therefore, the Act does not refer to NOAA or the National Marine Fisheries Service (NMFS) or expressly refer to the functions of the Secretary of Commerce. However, the Reorganization Plan of 1970 confers the transfer of functions, including the authorities under FWCA, to NOAA and the Secretary of Commerce. \n",
    statuteRegulation: "Fish and Wildlife Coordination Act 16\nU.S.C. 661‐667e"
  },
  {
    id: "floodplain-assessment",
    name: "Floodplain Assessment",
    responsibleAgency: "All",
    responsibleOffice: "All",
    projectType: "All",
    activityTrigger: "Potential to impact floodplain areas",
    description: "Consideration of floodplain values",
    statuteRegulation: "Section 404 of the Clean Water Act (water quality impacts), Endangered Species Act − Section 7 (habitat impacts), Executive Order (E.O.) 11988—Floodplain Management (May 24, 1977), Executive Order 11990—Protection of Wetlands (May 24, 1977)"
  },
  {
    id: "form-3200-9-notice-of-intent-to-conduct-geothermal-resource-",
    name: "Form 3200‐9, Notice of Intent to Conduct Geothermal Resource Exploration Operations",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Geothermal exploration on federal lands",
    description: "Form 3200‐9, Notice of Intent to Conduct Geothermal Resource Exploration Operations",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "geothermal-drilling-permit-gdp",
    name: "Geothermal Drilling Permit (GDP)",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Drilling on federal lands (for geothermal resources)",
    description: "\"3261.11 ‐ How do I apply for approval of drilling operations and well pad construction? (a) Send to BLM: (1) A completed and signed drilling permit application, Form 3260‐2; (2) A complete operations plan (3261.12); (3) A complete drilling program (3261.13); and (4) An acceptable bond (3261.18). (b) Do not start any drilling operations until after BLM approves the permit.\"",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "geothermal-exploration-bond",
    name: "Geothermal Exploration Bond",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Geothermal exploration, drilling or utilization operations on federal lands",
    description: "Form 3000‐004a, Geothermal Exploration Bond",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "geothermal-lease",
    name: "Geothermal Lease",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Lease confers right to explore for, drill, produce and utilize geothermal resources on federal lands with limitations. Subsequent permits required prior to any surface disturbing activities. Lands must be made available for this use in BLM Land Use Plan.",
    description: "Geothermal Lease Form (Form 3200‐24a). Nomination of Lands for Competitive Geothermal Leasing (Form 3203‐1). Conduct auction. Non‐competitive leases available for two years if not purchased at auction (Form 3200‐24a).",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "geothermal-project-utilization-plan-facility-construction-pe",
    name: "Geothermal Project Utilization Plan, Facility Construction Permit, and Site License",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Once a decision is made to construct a facility to utilize the geothermal resource and construct electric generation facilities. A site license is required of operators who are not the geothermal lease holder to operate the facility.",
    description: "A Utilization Plan (no form, 43 CFR 3272) describes how the geothermal resource will be used, including all of the proposed structures and facilities and their locations necessary for plant operations, as well as plans for final reclamation and decommissioning. These documents are submitted as part of the NEPA process. The Utilization Plan also includes the construction permit for construction and operation of the electric generation facilities, direct‐use steam plants, and related facility and well field operations, including well field production and injection. The site license is required if the operator is not party to the geothermal lease.",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "geothermal-sundry-notice",
    name: "Geothermal Sundry Notice",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Surface disturbance activities prior to obtaining exploration or drilling permit\n*or* Change to surface use plan or drilling plan",
    description: "To begin surface disturbance activities prior to obtaining a Geothermal Drilling Permit for the purpose of constructing roads, pads, etc.",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "lease-of-power-privilege-doi-bor",
    name: "Lease of Power Privilege (DOI-BOR)",
    responsibleAgency: "DOI",
    responsibleOffice: "BOR",
    projectType: "Federal Hydropower\nNon‐Federal Hydropower ‐ Leases",
    activityTrigger: "Authorization of hydropower development at certain facilities owned by the Bureau of Reclamation",
    description: "Non‐federal entities who develop hydropower resources at Reclamation facilities where Reclamation has authority to develop power, must execute a Lease of Power Privilege. The lease term may extend for up to 40 years. Reclamation has issued a directive and standard for Reclamation's Lease of Power Privilege that outlines the roles, responsibilities and process for obtaining a Lease of Power Privilege.",
    statuteRegulation: "The Town Sites and Power Act of 1906; Reclamation Project Act of 1939 (43 USC 485h); Contributed Funds Act of 1921, 43 U.S.C. sec. 395"
  },
  {
    id: "loan-guarantee-program-title-xvii-of-ep-act-2005",
    name: "Loan Guarantee Program, Title XVII of EP Act 2005",
    responsibleAgency: "DOE",
    responsibleOffice: "Loan Program Office",
    projectType: "Renewable Energy Production (all)",
    activityTrigger: "Entrance into loan guarantee underwriting due diligence",
    description: "The Title XVII innovative clean energy projects loan program (Title XVII) provides loan guarantees to accelerate the deployment of innovative clean energy technology. The\nU.S. Department of Energy is authorized to issue loan guarantees pursuant to Title XVII of the Energy Policy Act of 2005. Loan guarantees are made to qualified projects and applicants who apply for funding in response to open technology‐specific solicitations.",
    statuteRegulation: "Title XVII of the Energy Policy Act of 2005 (42 USC Sec. 16511, et. Seq)/10 CFR Part 609"
  },
  {
    id: "loan-program-advanced-technology-vehicle-manufacturing",
    name: "Loan Program, Advanced Technology Vehicle Manufacturing",
    responsibleAgency: "DOE",
    responsibleOffice: "Loan Program Office",
    projectType: "Manufacturing (all)",
    activityTrigger: "Entrance into ATVM loan underwriting due diligence",
    description: "The Advanced Technology Vehicles Manufacturing (ATVM) direct loan program was established in Section 136 of the Energy Independence and Security Act of 2007 to support the production of fuel‐efficient, advanced technology vehicles and qualifying components in the United States. The ATVM loan program provides direct loans to automotive or component manufacturers for reequipping, expanding, or establishing manufacturing facilities in the U.S. that produce fuel‐efficient advanced technology vehicles or qualifying components, or for engineering integration performed in the\nU.S. for advanced technology vehicles or qualifying components.",
    statuteRegulation: "Section 136 of the Energy Independence and Security Act of 2007, as amended (42 USC 17013)/10 CFR Part 611"
  },
  {
    id: "magnuson-stevens-fishery-conservation-and-management-act-sec",
    name: "Magnuson-Stevens Fishery Conservation and Management Act, Section 305 Essential Fish Habitat (EFH) Consultation",
    responsibleAgency: "DOC",
    responsibleOffice: "NOAA ‐ NMFS",
    projectType: "All",
    activityTrigger: "Projects in any sector with potential impact to essential fish habitat",
    description: "Under the Magnuson Stevens Act (MSA) all Federal agencies must consult on any action they authorize, fund, or undertake, or propose to authorize, fund, or undertake if they determine their actions may adversely affect essential fish habitat (EFH).\nPermits are not issued under this authority. NOAA provides non‐binding conservation recommendations to Federal action agencies to minimize the project‘s potential adverse affect on EFH.",
    statuteRegulation: "Magnuson‐Stevens Fishery Conservation and Management Act (16 USC 1801‐1891(d)) Section 305(b)"
  },
  {
    id: "marine-mammal-protection-act-mmpa-incidental-take-authorizat",
    name: "Marine Mammal Protection Act (MMPA) Incidental Take Authorization",
    responsibleAgency: "DOC",
    responsibleOffice: "NOAA ‐ NMFS",
    projectType: "All",
    activityTrigger: "Projects in any sector that may result in potential 'take' as defined (16 U.S.C. 1362 Sec.3(13) defines as harass, hunt, capture, or kill, or attempt to harass, hunt, capture, or kill; (18) further defines 'harassment' as any act of pursuit, torment, or annoyance which\n(i) has the potential to injure or has the potential to disturb by causing disruption of behavioral patterns...)",
    description: "The Marine Mammal Protection Act (MMPA) prohibits the take of marine mammals. Federal agencies and individuals must seek authorization to incidentally take marine mammals when conducting otherwise lawful activities. Two types of incidental take permits can be issued: Incidental Harassment Authorizations (IHAs) and Letters of Authorization (LOAs). IHAs are issued for actions that do not have the potential to cause marine mammal mortality or serious injury. An LOA is required for actions that have the potential to cause mortality or serious injury.",
    statuteRegulation: "Marine Mammal Protection Act (16 USC 1361‐1423)"
  },
  {
    id: "migratory-bird-treaty-act-permits",
    name: "Migratory Bird Treaty Act permits",
    responsibleAgency: "DOI",
    responsibleOffice: "FWS",
    projectType: "All",
    activityTrigger: "The proposed action may take birds.",
    description: "The Migratory Bird Treaty Act makes it illegal for anyone to take any migratory bird or nests, or eggs of such a bird except under the terms of a valid permit issued pursuant to Federal regulations. The migratory bird species protected by the Act are listed in 50 CFR 10.13. Take means to pursue, hunt, shoot, wound, kill, trap, capture, or collect, or attempt to pursue, hunt, shoot, wound, kill, trap, capture, or collect. Take incidental  to an action (non‐purposeful take) is not permitted.",
    statuteRegulation: "Migratory Bird Treaty Act of 1918 (16 U.S.C. 703‐712; Ch. 128; July 13, 1918; 40 Stat. 755)"
  },
  {
    id: "national-marine-sanctuaries-act-issuance-of-a-general-permit",
    name: "National Marine Sanctuaries Act, Issuance of a General Permit or Authorization of a Permitted Activity ",
    responsibleAgency: "DOC",
    responsibleOffice: "NOAA ‐ National Ocean Service",
    projectType: "All",
    activityTrigger: "National Marine Sanctuary General permit: Any activity that is prohibited by the national marine sanctuary regulations may be conducted in a national marine sanctuary if it is conducted in accordance with the scope, purpose, terms and conditions of a general permit.\n\nAuthorization: A newly proposed activity that would be covered by a federal, state, or local permit, and would occur in a national marine sanctuary, but would be otherwise prohibited by the national marine sanctuary regulations and unable to qualify for an National Marine Sanctuaries Act general or special use permit.",
    description: "National Marine Sanctuary General Permit: A person may conduct an activity prohibited by 15 CFR part 922, subparts F-O, if such activity is specifically authorized by and provided such activity is conducted in accordance with the scope, purpose, terms and conditions of, a National Marine Sanctuary General permit issued under 922.48. For the Florida Keys National Marine Sanctuary, the prohibited activity must be conducted in accordance with a general permit issued under 922.166. For Thunder Bay National Marine Sanctuary and Unwater Preserve, the prohibited activity must be conducted in accordance with a general permit issued under 922.195. The sanctuaries have three categories of general permits; they include: management, education, and research permits.\n\nAuthorization: An authorization (15 C.F.R. 922.49) provides a sanctuary with the power to \"authorize\" or give legal or official approval to another applicable federal, state, or local permit to allow an activity otherwise prohibited by sanctuary regulations and unable to qualify for an ONMS general or special use permit. As of March 2016, six national marine sanctuaries—Florida Keys, Flower Garden Banks, Monterey Bay, Olympic Coast, Stellwagen Bank, and Thunder Bay—have the ability to issue authorizations. The ONMS considers the general permit regulatory review criteria at 15 C.F.R. pt. 922 when deciding whether to issue an authorization, but does not require that all criteria be met. ",
    statuteRegulation: "National Marine Sanctuary General Permit: 15 C.F.R. §§ 922.48, 922.166, and 922.195\n\nAuthorization: 15 C.F.R. § 922.49"
  },
  {
    id: "national-marine-sanctuaries-act-section-304-d-consultation",
    name: "National Marine Sanctuaries Act, Section 304(d) Consultation",
    responsibleAgency: "DOC",
    responsibleOffice: "NOAA ‐ National Ocean Service",
    projectType: "All",
    activityTrigger: "Federal actions that are likely to destroy, cause the loss of, or injure a national marine sanctuary resource",
    description: "Under section 304(d) of the National Marine Sanctuaries Act (16 U.S.C. §1 434(d)), any Federal agency taking any action that is likely to destroy, cause the loss of, or injure a sanctuary resource is required to consult with NOAA.  At the earliest practical time before final approval of the action, the Federal agency shall provide NOAA with a written statement describing the action and its potential effects. The term Federal action includes private activities authorized by licenses, leases, or permits. Sanctuary resources are defined as any living or nonliving resource that contributes to the conservation, recreational, ecological, historical, educational, cultural, archeological, scientific, or aesthetic value of the sanctuary. Upon review of the sanctuary resource statement, NOAA may issue recommendations to protect sanctuary resources by eliminating, reducing, or mitigating potential injury to sanctuary resources.",
    statuteRegulation: "National Marine Sanctuaries Act, § 304(d) (16 U.S.C. §1434(d)); Oceans Act Section 2202(e) (for Stellwagen Bank National Marine Sanctuary Federal Agencies shall consult on activities that may affect sanctuary resources)"
  },
  {
    id: "national-marine-sanctuaries-act-special-use-permit-as-define",
    name: "National Marine Sanctuaries Act, Special Use Permit, as defined in Section 310",
    responsibleAgency: "DOC",
    responsibleOffice: "NOAA ‐ National Ocean Service",
    projectType: "Offshore Broadband Infrastructure",
    activityTrigger: "The continued presence of commercial submarine cables on or within the submerged lands of any national marine sanctuary.",
    description: "Under section 310 of the National Marine Sanctuaries Act (16 U.S.C. § 1441), the ONMS can issue a special use permit and collect fees for a limited number of activities that either “establish conditions of access to and use of any sanctuary resource” or “promote public use and understanding of a sanctuary resource.” Each of the seven categories for a special use permit must also meet four legislative “permit terms,” one of which is a finding that the project will not destroy, cause the loss of, or injure sanctuary resources. Sanctuary resources are defined as any living or nonliving resource that contributes to the conservation, recreational, ecological, historical, educational, cultural, archeological, scientific, or aesthetic value of the sanctuary.\nHere, the ONMS can issue a special use permit, \"that establish[es] conditions of access to and use of any sanctuary resource,\" for the continued presence of commercial submarine cables on or within the submerged lands of any national marine sanctuary.",
    statuteRegulation: "National Marine Sanctuaries Act, 16\nU.S.C. § 1441; 78 FR 25957 (list of applicable special use permit categories of activities)"
  },
  {
    id: "native-american-graves-protection-act-compliance",
    name: "Native American Graves Protection Act Compliance",
    responsibleAgency: "All",
    responsibleOffice: "All",
    projectType: "All",
    activityTrigger: "Intentional excavation of Native American cultural items, including human remains and objects of cultural patrimony.",
    description: "For activities on Federal lands, NAGPRA requires consultation with\n&; Indian tribes (including Alaska Native villages) or Native Hawaiian organizations prior to the intentional excavation, or removal after inadvertent discovery, of several kinds of cultural items, including human remains and objects of cultural patrimony. For activities on Native American or Native Hawaiian lands, which are defined in the statute, NAGPRA requires the consent of the Indian tribe or Native Hawaiian organization prior to the removal of cultural items.",
    statuteRegulation: "Native American Graves Protection Act"
  },
  {
    id: "natural-gas-export-authorization",
    name: "Natural Gas Export Authorization",
    responsibleAgency: "DOE",
    responsibleOffice: "Office of Regulation and International Engagement",
    projectType: "Liquefied Natural Gas Terminal Facilities ‐ Onshore or in State Water\nLiquefied Natural Gas Terminal Facilities ‐ Offshore",
    activityTrigger: "Application for export of LNG",
    description: "Under Section 3 of the Natural Gas Act (NGA), DOE authorizes imports and exports of natural gas, including LNG and CNG. As needed, these imports and exports must be supported by natural gas commodity pipelines and gasification and liquefaction projects that involve large capital expenditures.\nFERC regulates most such projects under sections 3 and 7 of the NGA. But, if the projects are located in deepwater ports, MARAD is the principal regulatory authority. If the projects cross federal lands, BLM at the Department of Interior is the principal regulatory authority. Within the Department of Transportation, PHMSA is responsible for enforcing safety standards on both gas and oil pipelines.",
    statuteRegulation: "Section 3 of the Natural Gas Act [15\nU.S.C. 717b]"
  },
  {
    id: "non-federal-hydropower-licenses",
    name: "Non‐Federal Hydropower Licenses",
    responsibleAgency: "FERC",
    responsibleOffice: "Office of Energy Projects",
    projectType: "Non‐Federal Hydropower ‐ Licenses (including Non‐Federal Marine and Hydrokinetic Projects)",
    activityTrigger: "License application submitted to FERC in accordance with Part I of the Federal Power Act",
    description: "An application must be submitted to the Commission for a license to construct, operate, and maintain a non‐federal hydropower project that would: (1) be located on navigable waters of the United States; (2) occupy lands or reservations of the United States; (3) use surplus water or water power from a Government dam; or (4) be located on non‐navigable waters that are subject to the authority of Congress under the Commerce Clause, affect the interests of interstate or foreign commerce, and involve construction on or after August 26, 1935. FERC is authorized to issue original licenses, and new licenses following the expiration of an existing license (i.e., \"relicenses\").",
    statuteRegulation: "Section 4(e), 15(a)(1), and 23(b) of the Federal Power Act [16 U.S.C. 797, 808, and 817, respectively]; 18 C.F.R. 4, 5, and 16."
  },
  {
    id: "non-impairment-determination-separate-from-nps-permit",
    name: "Non‐Impairment Determination (separate from NPS permit)",
    responsibleAgency: "DOI",
    responsibleOffice: "NPS",
    projectType: "All",
    activityTrigger: "Any project crossing NPS jurisdictional lands for which a NPS permit would be required",
    description: "NPS is required to by statute to preserve its lands unimpaired for the enjoyment of future generations. NPS is required to make a determination as to whether a project would impair park system resources before taking an agency action, including issuing permits.",
    statuteRegulation: "National Park Service and Related Programs (commonly known as the NPS Organic Act), 54 USC 100101 et seq"
  },
  {
    id: "notice-of-proposed-construction-form-7460",
    name: "Notice of Proposed Construction ‐ Form 7460",
    responsibleAgency: "DOT",
    responsibleOffice: "FAA",
    projectType: "All",
    activityTrigger: "Construction/alteration of structures\n>200 ft or near airports, depending on distinction and length of nearby runway; siting within radar line‐of‐sight of air surveillance or communications facility",
    description: "Any person/organization who intends to sponsor construction or alterations that fall under activities listed under CFR Title 14 Part 77.9 must notify the Administrator of the FAA via a Notice of Proposed Construction ‐ Form 7460. This notice includes a plan for appropriate markings and lighting, after which FAA makes a Hazard Determination for the proposed construction.",
    statuteRegulation: "Structures interfering with air commerce (49 USC 44718)"
  },
  {
    id: "nps-permit",
    name: "NPS Permit",
    responsibleAgency: "DOI",
    responsibleOffice: "NPS",
    projectType: "All",
    activityTrigger: "Projects to be located on NPS lands",
    description: "Permits for rights‐of‐way, easements or other non‐park uses: Informational requirements are determined on a case‐by‐case basis, and applicants should consult with the Park Superintendent before making formal application. The applicant must provide sufficient information on the proposed non‐park use, as well as park resources and resource‐related values to be affected directly and indirectly by the proposed use in order to allow the Service to evaluate the application, assess the impact of the proposed use on the NPS unit and other environmental values, develop restrictions/stipulations to mitigate adverse impacts, and reach a decision on issuance of the instrument. Policies concerning regulation of special uses are described in the NPS Management Policies Notebook.",
    statuteRegulation: "Rights‐of‐way through parks or reservations for power and communications facilities (16 USC 5), Rights‐of‐way for public utilities (16 USC 79) (NPS does not have authority, however, to issue rights‐of‐way for oil or gas pipelines.)"
  },
  {
    id: "nuclear-power-plant-combined-construction-and-operating-lice",
    name: "Nuclear Power Plant – Combined (construction and operating) License",
    responsibleAgency: "NRC",
    responsibleOffice: "Office of New Reactors",
    projectType: "Nuclear Power Plant ‐ Combined (construction and operating) license",
    activityTrigger: "Application for a Combined License by an applicant under 10 CFR Part 52.",
    description: "Authorization under 10 CFR Part 52, for which review under the National Environmental Policy Act is required, allows construction and operation of a new nuclear power plant under the Atomic Energy Act.",
    statuteRegulation: "Atomic Energy Act is Sections 103 and 185(b)"
  },
  {
    id: "nuclear-power-plant-construction-permit",
    name: "Nuclear Power Plant – Construction Permit",
    responsibleAgency: "NRC",
    responsibleOffice: "Office of Nuclear Reactor Regulation",
    projectType: "Nuclear Power Plant ‐ Construction Permit",
    activityTrigger: "Application for a Construction Permit by an applicant and then subsequent application for an Operating License under 10 CFR Part 50.",
    description: "Authorization under 10 CFR Part 50, for which review under the National Environmental Policy Act is required, covers construction of a new nuclear power plant under the Atomic Energy Act. A construction permit does not allow operation but, if certain requirements are met, the applicant may convert the construction permit to an operating license as approved by the NRC.",
    statuteRegulation: "Atomic Energy Act is Sections 103 and 185(b)"
  },
  {
    id: "oil-and-gas-sundry-notice-for-surface-disturbing-activity",
    name: "Oil and Gas Sundry Notice for Surface Disturbing Activity",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Land‐based Oil & Gas ‐ Production/Extraction",
    activityTrigger: "Proposal to build large oil and gas processing facility \"on lease\"",
    description: "Surface disturbing activities \"on lease\" (i.e. located on the same lease, unit, or communitization agreement as the lease from which all processed fluids are produced) must be permitted on Sundry Notice Form 3160‐5. The proposal must include a Surface Use Plan.",
    statuteRegulation: "Mineral Leasing Act (30 USC) 43 CFR3162.3‐2"
  },
  {
    id: "oil-spill-response-plan-doi-bsee",
    name: "Oil Spill Response Plan (DOI - BSEE)",
    responsibleAgency: "DOI",
    responsibleOffice: "BSEE",
    projectType: "Offshore Oil & Gas",
    activityTrigger: "You must submit, and BSEE must approve, an OSRP that covers each facility located seaward of the coast line before you may use that facility.",
    description: "If you are the owner or operator of an oil handling, storage, or transportation facility, and it is located seaward of the coast line, you must submit an oil spill response plan to BSEE for approval.",
    statuteRegulation: "30 CFR 254"
  },
  {
    id: "outer-continental-shelf-ocs-air-permit",
    name: "Outer Continental Shelf (OCS) Air Permit",
    responsibleAgency: "EPA ",
    responsibleOffice: "EPA Region",
    projectType: "Any equipment, activity or facility which: (1) Emits or has the potential to emit any air pollutant; (2) Is regulated or authorized under the Outer Continental Shelf Lands Act (“OCSLA”) (43 U.S.C. §1331 et seq.); and (3) Is located on the OCS or in or on waters above the OCS",
    activityTrigger: "Application for construction and operations of an offshore energy project on the OCS filed pursuant to section 328 of the CAA and  40 CFR part 55.",
    description: "The Outer Continental Shelf (OCS) Air Regulations, found at 40 CFR part 55, establish the applicable air pollution control requirements, including provisions related to permitting, monitoring, reporting, fees, compliance, and enforcement, for facilities subject to the Clean Air Act (CAA) section 328. These regulations apply to OCS Sources that are located beyond state seaward boundaries up to 25 nautical miles, with the exception of OCS sources located in the Gulf of Mexico west of 87.5° longitude (i.e. offshore TX, LA, MS, AL) and areas offshore the North Slope of Alaska, which are under the authority of the Department of Interior's Bureau of Ocean Energy Management (DOI-BOEM).  Applicants locating beyond 25 nautical miles from the state seaward boundary are also subject to these regulations and may need an OCS permit.",
    statuteRegulation: "CAA Section 328 and 40 CFR Part 55"
  },
  {
    id: "outgrant-administrative-action",
    name: "Outgrant Administrative Action",
    responsibleAgency: "DOD, US Army",
    responsibleOffice: "USAF, USN, USACE",
    projectType: "All, with exception for Wind: Federal Offshore",
    activityTrigger: "Project proponent seeks to right to use DOD installation land or facilities (e.g. lease or easement.",
    description: "An outgrant refers in general to a legal document that conveys or grants the use of DOD-controlled real property",
    statuteRegulation: "Department of Defense Instruction 4165.70, Real Property Management"
  },
  {
    id: "operations-plan-surface-use-plan",
    name: "Operations Plan / Surface Use Plan",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Surface disturbance activities prior to obtaining exploration or drilling permit, or start of NEPA approval process",
    description: "The operator may submit the Operations Plan (a.k.a. surface use plan): (1) as part of the GDP application; or (2) by itself, prior to submitting a GDP application, by using a Sundry Notice (NEPA analysis and approval required before starting surface operations (see 43 CFR 3261 ‐ Drilling Operations: Getting a Permit). This will allow the operator  to begin the NEPA approval process earlier and begin surface preparations while the rest of the GDP application is prepared. Plan describes access to well location(s), size of drilling pad(s), environmental mitigation measures, etc.",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "right-of-way-authorization-doi-bia",
    name: "Right‐of‐way Authorization (DOI‐‐BIA)",
    responsibleAgency: "DOI",
    responsibleOffice: "BIA",
    projectType: "Electricity Transmission \"Rural Energy\" Projects \nSurface Transportation (all) \nBroadband (all)",
    activityTrigger: "Application by prospective transportation developers, utilities and adjoining landowners to access, cross or provide services and utilities on Indian lands",
    description: "Application by prospective transportation developers, utilities and adjoining landowners to access, cross or provide services and utilities on Indian lands",
    statuteRegulation: "25 USC 323 ‐ 328 and 25 USC 2218,\nwhere appropriate, 25 CFR 169 Rights‐ of‐Way over Indian Lands"
  },
  {
    id: "right-of-way-authorization-doi-blm",
    name: "Right‐of‐Way Authorization (DOI‐BLM)",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "‐ Wind energy : Other than Federal Offshore\n‐ Electricity Transmission (all)\n‐ Surface Transportation (all)\n‐ Broadband (all)\n‐ Water Resource Projects (all)",
    activityTrigger: "Filing a Right‐of‐Way application (SF‐\n299) to request a right‐of‐way grant for the use of public lands.",
    description: "Applications for proposed rights‐of‐way over, upon, under, or through public lands,\nincluding, but not limited to, grants for wind energy site testing and monitoring, power distribution lines, trails, highways, communication site facilities, water retention  basins, and water conveyance pipelines. The processing of right‐of‐way applications must comply with the BLM’s regulatory requirements, including those for planning, environmental, and right‐of‐way. BLM may approve application, approve the application with modifications, or deny the application. • A BLM right‐of‐way grant is required for an oil or gas pipeline to cross Federal lands under BLM's jurisdiction or   the jurisdiction of two or more Federal agencies (43 CFR 2881.11). • The BLM requires as a matter of policy that all prospective applicants schedule and participate in at least",
    statuteRegulation: "Title V of the Federal Land Policy and Management Act of 1976, as amended (FLPMA) (43 USC 1763), 43 CFR 2800"
  },
  {
    id: "right-of-way-authorization-doi-fws",
    name: "Right‐of‐Way Authorization (DOI‐FWS)",
    responsibleAgency: "DOI",
    responsibleOffice: "FWS",
    projectType: "All",
    activityTrigger: "Use of national wildlife refuge lands",
    description: "The National Wildlife Refuge System Improvement Act requires that any activity on Refuge lands be determined as compatible with the Refuge system mission and Refuge purpose(s). Compatibility determinations are made by the Service's Refuge Managers. The FWS will conduct a review of projects on lands managed by it and coordinate any responses with the reviewing/lead agency. NWR lands are mainly for environmental, wildlife, recreational, educational purposes.",
    statuteRegulation: "Title V of the Federal Land Policy and Management Act of 1976, as amended (FLPMA) (43 USC 1763), 43 CFR 2800"
  },
  {
    id: "section-10-of-the-rivers-and-harbors-act-of-1899",
    name: "Section 10 of the Rivers and Harbors Act of 1899",
    responsibleAgency: "US Army",
    responsibleOffice: "USACE",
    projectType: "All",
    activityTrigger: "Placement of structures affecting course, location, condition, or capacity of navigable waters of U.S. (includes offshore wind within 3 miles of coast); exemptions exist)",
    description: "Activities that may affect navigation on US waterways must be evaluated to ensure navigational capacity is maintained.",
    statuteRegulation: "Rivers and Harbors Act of 1899 (33\nU.S.C. 401 et seq.) Section 10 (33 USC 403)"
  },
  {
    id: "section-103-of-the-marine-protection-research-and-sanctuarie",
    name: "Section 103 of the Marine Protection, Research, and Sanctuaries Act",
    responsibleAgency: "US Army",
    responsibleOffice: "USACE District Office -- Regulatory",
    projectType: "All",
    activityTrigger: "All proposed transportation of dredged material for disposal in ocean waters",
    description: "Ocean dumping requires a permit issued under Section 103 the MPRSA. In the case of dredged material, the decision to issue a permit is made by the U.S. Army Corps of Engineers, using EPA´s environmental criteria and subject to EPA´s concurrence.  EPA is responsible for designating recommended ocean dumping sites (through promulgation in the Code of Federal Regulations).",
    statuteRegulation: "Title I, Marine Protection Research and Sanctuaries Act (33 USC 1401 et seq. ), Section 103; 33 CFR 325.1 Applications for permits."
  },
  {
    id: "section-106-review",
    name: "Section 106 Review",
    responsibleAgency: "ACHP",
    responsibleOffice: "ACHP",
    projectType: "All",
    activityTrigger: "Activities that could involve Federal impacts on properties listed in or are eligible for National Register of Historic Places",
    description: "Section 106 of the National Historic Preservation Act of 1966 (NHPA) requires Federal agencies to take into account the effects of their undertakings on historic properties, and afford the Advisory Council on Historic Preservation a reasonable opportunity to comment. Federal agencies must complete this process prior to moving forward with, or issuing a permit, license, or assistance for, an undertaking. While completion of the Section 106 process is not an “authorization” per se, a federal agency must be able to show evidence that it has properly concluded its review in accordance with the regulations.",
    statuteRegulation: "Section 106 of the National Historic Preservation Act of 1966 (NHPA)"
  },
  {
    id: "section-1222-project",
    name: "Section 1222 Project",
    responsibleAgency: "DOE",
    responsibleOffice: "DOE",
    projectType: "Electric Transmission",
    activityTrigger: "Application/proposal",
    description: "The Secretary of Energy, acting through the Southwestern Power Administration (Southwestern) or the Western Area Power Administration (Western), has the authority to design, develop, construct, operate, own, or participate with other entities in designing, developing, constructing, operating, maintaining, or owning two          types of projects: (1) Electric power transmission facilities and related facilities needed to upgrade existing transmission facilities owned by Southwestern or Western (42\nU.S.C 16421(a)), or (2) New electric power transmission facilities and related facilities located within any State in which Southwestern or Western operates (42 U.S.C. 16421(b)).",
    statuteRegulation: "Section 1222 of the Energy Policy Act of 2005 (42 U.S.C. 16421)"
  },
  {
    id: "section-404-clean-water-act",
    name: "Section 404 Clean Water Act",
    responsibleAgency: "US Army",
    responsibleOffice: "USACE ‐ Regulatory",
    projectType: "All",
    activityTrigger: "Discharge of dredged or fill materials into waters of U.S. (includes wetlands, defined as \"areas that are inundated or saturated by surface or ground water at a frequency and duration sufficient to support, and that under normal circumstances do support, a  prevalence of vegetation typically adapted for life in saturated soil conditions. Wetlands generally include swamps, marshes, bogs, and similar areas\")",
    description: "Clean Water Act Section 404 regulates the discharge of dredged and fill material into waters of the United States, including wetlands. In general, to obtain a Section 404 permit, applicants must demonstrate that the discharge of dredged or fill material would not significantly degrade the nation's waters and there are no practicable alternatives less damaging to the aquatic ecosystem, so long as the alternative does not have other significant adverse environmental consequences. Applicants should also describe steps taken to minimize impacts to water bodies and wetlands and        provide appropriate and practicable mitigation, such as restoring or creating wetlands, for any remaining, unavoidable impacts.",
    statuteRegulation: "Clean Water Act (33 USC 1251 et seq.) Section 404 (33 USC 1344)"
  },
  {
    id: "section-408-permit",
    name: "Section 408 Permit",
    responsibleAgency: "US Army",
    responsibleOffice: "USACE",
    projectType: "All",
    activityTrigger: "Alteration/modification of a federal project",
    description: "That the Secretary may, on the recommendation of the Chief of Engineers, grant permission for the alteration or permanent occupation or use of any of the aforementioned public works when in the judgment of the Secretary such occupation or use will not be injurious to the public interest and will not impair the usefulness of such work.",
    statuteRegulation: "33 USC 408 (Chapter 9.1), Navigation and Navigable Waters: It is unlawful for any person(s) to build upon, alter, deface, destroy, move, injure, obstruct or… impair the usefulness of any levee or other work built by the U.S."
  },
  {
    id: "service-line-agreement",
    name: "Service Line Agreement",
    responsibleAgency: "DOI",
    responsibleOffice: "BIA",
    projectType: "All",
    activityTrigger: "Application by prospective transportation developers, utilities and adjoining landowners to access, cross or provide services and utilities on Indian lands",
    description: "Authorized rights of way and easements for access to and across Indian lands and to transport a variety of commodities including water, oil, gas, broadband, telephone service and electricity across and to Indian lands.",
    statuteRegulation: "25 U.S.C. 47, 323‐328, 450"
  },
  {
    id: "site-license-doi-blm",
    name: "Site License (DOI - BLM)",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "A site license is required of operators who are not the geothermal lease holder to operate the facility on the described land and determine rental fee.",
    description: "Site License (no form)",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "special-use-permit-blm",
    name: "Special Use Permit (BLM)",
    responsibleAgency: "DOI",
    responsibleOffice: "BLM",
    projectType: "Geothermal",
    activityTrigger: "Split estates where BLM is the surface managing agency but does not own the subsurface mineral resource (the mineral estate was not reserved to the Federal government)",
    description: "Special Use Permit (no form). In split estate where BLM is the surface management (the mineral estate was not reserved to the Federal government), a special use permit, usually, a rights of way (ROW) is required to occupy the surface. The drilling permit will be approved by the appropriate State agency.",
    statuteRegulation: "Geothermal Steam Act (30 USC 1001 et seq.); Federal Land Policy Management Act (43 USC 1701 et seq.); Energy Policy Act of 2005 (Pub. L. 109‐58)"
  },
  {
    id: "special-use-permit-fs",
    name: "Special Use Permit (FS)",
    responsibleAgency: "USDA",
    responsibleOffice: "FS",
    projectType: "All",
    activityTrigger: "Proposed activities impact Forest Service owned lands",
    description: "The Forest Service requires a special use permit for all uses and occupancies of National Forest System (NFS) lands with certain limited exceptions. The Agency's special‐uses program authorizes uses on NFS land that provide a benefit to the general public and protect public and natural resource values. These uses cover a variety of activities ranging from individual private uses to large‐scale commercial facilities and public services. Examples of authorized land uses include road rights‐of‐way accessing private residences and non‐Federal lands, domestic water supplies and water conveyance systems, utility rights‐of‐way, communications uses, ski areas, resorts, marinas, outfitting and guiding services, and public parks and campgrounds. The   Forest Service carefully reviews each application to determine how the request affects the public's use of NFS land.",
    statuteRegulation: "Federal Land Policy and Management Act of 1976, the Organic Act of 1897, the Mineral Leasing Act and others"
  },
  {
    id: "state-local-tribal-or-other-non-federal-action",
    name: "State, Local Tribal, or Other Non-Federal Action",
    responsibleAgency: "All",
    responsibleOffice: "All",
    projectType: "All",
    activityTrigger: "Federally required decisions, authorizations, or permits that have been assumed by, or delegated to, State, Local, Tribal or other non-Federal agencies. ",
    description: "Federally required permits, environmental reviews, or authorizations that have been assumed by, or delegated to, State, Local, Tribal, or other non-Federal agencies may be tracked using this action. This decision or authorization may be added to the Permitting Dashboard if the State, Local, Tribal, or other non-Federal agency has opted in and the action is a prerequisite to the issuance of a decision or authorization by a Federal agency.",
    statuteRegulation: "Various"
  },
  {
    id: "uscg-bridge-permit",
    name: "USCG Bridge Permit",
    responsibleAgency: "DHS",
    responsibleOffice: "USCG ‐ Office of Bridge Programs",
    projectType: "Bridges",
    activityTrigger: "Construction of bridges or causeways over or in any navigable river or other navigable water, and international bridges regardless of the waterway's navigability.",
    description: "Federal law prohibits the construction or modification of any bridge across navigable waters of the United States unless first authorized by the Coast Guard. The Coast Guard approves the location, plans and navigational clearances of bridges through the issuance of bridge permits or bridge permit amendments.",
    statuteRegulation: "Section 9, Rivers and Harbors Appropriations Act of 1899, as amended (33 USC 401); the Act of March 23, 1906, amended (33 USC 491), the General Bridge Act of 1946, amended (33 USC 525); the International Bridge Act of 1972 (33 USC 535)"
  },
  {
    id: "uscg-letter-of-recommendation-for-marine-operations",
    name: "USCG Letter of Recommendation for Marine Operations",
    responsibleAgency: "USCG",
    responsibleOffice: "USCG Captain of the Port (COTG)",
    projectType: "Liquefied Natural Gas Terminal Facilities ",
    activityTrigger: "An owner or operator seeking approval from FERC to build and operate or expand a LNG facility, as defined in 33 CFR Part 127",
    description: "An owner or operator intending to build a new facility handling LNG or LHG, or  planning new construction to expand or modify marine terminal operations in an existing facility handling LNG or LHG, where construction, expansion, or modification would result in an increase in the size and/or frequency of LNG or LHG marine traffic on the waterway associated with a proposed facility or modification, must submit a Letter of Intent (LOI) to the Captain of the Port (COTP) of the zone in which the facility is or will be located, no later than the date that the owner or operator files a pre-filing request with FERC, but, in all cases, at least 1 year prior to the start of construction. The owner/operator must prepare or update a Waterway Suitability Assessment; after the COTP receives the LOI the COTP issues a Letter of Recommendation (LOR) as to the suitability of the waterway for LNG or LHG marine traffic to the Federal, State, or local government agencies having jurisdiction for siting, construction, and operation. ",
    statuteRegulation: "33 CFR 127.007 Letter of intent and waterway suitability assessment; 33 CFR 127.009 Letter of recommendation."
  },
  {
    id: "use-authorization-doi-bor",
    name: "Use Authorization (DOI-BOR)",
    responsibleAgency: "BOR",
    responsibleOffice: "BOR",
    projectType: "Federal Hydropower\nNon‐Federal Hydropower ‐ Leases \nNon‐Federal Hydropower ‐ Licenses (including Non‐Federal Marine and Hydrokinetic Projects)",
    activityTrigger: "Through communication with the local Reclamation office and submission of an application using one of the following forms depending on the nature of the requested use:(a) Use SF 299 to request a use authorization for the placement, construction, and use of energy, transportation, water, or telecommunication systems and facilities on or across all Federal property including Reclamation land, facilities, or waterbodies.\n(b) Use Form 7–2540 to request any other type of use authorization.",
    description: "Applications to obtain a use authorization for the placement, construction, and use of energy, transportation, water, or telecommunication systems and facilities on or across all Federal property including Reclamation land, facilities, or waterbodies.\nReclamation uses SF 299, Application for Transportation and Utility Systems and Facilities on Federal Lands. The regulations addressing this are 43 CFR part 429, Use of Bureau of Reclamation Land, Facilities, and Waterbodies.",
    statuteRegulation: "Title V of the Federal Land Policy and Management Act of 1976, as amended (FLPMA) (43 USC 1763), 43 CFR 2800"
  },
  {
    id: "wild-and-scenic-rivers-act-determination-coordination",
    name: "Wild and Scenic Rivers Act Determination/ Coordination",
    responsibleAgency: "BLM",
    responsibleOffice: "BLM, FWS, NPS, or USFS",
    projectType: "Hydropower (all)          Surface Transportation (all) Electricity Transmission (all) Water Resource Projects (all)",
    activityTrigger: "Projects on national wild and scenic rivers, congressionally authorized study rivers, or upstream, downstream or on a tributary of such rivers.",
    description: "The Wild and Scenic Rivers Act prohibits a federal agency from issuing a permit, license, loan, grant, or other assistance for an activity that would adversely affect the free‐flow, water quality, or outstandingly remarkable river values of a national wild and scenic river.\nThe river administering agency (BLM, FWS, NPS, or USFS) makes the determination about effects, and coordinates with proponents to achieve compliant projects. FERC is prohibited from licensing construction of any hydroelectric dam or other project works regulated under the Federal Power Act on designated wild and scenic rivers and Congressionally authorized study areas.",
    statuteRegulation: "Wild and Scenic Rivers Act, 16 U.S.C. 1271–1287: Sections 7, 10(a), and 12;\n• 36 CFR part 297 (USFS); • 43 CFR part 8350 (BLM)."
  },
  {
    id: "wind-energy-evaluation-lease-indian-lands",
    name: "Wind Energy Evaluation Lease ‐ Indian Lands",
    responsibleAgency: "DOI",
    responsibleOffice: "DOI ‐ BIA",
    projectType: "Wind: Other than Federal Offshore",
    activityTrigger: "Contract approved by the Secretary that authorizes possession of Indian land for a specific purpose and term.",
    description: "Lease allows the possession of Indian land for wind energy evaluation in exchange for pre‐defined royalties.",
    statuteRegulation: ""
  },
  {
    id: "clean-water-act-section-401-water-quality-certification",
    name: "Clean Water Act Section 401 Water Quality Certification",
    responsibleAgency: "State or EPA",
    responsibleOffice: "State Water Quality Agency or EPA Region",
    projectType: "All",
    activityTrigger: "Any activity that may result in a discharge to waters of the United States and requires a federal license or permit.",
    description: "Section 401 of the Clean Water Act requires that any applicant for a federal license or permit to conduct any activity that may result in a discharge to waters of the United States must obtain a certification from the state (or EPA where appropriate) that the discharge will comply with applicable water quality standards.",
    statuteRegulation: "Clean Water Act Section 401 (33 USC 1341)"
  },
  {
    id: "coastal-zone-management-act-consistency-determination",
    name: "Coastal Zone Management Act Consistency Determination",
    responsibleAgency: "State Coastal Zone Management Agency",
    responsibleOffice: "State Coastal Zone Management Agency with NOAA oversight",
    projectType: "All",
    activityTrigger: "Federal actions or federally permitted activities that may affect coastal uses or resources.",
    description: "Under the Coastal Zone Management Act (CZMA), federal agency activities that affect any land or water use or natural resource of the coastal zone must be consistent to the maximum extent practicable with the enforceable policies of approved state coastal management programs. Applicants for federal licenses or permits affecting the coastal zone must provide the state with a consistency certification.",
    statuteRegulation: "Coastal Zone Management Act (16 USC 1451-1466), 15 CFR Part 930"
  }
]

export const permitInventory: PermitInfo[] = rawPermitInventory.map((permit) => ({
  ...permit,
  integrationStatus: getIntegrationStatus(permit.id)
}))

// Common keywords for fuzzy matching
function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // Extract meaningful words (skip common filler words)
  const stopWords = new Set(["the", "of", "a", "an", "and", "or", "for", "to", "in", "on", "by", "act", "permit", "authorization", "consultation", "review", "determination"])
  return normalized.split(" ").filter(word => word.length > 2 && !stopWords.has(word))
}

// Calculate keyword overlap score
function keywordOverlapScore(labelKeywords: string[], permitKeywords: string[]): number {
  let matches = 0
  for (const keyword of labelKeywords) {
    if (permitKeywords.some(pk => pk.includes(keyword) || keyword.includes(pk))) {
      matches++
    }
  }
  return matches
}

// Key pattern matchers for common permit naming variations
const PERMIT_ALIASES: Record<string, string[]> = {
  "section-404-clean-water-act": [
    "clean water act section 404",
    "cwa section 404",
    "cwa 404",
    "section 404",
    "wetlands permit"
  ],
  "clean-water-act-section-402-permit-national-pollutant-discha": [
    "clean water act section 402",
    "cwa section 402",
    "cwa 402",
    "npdes",
    "section 402"
  ],
  "section-10-of-the-rivers-and-harbors-act-of-1899": [
    "rivers and harbors act section 10",
    "rivers harbors section 10",
    "section 10 rivers",
    "section 10 permit"
  ],
  "endangered-species-act-consultation-doi-fws": [
    "endangered species act section 7",
    "esa section 7",
    "esa consultation",
    "section 7 consultation",
    "usfws consultation",
    "fws consultation"
  ],
  "endangered-species-act-consultation-noaa-nmfs": [
    "nmfs esa consultation",
    "noaa esa consultation",
    "marine esa consultation"
  ],
  "section-106-review": [
    "national historic preservation act section 106",
    "nhpa section 106",
    "section 106 consultation",
    "historic preservation review"
  ],
  "right-of-way-authorization-doi-blm": [
    "federal land policy and management act right-of-way",
    "flpma right-of-way",
    "blm right-of-way",
    "federal land right-of-way"
  ],
  "magnuson-stevens-fishery-conservation-and-management-act-sec": [
    "essential fish habitat",
    "efh consultation",
    "magnuson-stevens"
  ],
  "fish-and-wildlife-coordination-act-review-doi-fws": [
    "fish and wildlife coordination act",
    "fwca review"
  ],
  "marine-mammal-protection-act-mmpa-incidental-take-authorizat": [
    "marine mammal protection act",
    "mmpa",
    "incidental take authorization"
  ],
  "migratory-bird-treaty-act-permits": [
    "migratory bird treaty act",
    "mbta permit"
  ],
  "bald-and-golden-eagle-protection-permit": [
    "eagle protection permit",
    "bald eagle permit",
    "golden eagle permit",
    "bgepa"
  ],
  "section-408-permit": [
    "section 408",
    "usace 408"
  ],
  "coastal-zone-management-act-consistency-determination": [
    "coastal zone management act",
    "czma consistency",
    "czma",
    "coastal consistency"
  ],
  "clean-water-act-section-401-water-quality-certification": [
    "clean water act section 401",
    "cwa section 401",
    "cwa 401",
    "section 401",
    "water quality certification",
    "401 certification"
  ]
}

export function findPermitByLabel(label: string): PermitInfo | undefined {
  const normalized = label.toLowerCase().trim()

  // 1. Exact match
  const exact = permitInventory.find(p => p.name.toLowerCase() === normalized)
  if (exact) return exact

  // 2. Check aliases
  for (const [permitId, aliases] of Object.entries(PERMIT_ALIASES)) {
    if (aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
      const permit = permitInventory.find(p => p.id === permitId)
      if (permit) return permit
    }
  }

  // 3. Substring match
  const substringMatch = permitInventory.find(
    p => normalized.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(normalized)
  )
  if (substringMatch) return substringMatch

  // 4. Keyword overlap scoring
  const labelKeywords = extractKeywords(label)
  if (labelKeywords.length === 0) return undefined

  let bestMatch: PermitInfo | undefined
  let bestScore = 0

  for (const permit of permitInventory) {
    const permitKeywords = extractKeywords(permit.name)
    const score = keywordOverlapScore(labelKeywords, permitKeywords)

    // Require at least 2 keyword matches for a valid match
    if (score > bestScore && score >= 2) {
      bestScore = score
      bestMatch = permit
    }
  }

  return bestMatch
}

export function getPermitInfoUrl(permitId: string): string {
  return "/permit-info/" + permitId
}

// Get permit by ID
export function getPermitById(id: string): PermitInfo | undefined {
  return permitInventory.find(p => p.id === id)
}

// Get all permit names for suggestions
export function getPermitNames(): string[] {
  return permitInventory.map(p => p.name)
}

// Get permit name/id pairs for CopilotKit
export function getPermitOptions(): Array<{ id: string; name: string; agency: string }> {
  return permitInventory.map(p => ({
    id: p.id,
    name: p.name,
    agency: p.responsibleAgency
  }))
}
