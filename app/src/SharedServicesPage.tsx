import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { sharedServices, sharedServiceCategories } from "./utils/sharedServices"
import type { SharedServiceCategory } from "./utils/sharedServices"

export default function SharedServicesPage() {
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<SharedServiceCategory | "all">("all")

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim()
    return sharedServices.filter((svc) => {
      if (selectedCategory !== "all" && svc.category !== selectedCategory) {
        return false
      }
      if (!query) {
        return true
      }
      return (
        svc.systemName.toLowerCase().includes(query) ||
        svc.agencySystemOwner.toLowerCase().includes(query) ||
        svc.functionalityDescription.toLowerCase().includes(query)
      )
    })
  }, [search, selectedCategory])

  const grouped = useMemo(() => {
    const map = new Map<SharedServiceCategory, typeof filtered>()
    for (const svc of filtered) {
      const list = map.get(svc.category)
      if (list) {
        list.push(svc)
      } else {
        map.set(svc.category, [svc])
      }
    }
    return map
  }, [filtered])

  return (
    <div className="shared-services-page">
      <header className="shared-services-page__header">
        <Link to="/resources" className="shared-services-page__back">
          &larr; Back to Resources
        </Link>
        <h1>Shared Services</h1>
        <p>
          Federal shared services and tools that support environmental review and permitting across
          agencies, organized by functional category.
        </p>
      </header>

      <div className="shared-services-page__filters">
        <input
          type="search"
          className="shared-services-page__search"
          placeholder="Search by name, agency, or description\u2026"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="shared-services-page__category-select"
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value as SharedServiceCategory | "all")}
        >
          <option value="all">All categories</option>
          {sharedServiceCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <p className="shared-services-page__count">
        {filtered.length} {filtered.length === 1 ? "service" : "services"} found
      </p>

      {sharedServiceCategories.map((cat) => {
        const items = grouped.get(cat)
        if (!items || items.length === 0) {
          return null
        }
        return (
          <section key={cat} className="shared-services-page__group">
            <h2 className="shared-services-page__group-title">{cat}</h2>
            <div className="shared-services-page__cards">
              {items.map((svc) => (
                <article key={svc.systemName} className="shared-services-card">
                  <h3 className="shared-services-card__name">{svc.systemName}</h3>
                  <span className="shared-services-card__agency">{svc.agencySystemOwner}</span>
                  {svc.users ? (
                    <span className="shared-services-card__users">Users: {svc.users}</span>
                  ) : null}
                  <p className="shared-services-card__description">{svc.functionalityDescription}</p>
                </article>
              ))}
            </div>
          </section>
        )
      })}

      {filtered.length === 0 ? (
        <p className="shared-services-page__empty">
          No shared services match the current filters.
        </p>
      ) : null}
    </div>
  )
}
