import { Link } from "react-router-dom"

export default function ResourcesHubPage() {
  return (
    <section className="hub-page">
      <header className="hub-page__header">
        <p className="hub-page__eyebrow">Resources</p>
        <h1>Explore permitting resources.</h1>
        <p>
          Use these tools to assess potential environmental constraints and browse federal permit
          and authorization requirements.
        </p>
      </header>
      <div className="hub-page__grid">
        <article className="hub-page__card">
          <h2>Geospatial Screening</h2>
          <p>
            Run map-based screening to identify potential resource interactions before formal
            review and permitting steps.
          </p>
          <Link to="/resources/geospatial-screening" className="hub-page__link">
            Open Geospatial Screening
          </Link>
        </article>
        <article className="hub-page__card">
          <h2>Permit and Authorization Inventory</h2>
          <p>
            Browse the permit inventory to understand applicable federal authorizations and agency
            requirements by project context.
          </p>
          <Link to="/resources/permit-authorization-inventory" className="hub-page__link">
            Open Permit Inventory
          </Link>
        </article>
        <article className="hub-page__card">
          <h2>Shared Services</h2>
          <p>
            Explore federal shared services and tools that support environmental review and
            permitting across agencies.
          </p>
          <Link to="/resources/shared-services" className="hub-page__link">
            View Shared Services
          </Link>
        </article>
        <article className="hub-page__card">
          <h2>NEPA Compliance</h2>
          <p>
            Browse federal agencies with NEPA implementing procedures, organized by department,
            with links to source regulations and agency case management tools.
          </p>
          <Link to="/resources/nepa-compliance" className="hub-page__link">
            View NEPA Compliance
          </Link>
        </article>
      </div>
    </section>
  )
}
