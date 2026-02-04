import "./App.css"

export default function AboutPage() {
  return (
    <article className="app about-page">
      <div className="app__inner">
        <header className="about-page__header">
          <p className="about-page__eyebrow">About HelpPermit.me</p>
          <h1>Technology and permitting and environmental review</h1>
          <p>
            HelpPermit.me is a very unofficial demonstration platform that brings the <strong>Council on Environmental Quality (CEQ)</strong>
            {" "}
            Permitting Technology Action Plan to life (absolutely no connection to official CEQ, FYI).
          </p>
          <p>
            The site weaves together a React front end, a Supabase data layer, and Copilot-assisted workflows to show how an online portal might work, including project initiation and tracking through a pre-screening process. Visitors start by trying geospatial screening, starting a project on the portal, and tracking their projects in the dashboard.
            Every interaction reads or writes structured records that follow
            the CEQ schema, demonstrating how agencies can orchestrate intake, tracking, and analytics with standards-based systems and automated processing.
          </p>
          <p>
            It illustrates how modern permitting systems can be <strong>data-driven</strong>, <strong>interoperable</strong>, and <strong>transparent</strong> —showing how standards-based design can simplify complex review processes.
          </p>
        </header>

        <hr className="about-page__divider" />

        <section className="about-page__section" aria-labelledby="about-mission-heading">
          <h2 id="about-mission-heading">Mission</h2>
          <p>
            HelpPermit.me demonstrates how key elements of the <strong>Permitting Action Plan</strong> and its
            {" "}
            <strong>Service Delivery Standards</strong> can be realized through open, modular technology. By building directly on
            CEQ’s <strong>federal data standards</strong>, the platform showcases how agencies can modernize permitting without
            rebuilding from scratch.
          </p>
        </section>

        <hr className="about-page__divider" />

        <section className="about-page__section" aria-labelledby="about-standards-heading">
          <h2 id="about-standards-heading">Alignment with CEQ Service Delivery Standards</h2>
          <p className="about-page__lead">Each standard is mapped to specific capabilities inside the demo.</p>
          <div className="about-page__table-wrapper">
            <table>
              <caption className="visually-hidden">How HelpPermit.me implements CEQ service delivery standards</caption>
              <thead>
                <tr>
                  <th scope="col">CEQ Standard</th>
                  <th scope="col">Implementation in HelpPermit.me</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Business Process Modernization</th>
                  <td>Built entirely on CEQ data standards using a Supabase backend.</td>
                  <td>
                    Every data element (projects, processes, decisions, GIS layers) follows the federal permitting schema,
                    ensuring interoperability across systems.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Workflow Automation</th>
                  <td>Automated project and geospatial screening using rule-based criteria.</td>
                  <td>
                    Helps identify low-risk projects early and reduces manual review burdens through transparent decision
                    logic.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Digital-First Documents</th>
                  <td>Uses structured data packages rather than static documents.</td>
                  <td>
                    Demonstrates how documents can be generated dynamically from data, enabling traceability and machine-readability.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Reducing Timeline Uncertainty</th>
                  <td>Tracks process milestones through case events and displays progress visibly.</td>
                  <td>
                    Promotes predictability by letting users understand where they are in the process and what remains.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <hr className="about-page__divider" />

        <section className="about-page__section" aria-labelledby="about-requirements-heading">
          <h2 id="about-requirements-heading">Alignment with Minimum Functional Requirements</h2>
          <p className="about-page__lead">
            The CEQ Permitting Technology Action Plan identifies ten <strong>minimum functional requirements</strong> for modern
            systems. HelpPermit.me implements or demonstrates several of these, serving as a model for scalable adoption.
          </p>
          <div className="about-page__table-wrapper">
            <table>
              <caption className="visually-hidden">Status of CEQ minimum functional requirements in HelpPermit.me</caption>
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Implementation Status</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">1. Implement Data Standards</th>
                  <td>✅ Fully supported</td>
                  <td>The entire platform’s backend conforms to CEQ’s permitting and NEPA data standards.</td>
                </tr>
                <tr>
                  <th scope="row">2. Support Application Data Sharing</th>
                  <td>✅ Supported</td>
                  <td>
                    HelpPermit.me now includes explicit integrations with{" "}
                    <a href="https://reviewworks.app.cloud.gov/">ReviewWorks</a> and{" "}
                    <a href="https://permitflow.app.cloud.gov/">PermitFlow</a>, with shared project and case data exchanged across systems.
                  </td>
                </tr>
                <tr>
                  <th scope="row">3. Automated Project Screening</th>
                  <td>✅ Supported</td>
                  <td>Projects are evaluated automatically against defined decision criteria, including geospatial rules.</td>
                </tr>
                <tr>
                  <th scope="row">4. Transparent Decision Criteria</th>
                  <td>✅ Supported</td>
                  <td>The process model and decision elements are openly exposed on the Developer Tools page for transparency and reuse.</td>
                </tr>
                <tr>
                  <th scope="row">5. Case Management / Workflow</th>
                  <td>⚙️ Partial / Integrated</td>
                  <td>
                    Case management is supported through integrated demonstration systems,{" "}
                    <a href="https://reviewworks.app.cloud.gov/">ReviewWorks</a> and{" "}
                    <a href="https://permitflow.app.cloud.gov/">PermitFlow</a>, which receive and manage shared case data from HelpPermit.me.
                  </td>
                </tr>
                <tr>
                  <th scope="row">6. Integrated GIS Analysis</th>
                  <td>✅ Supported</td>
                  <td>Geospatial screening integrates directly with project data, allowing automated spatial checks and map visualization.</td>
                </tr>
                <tr>
                  <th scope="row">7. Document Management / Data-Driven Documents</th>
                  <td>⚙️ Partial</td>
                  <td>
                    The platform includes structured data packages illustrating a data-driven document model, but not full document storage.
                  </td>
                </tr>
                <tr>
                  <th scope="row">8. Public Comment Compilation / Analysis</th>
                  <td>❌ Not implemented</td>
                  <td>Comment processing and analysis are out of scope for this demonstration.</td>
                </tr>
                <tr>
                  <th scope="row">9. Administrative Record Management</th>
                  <td>❌ Not implemented</td>
                  <td>The system does not yet include administrative record compilation or retention tools.</td>
                </tr>
                <tr>
                  <th scope="row">10. Interoperable Agency Services</th>
                  <td>✅ Supported Architecturally</td>
                  <td>Built from the ground up with APIs and shared data standards to enable interagency interoperability.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <hr className="about-page__divider" />

        <section className="about-page__section" aria-labelledby="about-features-heading">
          <h2 id="about-features-heading">Key Features</h2>
          <ul className="about-page__list">
            <li>
              <strong>Standards-Based Architecture</strong> — Every component follows CEQ’s published permitting data standards,
              ensuring interoperability with future federal systems.
            </li>
            <li>
              <strong>API-Driven Platform</strong> — The Supabase backend exposes REST APIs for all entities, supporting flexible
              integration and data sharing across tools.
            </li>
            <li>
              <strong>Developer Tools Portal</strong> — Decision criteria and process models are accessible for developers and
              researchers, promoting transparency and reuse.
            </li>
            <li>
              <strong>Geospatial Screening</strong> — Integrated GIS capabilities allow automated location-based screening to
              identify potential environmental factors early.
            </li>
            <li>
              <strong>Automated Project Evaluation</strong> — Projects can be assessed against decision criteria to illustrate how
              digital pre-screening can reduce workload and timelines.
            </li>
            <li>
              <strong>Case Event Tracking</strong> — Demonstrates how systems can log and visualize project progress without a
              full workflow engine.
            </li>
            <li>
              <strong>AI-Ready Data Packages</strong> — Structured data supports the generation of AI-assisted analyses and
              data-driven document creation.
            </li>
          </ul>
        </section>

        <hr className="about-page__divider" />

        <section className="about-page__section" aria-labelledby="about-limitations-heading">
          <h2 id="about-limitations-heading">What’s Not Included (Yet)</h2>
          <p>
            HelpPermit.me is intentionally a lightweight demonstration, not a production case management system. It does
            <strong> not</strong> currently implement:
          </p>
          <ul className="about-page__list">
            <li>User authentication or role-based workflows</li>
            <li>Document management or official administrative records</li>
            <li>Public comment submission or analysis</li>
          </ul>
          <p>These are planned areas for future demonstration once core data and interoperability patterns mature.</p>
        </section>

        <hr className="about-page__divider" />

        <section className="about-page__section" aria-labelledby="about-importance-heading">
          <h2 id="about-importance-heading">Why This Matters</h2>
          <p>
            By showing a working prototype built directly on CEQ’s standards, HelpPermit.me provides a <strong>reference architecture</strong> for the next generation of permitting technology:
          </p>
          <ul className="about-page__list">
            <li>Demonstrates a modern, API-first approach</li>
            <li>Reduces duplication through data standardization</li>
            <li>Enables transparency and accountability in decision-making</li>
            <li>Provides a testbed for AI-assisted, data-driven permitting</li>
          </ul>
          <p>
            HelpPermit.me serves as both <strong>a teaching tool</strong> and <strong>a blueprint</strong>—proving that the CEQ vision can be implemented
            with open technology, reusable components, and modern design principles.
          </p>
        </section>

        <hr className="about-page__divider" />

        <section className="about-page__section" aria-labelledby="about-learn-more-heading">
          <h2 id="about-learn-more-heading">Learn More</h2>
          <p>
            This website is not associated with the CEQ, but learn more about the CEQ Permitting Technology Action Plan at{" "}
            <a href="https://permitting.innovation.gov/resources/action-plan/">permitting.innovation.gov</a>.
          </p>
        </section>
      </div>
    </article>
  )
}
