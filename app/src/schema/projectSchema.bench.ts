import { bench } from 'vitest'
import { formatProjectSummary, type ProjectFormData } from './projectSchema'

const baseData: ProjectFormData = {
  title: 'River Valley Transmission Line',
  id: 'PRJ-42',
  sector: 'Energy',
  lead_agency: 'DOE',
  participating_agencies: 'USACE',
  sponsor: 'River Valley Transmission LLC',
  description:
    'Construct a 230 kV transmission line across two counties to improve grid reliability and integrate renewable resources.',
  location_text: 'Lincoln County, Nebraska',
  location_lat: 45.1234,
  location_lon: -122.9876,
}

bench('formatProjectSummary with representative dataset', () => {
  formatProjectSummary(baseData)
})

bench('formatProjectSummary with minimal data', () => {
  formatProjectSummary({ title: 'Minimal Project' })
})
