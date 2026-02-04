import introJs from "intro.js"
import "intro.js/introjs.css"
import { useCallback, useEffect } from "react"
import { Link } from "react-router-dom"

import { ArcgisSketchMap } from "./components/ArcgisSketchMap"

const TOUR_STORAGE_KEY = "homeSiteTourComplete"

type FeaturePanel =
  | {
      kind: "internal"
      title: string
      description: string
      to: string
      linkLabel: string
    }
  | {
      kind: "external"
      title: string
      description: string
      href: string
      linkLabel: string
    }

const cards = [
  {
    title: "Projects overview",
    description:
      "Browse active permit applications, review their status and milestone progress at a glance, and jump into the supporting details for each project.",
    to: "/projects",
    linkLabel: "View projects"
  },
  {
    title: "Start a new project",
    description:
      "Work with the copilot to start your project and initiate a pre-screening process to kick off permitting (simulated, of course).",
    to: "/portal",
    linkLabel: "Open the portal"
  },
  {
    title: "Resource check",
    description:
      "Quickly assess how a project footprint might impact natural resources and evaluate the impact on environmental review and permitting before you submit an application.",
    to: "/resource-check",
    linkLabel: "Run a check"
  }
]

const featurePanels: FeaturePanel[] = [
  {
    kind: "internal",
    title: "About HelpPermit.me",
    description:
      "Learn about the ideas behind this demo and how these tools can support more efficient permitting and environmental review processes.",
    to: "/about",
    linkLabel: "Read about the project"
  },
  {
    kind: "external",
    title: "ReviewWorks demo system",
    description:
      "Visit the ReviewWorks demonstration environment to see the integrated case-management experience that exchanges project and case data with HelpPermit.me.",
    href: "https://reviewworks.app.cloud.gov/",
    linkLabel: "Open ReviewWorks"
  },
  {
    kind: "external",
    title: "PermitFlow demo system",
    description:
      "Visit the PermitFlow demonstration environment to explore its case-management workflows and shared data integration with HelpPermit.me.",
    href: "https://permitflow.app.cloud.gov/",
    linkLabel: "Open PermitFlow"
  },
  {
    kind: "internal",
    title: "Developer tools",
    description:
      "Explore the developer console to see how the CopilotKit integrations power AI-assisted workflows across the HelpPermit.me experience.",
    to: "/developer-tools",
    linkLabel: "Open developer tools"
  }
]

function noopGeometryChange() {
  // The home page only preloads the ArcGIS resources.
}

export default function HomePage() {
  const startTour = useCallback(() => {
    const navLinks = Array.from(
      document.querySelectorAll<HTMLElement>("[data-tour='nav-link']")
    ).filter((element) => element.dataset.tourIntro)

    if (!navLinks.length) {
      return null
    }

    const intro = introJs()

    intro.setOptions({
      steps: navLinks.map((element) => ({
        element,
        title: element.dataset.tourTitle,
        intro: element.dataset.tourIntro ?? ""
      })),
      showProgress: true,
      showBullets: false,
      disableInteraction: true,
      exitOnOverlayClick: true,
      nextLabel: "Next",
      prevLabel: "Back",
      doneLabel: "Finish",
      tooltipClass: "site-tour__tooltip",
      highlightClass: "site-tour__highlight"
    })

    const markTourComplete = () => {
      localStorage.setItem(TOUR_STORAGE_KEY, "true")
    }

    intro.oncomplete(markTourComplete)
    intro.onexit(markTourComplete)

    intro.start()

    return intro
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (localStorage.getItem(TOUR_STORAGE_KEY) === "true") {
      return
    }

    const intro = startTour()

    return () => {
      intro?.exit()
    }
  }, [startTour])

  return (
    <div className="home">
      <section className="home__hero" aria-labelledby="home-hero-heading">
        <div className="home__hero-top">
          <div className="home__hero-headings">
            <p className="home__eyebrow">Welcome to HelpPermit.me</p>
            <h1 id="home-hero-heading">Explore technology in permitting and environmental review</h1>
          </div>
          <button type="button" className="home__tour-button" onClick={() => startTour()}>
            Take a Tour
          </button>
        </div>
        <p className="home__intro">
          HelpPermit.me is an  demo that showcases how technology tools like AI can streamline project intake and review. Explore the
          tools below to see how project tracking, application portals, and geospatial screening tools come together in one place.
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

      <section className="home__feature-panels" aria-label="Dive deeper into HelpPermit.me">
        {featurePanels.map((panel) => (
          <article key={panel.title} className="home-panel">
            <div className="home-panel__content">
              <h2 className="home-panel__title">{panel.title}</h2>
              <p className="home-panel__body">{panel.description}</p>
            </div>
            {panel.kind === "external" ? (
              <a href={panel.href} className="home-panel__action" target="_blank" rel="noreferrer">
                <span>{panel.linkLabel}</span>
                <span aria-hidden="true" className="home-panel__action-icon">
                  →
                </span>
              </a>
            ) : (
              <Link to={panel.to} className="home-panel__action">
                <span>{panel.linkLabel}</span>
                <span aria-hidden="true" className="home-panel__action-icon">
                  →
                </span>
              </Link>
            )}
          </article>
        ))}
      </section>

      <div className="home__map-preloader" aria-hidden="true">
        <ArcgisSketchMap geometry={undefined} onGeometryChange={noopGeometryChange} hideSketchWidget isVisible={false} />
      </div>
    </div>
  )
}
