import { useMemo } from "react"

import { CopilotKit, useCopilotReadable } from "@copilotkit/react-core"
import { CopilotSidebar } from "@copilotkit/react-ui"
import "@copilotkit/react-ui/styles.css"

import "./copilot-overrides.css"
import "./App.css"
import "./DeveloperToolsPage.css"

import { getPublicApiKey, getRuntimeUrl } from "./runtimeConfig"
import { COPILOT_CLOUD_CHAT_URL } from "@copilotkit/shared"

interface EndpointDoc {
  title: string
  method: string
  path: string
  description: string
  queryParameters?: Array<{ name: string; description: string; required?: boolean }>
  requestExample?: string
  responseExample?: string
  notes?: string
}

interface SectionDoc {
  id: string
  title: string
  summary: string
  endpoints: EndpointDoc[]
}

const API_BASE_PLACEHOLDER = "https://yiggjfcwpagbupsmueax.supabase.co/rest/v1"

const sectionDocs: SectionDoc[] = [
  {
    id: "process-model",
    title: "1. Process model",
    summary:
      "Process models describe how an agency evaluates a project. In the project portal, the information option at the bottom of the page summarizes in plain language how this works.  This sections shows how to retrieve this information via API.  It summarizes the owning agency, legal authorities, and the latest screening guidance for the pre-screening workflow.",
    endpoints: [
      {
        title: "Retrieve process model details",
        method: "GET",
        path: `${API_BASE_PLACEHOLDER}/process_model`,
        description:
          "Fetch a specific process model including descriptive guidance and legal references.",
        queryParameters: [
          { name: "id=eq.<process_model_id>", description: "Filter to the pre-screening process model record.", required: true },
          {
            name: "select=*,legal_structure(*),decision_element(*)",
            description: "Expand related legal structure and decision elements to mirror the modal's content."
          }
        ],
        requestExample: `curl \n  -H "apikey: $SUPABASE_ANON_KEY" \n  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \n  "${API_BASE_PLACEHOLDER}/process_model?id=eq.1&select=*,legal_structure(*),decision_element(*)"`,
        responseExample: `[{\n  "id": 1,\n  "title": "Pre-screening intake",\n  "agency": "Demonstration Agency",\n  "screening_description": "Projects enter this process when...",\n  "legal_structure": {\n    "id": 3,\n    "title": "Statutory authority",\n    "citation": "Title 23",\n    "issuing_authority": "FHWA"\n  },\n  "decision_element": [ { "id": 27, "title": "Initial completeness review" } ]\n}]`,
        notes:
          "Replace the placeholder ID with the value exposed in the portal modal. The anon key should be loaded from server-side configuration and never embedded in client code."
      }
    ]
  },
  {
    id: "dashboard",
    title: "2. Dashboard",
    summary:
      "The project dashboard aggregates project records, process instances that show where each project is in the workflow, and case events logged by reviewers.",
    endpoints: [
      {
        title: "List projects",
        method: "GET",
        path: `${API_BASE_PLACEHOLDER}/project`,
        description: "Retrieve projects with location and sponsor metadata for the main table.",
        queryParameters: [
          {
            name: "select=id,name,status,primary_contact,created_at,process_instance:process_instance(*)",
            description: "Embed process instance information for quick status checks."
          },
          {
            name: "order=created_at.desc",
            description: "Sort by newest submissions first."
          }
        ],
        requestExample: `curl \n  -H "apikey: $SUPABASE_ANON_KEY" \n  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \n  "${API_BASE_PLACEHOLDER}/project?select=id,name,status,primary_contact,created_at"`,
        responseExample: `[{\n  "id": 42,\n  "name": "Riverbank restoration",\n  "status": "screening",\n  "primary_contact": "alex@example.gov",\n  "created_at": "2024-05-18T20:16:00Z"\n}]`
      },
      {
        title: "Track process instances",
        method: "GET",
        path: `${API_BASE_PLACEHOLDER}/process_instance`,
        description: "Show how each project is progressing through the modeled steps.",
        queryParameters: [
          { name: "select=id,project,process_model,current_step,last_updated", description: "Expose the active step and timestamps." },
          { name: "project=eq.<project_id>", description: "Filter instances associated with a project when drilling in." }
        ],
        requestExample: `curl \n  -H "apikey: $SUPABASE_ANON_KEY" \n  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \n  "${API_BASE_PLACEHOLDER}/process_instance?project=eq.42"`
      },
      {
        title: "Retrieve case events",
        method: "GET",
        path: `${API_BASE_PLACEHOLDER}/case_event`,
        description: "Load reviewer activity and milestone logs for a project detail view.",
        queryParameters: [
          { name: "project=eq.<project_id>", description: "Match the case events to the selected project.", required: true },
          {
            name: "order=occurred_at.desc",
            description: "Display the most recent activity first."
          }
        ],
        requestExample: `curl \n  -H "apikey: $SUPABASE_ANON_KEY" \n  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \n  "${API_BASE_PLACEHOLDER}/case_event?project=eq.42&order=occurred_at.desc"`
      }
    ]
  },
  {
    id: "portal",
    title: "3. Portal",
    summary:
      "Portal submissions capture the structured data behind a project, along with decision payloads from automated checks and optional GIS payloads created when a user sketches a footprint.",
    endpoints: [
      {
        title: "Submit a project",
        method: "POST",
        path: `${API_BASE_PLACEHOLDER}/project`,
        description: "Create or update the canonical project record from the portal form.",
        requestExample: `curl -X POST \n  -H "apikey: $SUPABASE_SERVICE_ROLE" \n  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \n  -H "Content-Type: application/json" \n  -d '{"name":"Riverbank restoration","status":"screening","primary_contact":"alex@example.gov"}' \n  "${API_BASE_PLACEHOLDER}/project"`,
        notes:
          "Writes require a service role key executed from a trusted backend endpoint. The portal proxies submissions through our Express server to prevent exposing the key."
      },
      {
        title: "Link process instance progress",
        method: "POST",
        path: `${API_BASE_PLACEHOLDER}/process_instance`,
        description: "Create a process instance when a new project is saved or advanced.",
        requestExample: `curl -X POST \n  -H "apikey: $SUPABASE_SERVICE_ROLE" \n  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \n  -H "Content-Type: application/json" \n  -d '{"project":42,"process_model":1,"current_step":"intake","last_updated":"2024-05-18T20:16:00Z"}' \n  "${API_BASE_PLACEHOLDER}/process_instance"`
      },
      {
        title: "Persist decision payloads",
        method: "POST",
        path: `${API_BASE_PLACEHOLDER}/decision_payload`,
        description: "Store structured JSON produced by the copilot or other evaluators when a portal submission is saved.",
        requestExample: `curl -X POST \n  -H "apikey: $SUPABASE_SERVICE_ROLE" \n  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \n  -H "Content-Type: application/json" \n  -d '{"project":42,"type":"validation","payload":{"notes":"No conflicts"}}' \n  "${API_BASE_PLACEHOLDER}/decision_payload"`
      },
      {
        title: "Attach GIS sketches",
        method: "POST",
        path: `${API_BASE_PLACEHOLDER}/gis_data`,
        description: "Capture GeoJSON or ArcGIS JSON documents associated with a submission.",
        requestExample: `curl -X POST \n  -H "apikey: $SUPABASE_SERVICE_ROLE" \n  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \n  -H "Content-Type: application/json" \n  -d '{"project":42,"geometry":{"type":"Polygon","coordinates":[...]},"buffer_miles":1}' \n  "${API_BASE_PLACEHOLDER}/gis_data"`,
        notes: "GIS payloads are optional. Store the raw geometry plus metadata like buffer distance so that screenings can be replayed."
      }
    ]
  },
  {
    id: "gis-screening",
    title: "4. GIS screening integrations",
    summary:
      "Resource Check fans out to the NEPA Assist and IPaC services. We proxy calls through the Node server to keep credentials private and to normalize responses before saving them as decision payloads.",
    endpoints: [
      {
        title: "Run NEPA Assist screening",
        method: "POST",
        path: `/api/geospatial/nepassist`,
        description: "Our backend proxy submits the buffered geometry to the NEPA Assist API and returns normalized summary metadata.",
        requestExample: `curl -X POST \n  -H "Content-Type: application/json" \n  -d '{"geometry":{"type":"Polygon","coordinates":[...]},"buffer_miles":1}' \n  "https://<app-host>/api/geospatial/nepassist"`,
        notes:
          "The proxy exchanges the request with the federal service and stores the results in Supabase as a decision payload when the user saves their portal form."
      },
      {
        title: "Run IPaC screening",
        method: "POST",
        path: `/api/geospatial/ipac`,
        description: "The proxy forwards project footprints to the U.S. Fish and Wildlife Service IPaC endpoint and enriches the response with summarized species and habitats.",
        requestExample: `curl -X POST \n  -H "Content-Type: application/json" \n  -d '{"geometry":{"type":"Polygon","coordinates":[...]},"buffer_miles":1}' \n  "https://<app-host>/api/geospatial/ipac"`,
        notes:
          "Responses are cached with the project record so we can show prior screenings on subsequent visits."
      }
    ]
  }
]

