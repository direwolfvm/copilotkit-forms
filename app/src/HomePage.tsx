import { Link } from "react-router-dom"

import { ArcgisSketchMap } from "./components/ArcgisSketchMap"

const cards = [
  {
    title: "Projects overview",
    description:
      "Browse active permit applications, review their status at a glance, and jump into the supporting details for each project.",
    to: "/projects",
    linkLabel: "View projects"
  },
  {
    title: "Start a new project",
    description:
      "Work with the guided portal to capture locations, upload documents, and complete the forms needed to kick off permitting.",
    to: "/portal",
    linkLabel: "Open the portal"
  },
  {
    title: "Resource check",
    description:
      "Quickly verify key requirements like zoning, utilities, and environmental resources before you submit an application.",
    to: "/resource-check",
    linkLabel: "Run a check"
  }
]

function noopGeometryChange() {
  // The home page only preloads the ArcGIS resources.
}

export default function HomePage() {
  return (
    <div className="home">
      <section className="home__hero" aria-labelledby="home-hero-heading">
        <p className="home__eyebrow">Welcome to HelpPermit.me</p>
        <h1 id="home-hero-heading">Plan, review, and launch permitting projects with confidence</h1>
        <p className="home__intro">
          HelpPermit.me is an internal demo that showcases how we streamline project intake and review. Explore the
          tools below to see how location sketches, document review, and resource checks come together in one place.
        </p>
      </section>

      <section className="home__cards" aria-label="Explore HelpPermit.me">
        {cards.map((card) => (
          <article key={card.title} className="home-card">
            <h2 className="home-card__title">{card.title}</h2>
            <p className="home-card__body">{card.description}</p>
            <Link to={card.to} className="home-card__action">
              <span>{card.linkLabel}</span>
              <span aria-hidden="true" className="home-card__action-icon">
                →
              </span>
            </Link>
          </article>
        ))}
      </section>

      <div className="home__map-preloader" aria-hidden="true">
        <ArcgisSketchMap geometry={undefined} onGeometryChange={noopGeometryChange} hideSketchWidget isVisible={false} />
      </div>
    </div>
  )
}
