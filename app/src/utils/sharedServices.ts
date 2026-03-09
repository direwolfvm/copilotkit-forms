// Shared services from "Tracking IT Functions - Permitting and Environmental Review"

export type SharedServiceCategory =
  | "GIS Analysis"
  | "Workflow Automation"
  | "Publication"
  | "Comment Analysis and Response"
  | "AI"

export interface SharedService {
  category: SharedServiceCategory
  agencySystemOwner: string
  systemName: string
  users: string
  functionalityDescription: string
}

export const sharedServices: SharedService[] = [
  {
    category: "GIS Analysis",
    agencySystemOwner: "EPA",
    systemName: "NEPAssist",
    users: "Public; Federal, state, local agencies",
    functionalityDescription: "GIS screening application that draws environmental data dynamically from EPA GIS databases and web services and provides screening of environmental indicators for a user-defined area of interest.",
  },
  {
    category: "GIS Analysis",
    agencySystemOwner: "DOI / USFWS",
    systemName: "ECOSphere - Protected Species and Habitat Data Repository",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Enterprise cloud internal system that houses species and habitat data and contains 19 permitting and environmental review workflows.",
  },
  {
    category: "GIS Analysis",
    agencySystemOwner: "NTIA",
    systemName: "APPEIT - Permitting and Environmental Information Application",
    users: "Public; State implementers",
    functionalityDescription: "GIS application to support broadband project planning that incorporates a curated set of relevant data layers to help identify potential environmental factors and permitting requirements.",
  },
  {
    category: "GIS Analysis",
    agencySystemOwner: "HUD",
    systemName: "TDAT - Tribal Directory Assessment Tool",
    users: "Federal agency staff",
    functionalityDescription: "GIS application to help users identify tribes that may have an interest in the location of a HUD-assistance project and provide tribal contact information, based on geographic areas of interest.",
  },
  {
    category: "GIS Analysis",
    agencySystemOwner: "Multiple Federal agencies",
    systemName: "Resource or sector-specific GIS mappers",
    users: "Federal agency staff",
    functionalityDescription: "Varies by agency - generally, a website to view GIS layers for specific resource areas to inform project design and siting or a specific review process.",
  },
  {
    category: "GIS Analysis",
    agencySystemOwner: "DOC / NOAA",
    systemName: "National ESA Species Range and Critical Habitat Mapper",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "GIS application to view range and critical habitat spatial data for NMFS species to support ESA consultation processes - builds on existing data sources and regional-level mappers.",
  },
  {
    category: "GIS Analysis",
    agencySystemOwner: "ACHP",
    systemName: "ACHP Cultural Resources Data Platform",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "GIS application to generate reports for areas of interest based on AI-supported aggregation of relevant geographical and cultural resources data - designed to inform project planning and reviews.",
  },
  {
    category: "GIS Analysis",
    agencySystemOwner: "CEQ/USACE/EPA others",
    systemName: "GIS Repository for NEPA and Permitting",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Curated set of data layers that agency systems could query, with defined decision logic for each query outcome to facilitate process automation. Will support and build off of NEPAssist.",
  },
  {
    category: "Workflow Automation",
    agencySystemOwner: "USFWS",
    systemName: "IPaC - Information for Planning and Consultation",
    users: "Federal agencies",
    functionalityDescription: "Automated project planning tool for public users and agencies to identify USFWS-managed species and habitats present, conduct an ESA consultation (in certain cases), and build full consultation packages (when needed).",
  },
  {
    category: "Workflow Automation",
    agencySystemOwner: "CEQ",
    systemName: "CE Explorer",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Repository of all Federal agency categorical exclusion lists sourced from agency NEPA procedures.",
  },
  {
    category: "Workflow Automation",
    agencySystemOwner: "CEQ",
    systemName: "CE Works",
    users: "Federal agencies",
    functionalityDescription: "Internal workflow automation and case management system to prepare categorical exclusion documentation based on project information, facilitate review by internal experts, and complete necessary approvals.",
  },
  {
    category: "Workflow Automation",
    agencySystemOwner: "CEQ",
    systemName: "Government-Wide Permitting Portal",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Public-facing portal to facilitate permit intake from applicants and route to agency permit and NEPA review systems for processing, and to provide information and resources to the public about reviews underway.",
  },
  {
    category: "Workflow Automation",
    agencySystemOwner: "TBD",
    systemName: "SF-299 Application Portal",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Proposal to digitize existing fillable PDF Standard Form 299 used by several agencies for ROW or leases associated with telecom, electric transmission, transportation, etc.",
  },
  {
    category: "Publication",
    agencySystemOwner: "EPA",
    systemName: "eNEPA EIS Filing",
    users: "Public; Federal agencies",
    functionalityDescription: "Electronic filing system used by federal agencies to submit EISs to EPA for official filing and publication in the Federal Register - built on CDX database.",
  },
  {
    category: "Publication",
    agencySystemOwner: "FPISC",
    systemName: "Permitting Dashboard",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Public-facing dashboard to track federal infrastructure projects and publish permitting timetables and project information for FAST-41 covered projects, transparency projects, and DOT projects.",
  },
  {
    category: "Publication",
    agencySystemOwner: "ACHP",
    systemName: "Active Section 106 Case Map",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Public-facing map viewer of active Section 106 cases with ACHP involvement.",
  },
  {
    category: "Publication",
    agencySystemOwner: "USACE",
    systemName: "USACE Permit Finder",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Public-facing map viewer showing data about USACE regulatory individual permits, projects requiring Section 408 authorizations, approved jurisdictional determinations, and NEPA reviews.",
  },
  {
    category: "Comment Analysis and Response",
    agencySystemOwner: "GSA",
    systemName: "Federal Docket Management System (FDMS) / Regulations.gov",
    users: "Public; Federal agency staff",
    functionalityDescription: "Public-facing website for agencies to gather public comments on rulemakings and other documents, including NEPA or permit documents. Includes an agency-facing backend for organizing and processing comments to facilitate agency staff review.",
  },
  {
    category: "Comment Analysis and Response",
    agencySystemOwner: "USDA / USFS",
    systemName: "CARA - Comment Analysis and Response Application",
    users: "USFS and BLM staff",
    functionalityDescription: "Internal application for conducting analysis of comments received on NEPA documents and for preparing responses.",
  },
  {
    category: "Comment Analysis and Response",
    agencySystemOwner: "DOE",
    systemName: "PermitAI Application: CommentNEPA",
    users: "Federal agency staff",
    functionalityDescription: "Proposed set of tools to support comment synthesis for NEPA documents - built on NEPATEC database knowledge set.",
  },
  {
    category: "AI",
    agencySystemOwner: "DOE",
    systemName: "NEPATEC Database (PermitAI)",
    users: "Public; Applicants; Federal agencies",
    functionalityDescription: "Database of ~80,000 NEPA and other environmental review documents that have been enriched using AI with metadata matching CEQ's data standard.",
  },
  {
    category: "AI",
    agencySystemOwner: "DOE",
    systemName: "PermitAI Applications: SearchNEPA, ChatNEPA, WriteNEPA",
    users: "Federal agency staff",
    functionalityDescription: "Proposed set of tools to support NEPA document reviews and drafting - built on NEPATEC database knowledge set.",
  },
  {
    category: "AI",
    agencySystemOwner: "NTIA",
    systemName: "EA Drafting AI Tool",
    users: "NTIA staff",
    functionalityDescription: "Pilot project to automate draft EA preparation for NTIA broadband reviews based on an existing programmatic NEPA document.",
  },
]

export const sharedServiceCategories: SharedServiceCategory[] = [
  "GIS Analysis",
  "Workflow Automation",
  "Publication",
  "Comment Analysis and Response",
  "AI",
]
