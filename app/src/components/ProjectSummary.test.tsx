import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ProjectFormData } from '../schema/projectSchema'
import { ProjectSummary } from './ProjectSummary'

describe('ProjectSummary', () => {
  const baseData: ProjectFormData = {
    title: undefined,
    id: undefined,
    sector: undefined,
    lead_agency: undefined,
    participating_agencies: undefined,
    sponsor: undefined,
    location_text: undefined,
  }

  function renderSummary(overrides: Partial<ProjectFormData> = {}) {
    return render(<ProjectSummary data={{ ...baseData, ...overrides }} />)
  }

  it('renders placeholders when fields are missing', () => {
    renderSummary()
    const placeholders = screen.getAllByText('Not provided')
    expect(placeholders.length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Sponsor contact' })).not.toBeInTheDocument()
  })

  it('shows coordinate pair only when both values exist', () => {
    renderSummary({ location_lat: 45.1234, location_lon: -122.9876 })
    expect(screen.getByText('45.1234, -122.9876')).toBeInTheDocument()
  })

  it('falls back to the single available coordinate value when only one is provided', () => {
    renderSummary({ location_lat: 41.2, location_lon: undefined })
    expect(screen.getByText('41.2')).toBeInTheDocument()
  })

  it('renders sponsor contact details when provided', () => {
    renderSummary({
      sponsor_contact: {
        name: 'Alex Rivera',
        organization: 'Energy Department',
        email: 'alex.rivera@example.com',
        phone: '555-0100',
      },
    })

    expect(screen.getByRole('heading', { name: 'Sponsor contact' })).toBeInTheDocument()
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument()
    expect(screen.getByText('alex.rivera@example.com')).toBeInTheDocument()
  })

  it('includes formatted summary narrative text', () => {
    renderSummary({
      title: 'River Valley Transmission Line',
      id: 'PRJ-42',
      sector: 'Energy',
      description: 'Construct a 230 kV transmission line across two counties.',
      location_text: 'Lincoln County, Nebraska',
      lead_agency: 'DOE',
      participating_agencies: 'USACE',
      sponsor: 'River Valley Transmission LLC',
    })

    const summarySection = screen.getByLabelText('Project snapshot')
    const narrativeHeading = within(summarySection).getByRole('heading', { level: 3, name: 'Quick narrative' })
    const narrativeCard = narrativeHeading.parentElement

    expect(narrativeCard).not.toBeNull()
    expect(narrativeCard).toHaveTextContent('Title: River Valley Transmission Line')
    expect(narrativeCard).toHaveTextContent('Identifier: PRJ-42')
    expect(narrativeCard).toHaveTextContent('Sector: Energy')
    expect(narrativeCard).toHaveTextContent('Summary: Construct a 230 kV transmission line across two counties.')
  })
})
