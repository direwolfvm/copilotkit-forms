import { describe, expect, it } from 'vitest'
import { formatProjectSummary, type ProjectFormData } from './projectSchema'

describe('formatProjectSummary', () => {
  it('returns fallback message when no data is provided', () => {
    expect(formatProjectSummary({})).toBe('No project details captured yet.')
  })

  it('includes key project attributes in a consistent order', () => {
    const data: ProjectFormData = {
      title: 'River Valley Transmission Line',
      id: 'PRJ-42',
      sector: 'Energy',
      lead_agency: 'DOE',
      participating_agencies: 'USACE',
      sponsor: 'River Valley Transmission LLC',
      location_text: 'Lincoln County, Nebraska',
      location_lat: 45.1234,
      location_lon: -122.9876,
      description: 'Construct a 230 kV transmission line across two counties.',
    }

    const summary = formatProjectSummary(data).split('\n')
    expect(summary).toEqual([
      'Title: River Valley Transmission Line',
      'Identifier: PRJ-42',
      'Sector: Energy',
      'Lead agency: DOE',
      'Participating agencies: USACE',
      'Sponsor: River Valley Transmission LLC',
      'Location: Lincoln County, Nebraska',
      'Project centroid coordinates: 45.1234, -122.9876',
      'Summary: Construct a 230 kV transmission line across two counties.',
    ])
  })

  it('omits the coordinate line when latitude or longitude is missing', () => {
    const summaryLines = formatProjectSummary({
      title: 'River Valley Transmission Line',
      location_lat: 45.1234,
    }).split('\n')

    expect(summaryLines).not.toContainEqual(expect.stringMatching(/^Project centroid coordinates/))
  })
})
