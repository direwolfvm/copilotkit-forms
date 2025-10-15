import { describe, expect, it } from 'vitest'

import { prepareGeospatialPayload, formatGeospatialResultsSummary } from './geospatial'
import type { GeospatialResultsState } from '../types/geospatial'

describe('prepareGeospatialPayload', () => {
  it('extracts polygon coordinates and builds WKT for IPaC', () => {
    const polygonGeometry = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [-77.03, 38.9],
          [-77.02, 38.91],
          [-77.01, 38.92]
        ]
      ]
    })

    const result = prepareGeospatialPayload(polygonGeometry)

    expect(result.errors).toEqual([])
    expect(result.nepassist).toEqual({
      coords: [
        [-77.03, 38.9],
        [-77.02, 38.91],
        [-77.01, 38.92]
      ],
      coordsString: '-77.03,38.9,-77.02,38.91,-77.01,38.92',
      type: 'polygon'
    })
    expect(result.ipac).toEqual({
      wkt: 'POLYGON((-77.03 38.9, -77.02 38.91, -77.01 38.92, -77.03 38.9))',
      geometryType: 'polygon'
    })
  })

  it('returns an error when the geometry cannot be parsed', () => {
    const result = prepareGeospatialPayload('not-json')

    expect(result.errors).toContain('The stored geometry is not valid JSON.')
    expect(result.nepassist).toBeUndefined()
    expect(result.ipac).toBeUndefined()
  })

  it('warns when only a point geometry is available', () => {
    const pointGeometry = JSON.stringify({
      type: 'Point',
      coordinates: [-77.04, 38.91]
    })

    const result = prepareGeospatialPayload(pointGeometry)

    expect(result.errors).toContain(
      'IPaC only supports polygon or line geometries. Draw a line or polygon to include IPaC results.'
    )
    expect(result.nepassist).toEqual({
      coords: [[-77.04, 38.91]],
      coordsString: '-77.04,38.91',
      type: 'point'
    })
    expect(result.ipac).toBeUndefined()
  })
})

describe('formatGeospatialResultsSummary', () => {
  it('summarizes messages and findings for Copilot', () => {
    const results: GeospatialResultsState = {
      nepassist: {
        status: 'success',
        summary: [
          { question: 'Floodplains', displayAnswer: '⚠️ Yes', severity: 'yes' },
          { question: 'Section 4(f) resources', displayAnswer: '✅ No', severity: 'no' }
        ]
      },
      ipac: {
        status: 'success',
        summary: {
          locationDescription: 'Project corridor',
          listedSpecies: ['Bald eagle (Threatened)'],
          criticalHabitats: ['Habitat A'],
          migratoryBirds: [],
          wetlands: [{ name: 'Wetland 12', acres: '2' }]
        }
      },
      lastRunAt: undefined,
      messages: ['Latest run succeeded']
    }

    const summary = formatGeospatialResultsSummary(results)

    expect(summary).toContain('Geospatial screening results:')
    expect(summary).toContain('Last run: not yet run')
    expect(summary).toContain('- Latest run succeeded')
    expect(summary).toContain('NEPA Assist status: success')
    expect(summary).toContain('  - ⚠️ Yes: Floodplains')
    expect(summary).toContain('IPaC status: success')
    expect(summary).toContain('  - Location: Project corridor')
    expect(summary).toContain('  - Listed species: Bald eagle (Threatened)')
    expect(summary).toContain('  - Critical habitats: Habitat A')
    expect(summary).toContain('  - Wetlands: Wetland 12 (2 acres)')
  })
})