interface DeveloperToolsContentProps {
  hasCopilotConfiguration: boolean
}

function DeveloperToolsContent({ hasCopilotConfiguration }: DeveloperToolsContentProps) {
  const copilotInstructions = useMemo(
    () =>
      [
        "You are the developer tools copilot for HelpPermit.me.",
        "Explain how the Supabase REST API mirrors the project's database schema and how backend proxies protect secrets.",
        "Use the provided reference material when answering questions about endpoints, required keys, or data relationships.",
        "If someone asks for API keys, remind them to use environment variables and never expose secrets client-side."
      ].join("\n"),
    []
  )

  const knowledgeBase = useMemo(() => sectionDocs, [])

  useCopilotReadable(
    {
      description: "Supabase REST documentation for HelpPermit.me",
      value: knowledgeBase,
      available: hasCopilotConfiguration ? "enabled" : "disabled",
      convert: (_: unknown, sections: SectionDoc[]) =>
        sections
          .map((section: SectionDoc) => {
            const endpointLines = section.endpoints
              .map((endpoint: EndpointDoc) => {
                const parameters = endpoint.queryParameters
                  ? `Parameters: ${endpoint.queryParameters.map((param) => param.name).join(", ")}`
                  : ""
                return [
                  `${endpoint.title} (${endpoint.method} ${endpoint.path})`,
                  endpoint.description,
                  parameters,
                  endpoint.notes ? `Notes: ${endpoint.notes}` : null
                ]
                  .filter(Boolean)
                  .join("\n")
              })
              .join("\n\n")
            return [`Section: ${section.title}`, section.summary, endpointLines].filter(Boolean).join("\n")
          })
          .join("\n\n")
    },
    [knowledgeBase, hasCopilotConfiguration]
  )

  const pageContent = (
    <main className="developer-tools" aria-labelledby="developer-tools-heading">
      <header className="developer-tools__intro">
        <p className="developer-tools__eyebrow">Developer tools</p>
        <h1 id="developer-tools-heading">Supabase integration guide</h1>
        <p>
          Supabase exposes a REST interface for every table in our database. This page explains how you can interact with this data and build your own applications on top of the data structure.  We're using a commercial instance of supabase for the project below and there's no authentication besides the key (not provided below), but a real version would include that, or wrap the supabase implementation in a public API layer.
        </p>
      </header>

      {!hasCopilotConfiguration ? (
        <div className="developer-tools__callout" role="alert">
          <h2>Copilot chat is turned off</h2>
          <p>
            Add <code>VITE_COPILOTKIT_PUBLIC_API_KEY</code> or <code>VITE_COPILOTKIT_RUNTIME_URL</code> environment variables to
            enable the developer copilot sidebar. The reference documentation below is always available.
          </p>
        </div>
      ) : null}

      {knowledgeBase.map((section) => (
        <section key={section.id} className="swagger-section" aria-labelledby={`${section.id}-heading`}>
          <div className="swagger-section__header">
            <h2 id={`${section.id}-heading`}>{section.title}</h2>
            <p>{section.summary}</p>
          </div>
          <div className="swagger-section__endpoints">
            {section.endpoints.map((endpoint) => (
              <article key={`${section.id}-${endpoint.title}`} className="swagger-panel">
                <header className="swagger-panel__header">
                  <span className={`swagger-panel__method swagger-panel__method--${endpoint.method.toLowerCase()}`}>
                    {endpoint.method}
                  </span>
                  <h3>{endpoint.title}</h3>
                </header>
                <p className="swagger-panel__path">{endpoint.path}</p>
                <p className="swagger-panel__description">{endpoint.description}</p>
                {endpoint.queryParameters && endpoint.queryParameters.length > 0 ? (
                  <div className="swagger-panel__block">
                    <h4>Query parameters</h4>
                    <ul>
                      {endpoint.queryParameters.map((param) => (
                        <li key={param.name}>
                          <code>{param.name}</code>
                          {param.required ? <span className="swagger-panel__required">Required</span> : null}
                          <p>{param.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {endpoint.requestExample ? (
                  <div className="swagger-panel__block">
                    <h4>Request example</h4>
                    <pre>
                      <code>{endpoint.requestExample}</code>
                    </pre>
                  </div>
                ) : null}
                {endpoint.responseExample ? (
                  <div className="swagger-panel__block">
                    <h4>Sample response</h4>
                    <pre>
                      <code>{endpoint.responseExample}</code>
                    </pre>
                  </div>
                ) : null}
                {endpoint.notes ? <p className="swagger-panel__notes">{endpoint.notes}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  )

  if (!hasCopilotConfiguration) {
    return pageContent
  }

  return (
    <CopilotSidebar
      instructions={copilotInstructions}
      defaultOpen
      clickOutsideToClose={false}
      labels={{ title: "Developer tools copilot" }}
    >
      {pageContent}
    </CopilotSidebar>
  )
}

export default function DeveloperToolsPage() {
  const publicApiKey = getPublicApiKey()
  const runtimeUrl = getRuntimeUrl()
  const effectiveRuntimeUrl = runtimeUrl || COPILOT_CLOUD_CHAT_URL
  const hasCopilotConfiguration = Boolean(publicApiKey || runtimeUrl)

  return (
    <CopilotKit publicApiKey={publicApiKey || undefined} runtimeUrl={effectiveRuntimeUrl || undefined}>
      <DeveloperToolsContent hasCopilotConfiguration={hasCopilotConfiguration} />
    </CopilotKit>
  )
}
