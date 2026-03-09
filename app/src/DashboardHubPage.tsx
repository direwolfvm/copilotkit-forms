import { Link } from "react-router-dom"

export default function DashboardHubPage() {
  return (
    <section className="hub-page">
      <header className="hub-page__header">
        <p className="hub-page__eyebrow">Dashboard</p>
        <h1>Project oversight and analytics.</h1>
        <p>
          Explore the project portfolio, view individual project timelines, and analyze
          workflow performance metrics.
        </p>
      </header>
      <div className="hub-page__grid">
        <article className="hub-page__card">
          <h2>Project Explorer</h2>
          <p>
            Browse all projects on a map and in a filterable table. View detailed timelines
            and milestones for any project.
          </p>
          <Link to="/dashboard/project-explorer" className="hub-page__link">
            Open Project Explorer
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
