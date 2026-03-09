import { Link } from "react-router-dom"

export default function PortalHubPage() {
  return (
    <section className="hub-page">
      <header className="hub-page__header">
        <p className="hub-page__eyebrow">Portal</p>
        <h1>Project workspace and workflow tools.</h1>
        <p>
          Start a new project, monitor submissions in progress, and review analytics for workflow
          performance.
        </p>
      </header>
      <div className="hub-page__grid">
        <article className="hub-page__card">
          <h2>New project</h2>
          <p>Create a project and complete intake details in the project portal workflow.</p>
          <Link to="/portal/new" className="hub-page__link">
            Start New Project
          </Link>
        </article>
        <article className="hub-page__card">
          <h2>Projects</h2>
          <p>Review project status, process instances, and case events across active submissions.</p>
          <Link to="/projects" className="hub-page__link">
            View Projects
          </Link>
        </article>
        <article className="hub-page__card">
          <h2>Analytics</h2>
          <p>Track completion trends and turnaround metrics for portal and permitting workflows.</p>
          <Link to="/dashboard/analytics" className="hub-page__link">
            Open Analytics
          </Link>
        </article>
      </div>
    </section>
  )
}
