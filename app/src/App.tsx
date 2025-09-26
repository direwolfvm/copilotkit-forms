import { useMemo, useState } from "react"
import Form from "@rjsf/core"
import type { IChangeEvent } from "@rjsf/core"
import validator from "@rjsf/validator-ajv8"
import { CopilotKit, useCopilotAction, useCopilotReadable } from "@copilotkit/react-core"
import { CopilotSidebar } from "@copilotkit/react-ui"
import "@copilotkit/react-ui/styles.css"

import type { ProjectFormData, ProjectContact, SimpleProjectField } from "./schema/projectSchema"
import {
  createEmptyProjectData,
  formatProjectSummary,
  isNumericProjectField,
  projectFieldDetails,
  projectSchema,
  projectUiSchema
} from "./schema/projectSchema"
import { ProjectSummary } from "./components/ProjectSummary"
import "./App.css"

type UpdatesPayload = Record<string, unknown>

type ProjectFormWithCopilotProps = {
  showApiKeyWarning: boolean
}

function ProjectFormWithCopilot({ showApiKeyWarning }: ProjectFormWithCopilotProps) {
  const [formData, setFormData] = useState<ProjectFormData>(() => createEmptyProjectData())
  const [lastSaved, setLastSaved] = useState<string>()

  const assignProjectField = (
    target: ProjectFormData,
    field: SimpleProjectField,
    value: ProjectFormData[SimpleProjectField] | undefined
  ) => {
    if (value === undefined) {
      delete target[field]
    } else {
      ;(target as Record<SimpleProjectField, ProjectFormData[SimpleProjectField]>)[field] = value
    }
  }

  useCopilotReadable(
    {
      description: "Current CEQ project form data as formatted JSON",
      value: formData,
      convert: (_, value) => JSON.stringify(value, null, 2)
    },
    [formData]
  )

  useCopilotReadable(
    {
      description: "Human-readable project summary",
      value: formatProjectSummary(formData)
    },
    [formData]
  )

  useCopilotAction(
    {
      name: "updateProjectForm",
      description:
        "Update one or more fields on the CEQ Project form. Provide only the fields that should change.",
      parameters: [
        {
          name: "updates",
          type: "object",
          description:
            "Project field values to merge into the form. Strings should align with CEQ data standard semantics.",
          attributes: projectFieldDetails.map((field) => ({
            name: field.key,
            type: "string",
            description: field.description,
            required: false
          }))
        },
        {
          name: "sponsor_contact",
          type: "object",
          description:
            "Sponsor point of contact information. Provide any subset of name, organization, email, and phone.",
          required: false,
          attributes: [
            { name: "name", type: "string", description: "Contact name" },
            { name: "organization", type: "string", description: "Contact organization" },
            { name: "email", type: "string", description: "Contact email address" },
            { name: "phone", type: "string", description: "Contact phone number" }
          ]
        }
      ],
      handler: async ({ updates, sponsor_contact }: { updates?: UpdatesPayload; sponsor_contact?: ProjectContact }) => {
        setFormData((previous) => {
          const next: ProjectFormData = { ...previous }
          if (updates && typeof updates === "object") {
            for (const [rawKey, rawValue] of Object.entries(updates)) {
              const key = rawKey as SimpleProjectField
              if (!projectFieldDetails.some((field) => field.key === key)) {
                continue
              }

              const shouldDelete = rawValue === null || rawValue === "" || rawValue === undefined
              if (isNumericProjectField(key)) {
                if (shouldDelete) {
                  assignProjectField(next, key, undefined)
                } else if (typeof rawValue === "number") {
                  assignProjectField(next, key, rawValue as ProjectFormData[SimpleProjectField])
                } else {
                  const parsed = Number(
                    typeof rawValue === "string" ? rawValue : String(rawValue)
                  )
                  if (!Number.isNaN(parsed)) {
                    assignProjectField(next, key, parsed as ProjectFormData[SimpleProjectField])
                  }
                }
              } else {
                if (shouldDelete) {
                  assignProjectField(next, key, undefined)
                } else {
                  const stringValue =
                    typeof rawValue === "string"
                      ? rawValue
                      : rawValue !== undefined && rawValue !== null
                        ? String(rawValue)
                        : undefined
                  if (stringValue !== undefined) {
                    assignProjectField(next, key, stringValue as ProjectFormData[SimpleProjectField])
                  }
                }
              }
            }
          }

          if (sponsor_contact && typeof sponsor_contact === "object") {
            const mergedContact: ProjectContact = { ...(previous.sponsor_contact ?? {}) }
            for (const [contactKey, value] of Object.entries(sponsor_contact)) {
              if (value === undefined || value === null || value === "") {
                delete mergedContact[contactKey as keyof ProjectContact]
              } else {
                mergedContact[contactKey as keyof ProjectContact] = value as string
              }
            }
            if (Object.keys(mergedContact).length > 0) {
              next.sponsor_contact = mergedContact
            } else {
              delete next.sponsor_contact
            }
          }

          return next
        })
      }
    },
    [setFormData]
  )

  useCopilotAction(
    {
      name: "resetProjectForm",
      description: "Clear the CEQ Project form back to its initial state.",
      handler: async () => {
        setFormData(createEmptyProjectData())
        setLastSaved(undefined)
      }
    },
    [setFormData]
  )

  const instructions = useMemo(
    () =>
      [
        "You are a permitting domain expert helping complete the CEQ Project entity form.",
        "Use the updateProjectForm action whenever you can fill in or revise structured fields.",
        "Important fields include:",
        ...projectFieldDetails.map((field) => `- ${field.title}: ${field.description}`),
        "Use resetProjectForm when the user asks to start over."
      ].join("\n"),
    []
  )

  const sidebarSuggestions = useMemo(
    () => [
      {
        title: "Check for missing details",
        message:
          "Review the project form and let me know what information is still missing or inconsistent."
      },
      {
        title: "Write a public summary",
        message: "Draft a public-friendly project summary using the structured fields we have so far."
      },
      {
        title: "Validate location data",
        message:
          "Confirm that the location description, coordinates, and GeoJSON tell a consistent story."
      }
    ],
    []
  )

  const handleChange = (event: IChangeEvent<ProjectFormData>) => {
    setFormData(event.formData ?? createEmptyProjectData())
  }

  const handleSubmit = (event: IChangeEvent<ProjectFormData>) => {
    setFormData(event.formData ?? createEmptyProjectData())
    setLastSaved(new Date().toLocaleString())
  }

  const handleReset = () => {
    setFormData(createEmptyProjectData())
    setLastSaved(undefined)
  }

  return (
    <CopilotSidebar
      instructions={instructions}
      defaultOpen
      suggestions={sidebarSuggestions}
    >
      <main className="app">
        <header className="app-header">
          <div>
            <h1>CEQ Project Entity Form</h1>
            <p>
              Capture the fields defined in the Council on Environmental Quality project entity data
              standard. The Copilot can translate unstructured notes into the schema or suggest
              corrections as you work.
            </p>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={handleReset}>
              Reset form
            </button>
            {lastSaved ? <span className="status">Last saved {lastSaved}</span> : null}
          </div>
        </header>

        {showApiKeyWarning ? (
          <div className="callout warning" role="note">
            <strong>No Copilot Cloud key detected.</strong>
            <p>
              Set <code>VITE_COPILOTKIT_PUBLIC_API_KEY</code> in a <code>.env</code> file to enable live
              Copilot responses. The form will continue to work without it.
            </p>
          </div>
        ) : null}

        <section className="content">
          <div className="form-panel">
            <Form<ProjectFormData>
              schema={projectSchema}
              uiSchema={projectUiSchema}
              validator={validator}
              formData={formData}
              onChange={handleChange}
              onSubmit={handleSubmit}
              liveValidate
            >
              <button type="submit" className="primary">
                Save project snapshot
              </button>
            </Form>
          </div>
          <ProjectSummary data={formData} />
        </section>
      </main>
    </CopilotSidebar>
  )
}

const publicApiKey = import.meta.env.VITE_COPILOTKIT_PUBLIC_API_KEY
const runtimeUrl = import.meta.env.VITE_COPILOTKIT_RUNTIME_URL

function App() {
  return (
    <CopilotKit
      publicApiKey={publicApiKey || undefined}
      runtimeUrl={runtimeUrl || undefined}
    >
      <ProjectFormWithCopilot showApiKeyWarning={!publicApiKey} />
    </CopilotKit>
  )
}

export default App
