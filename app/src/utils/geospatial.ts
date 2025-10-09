import type {
  GeospatialResultsState,
  GeospatialServiceState,
  GeospatialStatus,
  IpacSummary,
  IpacWetlandSummary,
  NepassistSummaryItem,
  PreparedGeospatialPayload,
} from '../types/geospatial'

export const DEFAULT_BUFFER_MILES = 0.1

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeCoordinatePair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined
  }
  const lon = Number(value[0])
  const lat = Number(value[1])
  if (Number.isNaN(lon) || Number.isNaN(lat)) {
    return undefined
  }
  return [lon, lat]
}

function ensureClosedRing(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length === 0) {
    return points
  }
  const [firstLon, firstLat] = points[0]
  const [lastLon, lastLat] = points[points.length - 1]
  if (firstLon === lastLon && firstLat === lastLat) {
    return points
  }
  return [...points, [firstLon, firstLat]]
}

function flattenCoordinatePairs(pairs: Array<[number, number]>): string {
  return pairs.flatMap((pair) => pair).join(',')
}

function buildPolygonWkt(points: Array<[number, number]>): string {
  const closed = ensureClosedRing(points)
  const segments = closed.map(([lon, lat]) => `${lon} ${lat}`)
  return `POLYGON((${segments.join(', ')}))`
}

function buildLineWkt(points: Array<[number, number]>): string {
  const segments = points.map(([lon, lat]) => `${lon} ${lat}`)
  return `LINESTRING(${segments.join(', ')})`
}

export function prepareGeospatialPayload(geometryJson?: string | null): PreparedGeospatialPayload {
  const result: PreparedGeospatialPayload = { errors: [] }

  if (!geometryJson) {
    result.errors.push('No geometry is available. Draw a project footprint to run the geospatial screen.')
    return result
  }

  let geometry: any
  try {
    geometry = JSON.parse(geometryJson)
  } catch {
    result.errors.push('The stored geometry is not valid JSON.')
    return result
  }

  if (!geometry || typeof geometry !== 'object') {
    result.errors.push('The stored geometry is not a valid GeoJSON object.')
    return result
  }

  const geoType = typeof geometry.type === 'string' ? geometry.type : ''

  if (!geoType) {
    result.errors.push('The geometry does not include a GeoJSON type.')
    return result
  }

  const loweredType = geoType.toLowerCase()

  if (loweredType === 'polygon' || loweredType === 'multipolygon') {
    if (!Array.isArray(geometry.coordinates)) {
      result.errors.push('Polygon geometry is missing coordinate rings.')
      return result
    }
    const coordinatesSource = geometry.coordinates as unknown[]
    const firstEntry = coordinatesSource[0]
    const primaryRingCandidate =
      loweredType === 'polygon'
        ? firstEntry
        : Array.isArray(firstEntry)
          ? firstEntry[0]
          : undefined
    if (!Array.isArray(primaryRingCandidate)) {
      result.errors.push('Polygon geometry is missing coordinate rings.')
      return result
    }
    const pairs: Array<[number, number]> = []
    for (const candidate of primaryRingCandidate) {
      const pair = normalizeCoordinatePair(candidate)
      if (pair) {
        pairs.push(pair)
      }
    }
    if (pairs.length < 3) {
      result.errors.push('Polygon geometry requires at least three coordinate pairs.')
      return result
    }
    result.nepassist = {
      coords: pairs,
      coordsString: flattenCoordinatePairs(pairs),
      type: 'polygon',
    }
    result.ipac = {
      wkt: buildPolygonWkt(pairs),
      geometryType: 'polygon',
    }
    return result
  }

  if (loweredType === 'linestring' || loweredType === 'multilinestring') {
    if (!Array.isArray(geometry.coordinates)) {
      result.errors.push('Line geometry is missing coordinate paths.')
      return result
    }
    const coordinatesSource = geometry.coordinates as unknown[]
    const primaryPathCandidate =
      loweredType === 'linestring'
        ? coordinatesSource
        : Array.isArray(coordinatesSource[0])
          ? coordinatesSource[0]
          : undefined
    if (!Array.isArray(primaryPathCandidate)) {
      result.errors.push('Line geometry is missing coordinate paths.')
      return result
    }
    const pairs: Array<[number, number]> = []
    for (const candidate of primaryPathCandidate) {
      const pair = normalizeCoordinatePair(candidate)
      if (pair) {
        pairs.push(pair)
      }
    }
    if (pairs.length < 2) {
      result.errors.push('Line geometry requires at least two coordinate pairs.')
      return result
    }
    result.nepassist = {
      coords: pairs,
      coordsString: flattenCoordinatePairs(pairs),
      type: 'polyline',
    }
    result.ipac = {
      wkt: buildLineWkt(pairs),
      geometryType: 'polyline',
    }
    return result
  }

  if (loweredType === 'point') {
    const pair = normalizeCoordinatePair(geometry.coordinates)
    if (!pair) {
      result.errors.push('Point geometry is missing longitude/latitude coordinates.')
      return result
    }
    result.nepassist = {
      coords: [pair],
      coordsString: flattenCoordinatePairs([pair]),
      type: 'point',
    }
    result.errors.push('IPaC only supports polygon or line geometries. Draw a line or polygon to include IPaC results.')
    return result
  }

  result.errors.push(`Unsupported geometry type "${geometry.type ?? 'unknown'}".`)
  return result
}

const NEPA_RANK: Record<string, number> = { yes: 0, ondemand: 1, no: 2, other: 3 }
const NEPA_DISPLAY: Record<string, string> = {
  yes: '⚠️ Yes',
  ondemand: '⏳ On demand',
  no: '✅ No',
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null) as T[]
  }
  if (value === undefined || value === null) {
    return []
  }
  return [value]
}

function extractReport(data: any): any {
  if (!data || typeof data !== 'object') {
    return undefined
  }
  if (data.nepareport?.body) {
    return data.nepareport.body
  }
  if (data.nepareport) {
    return data.nepareport
  }
  if (data.body) {
    return data.body
  }
  if (data.report) {
    return data.report
  }
  if (data.CategoryFolder) {
    return data
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === 'object' && 'CategoryFolder' in value) {
      return value
    }
  }
  return undefined
}

function normalizeAnswer(value: unknown): string {
  return String(value ?? '').trim()
}

export function summarizeNepassist(data: unknown): NepassistSummaryItem[] {
  const report = extractReport(data)
  if (!report) {
    return []
  }
  const categoryFolder = report.CategoryFolder ?? report
  const categories = toArray(categoryFolder?.Category)
  const items: NepassistSummaryItem[] = []
  for (const category of categories) {
    const questions = toArray(category?.Question ?? category?.question)
    for (const question of questions) {
      const questionText =
        question?.questionText || question?.QuestionText || question?.question || question?.text || ''
      const rawAnswer = normalizeAnswer(question?.answer ?? question?.Answer ?? question?.result)
      const severityKey = (rawAnswer.toLowerCase() as 'yes' | 'ondemand' | 'no')
      const severity = severityKey in NEPA_RANK ? severityKey : 'other'
      const displayAnswer = NEPA_DISPLAY[severity] ?? (rawAnswer || 'Not provided')
      items.push({
        question: String(questionText || 'Unnamed question'),
        displayAnswer,
        severity,
      })
    }
  }
  items.sort((a, b) => NEPA_RANK[a.severity] - NEPA_RANK[b.severity])
  return items
}

function pushUnique(target: string[], value: unknown) {
  if (!value && value !== 0) {
    return
  }
  const stringValue = String(value)
  if (!stringValue) {
    return
  }
  if (!target.includes(stringValue)) {
    target.push(stringValue)
  }
}

function formatAcres(value: unknown): string | undefined {
  if (isNumber(value)) {
    return value.toFixed(1)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return undefined
}

export function summarizeIpac(data: unknown): IpacSummary {
  const summary: IpacSummary = {
    locationDescription: undefined,
    listedSpecies: [],
    criticalHabitats: [],
    migratoryBirds: [],
    wetlands: [],
  }

  if (!data || typeof data !== 'object') {
    return summary
  }

  const root: any = data
  const body = root.ipac_report?.body ?? root.body ?? root.resources ?? root
  const resources = body?.resources ?? body ?? {}

  const location = resources.location ?? {}
  summary.locationDescription =
    location.description ?? location.locationDescription ?? location.name ?? location.LocationDescription ?? undefined

  const populations = resources.populationsBySid ?? {}
  for (const entry of Object.values(populations as Record<string, unknown>)) {
    const entryValue: any = entry as any
    const popData: any = entryValue?.population ?? entryValue
    const name =
      popData?.optionalCommonName ||
      popData?.commonName ||
      popData?.scientificName ||
      popData?.name ||
      undefined
    const status = popData?.listingStatusName || popData?.status || popData?.statusName || ''
    if (name) {
      const label = status ? `${name} (${status})` : String(name)
      pushUnique(summary.listedSpecies, label)
    }
  }

  const criticalHabitats = resources.crithabs ?? []
  for (const habitat of Array.isArray(criticalHabitats) ? criticalHabitats : []) {
    const name =
      habitat?.criticalHabitatName ||
      habitat?.commonName ||
      habitat?.scientificName ||
      habitat?.name ||
      undefined
    if (name) {
      pushUnique(summary.criticalHabitats, name)
    }
  }

  const migratory = resources.migbirds ?? []
  const migratoryList = Array.isArray(migratory) ? migratory : []
  for (const item of migratoryList) {
    const birdName = item?.phenologySpecies?.commonName || item?.commonName || item?.name || undefined
    if (birdName) {
      pushUnique(summary.migratoryBirds, birdName)
    }
  }

  const wetlands = resources.wetlands
  let wetlandItems: any[] = []
  if (Array.isArray(wetlands)) {
    wetlandItems = wetlands
  } else if (wetlands?.items && Array.isArray(wetlands.items)) {
    wetlandItems = wetlands.items
  }
  for (const wetland of wetlandItems) {
    const wetlandName = wetland?.wetlandType || wetland?.name || wetland?.wetland || undefined
    const acres = formatAcres(wetland?.acres ?? wetland?.wetlandAcres)
    if (wetlandName) {
      const entry: IpacWetlandSummary = { name: String(wetlandName) }
      if (acres) {
        entry.acres = acres
      }
      summary.wetlands.push(entry)
    }
  }

  return summary
}

function formatDateTime(timestamp?: string): string | undefined {
  if (!timestamp) {
    return undefined
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

function describeServiceStatus(status: GeospatialStatus): string {
  switch (status) {
    case 'idle':
      return 'not started'
    case 'loading':
      return 'in progress'
    case 'error':
      return 'error'
    case 'success':
      return 'success'
    default:
      return status
  }
}

function formatNepassistSummary(items: NepassistSummaryItem[] | undefined): string[] {
  if (!items || items.length === 0) {
    return ['No findings were returned.']
  }

  const highlights: string[] = []
  const secondary: string[] = []

  for (const item of items) {
    const line = `${item.displayAnswer}: ${item.question}`
    if (item.severity === 'yes' || item.severity === 'ondemand') {
      highlights.push(line)
    } else {
      secondary.push(line)
    }
  }

  const ordered = [...highlights, ...secondary]
  const MAX_ITEMS = 8
  if (ordered.length > MAX_ITEMS) {
    return [...ordered.slice(0, MAX_ITEMS), `…and ${ordered.length - MAX_ITEMS} additional findings.`]
  }

  return ordered
}

function formatIpacSummary(summary: IpacSummary | undefined): string[] {
  if (!summary) {
    return ['No summary details were returned.']
  }

  const lines: string[] = []
  if (summary.locationDescription) {
    lines.push(`Location: ${summary.locationDescription}`)
  }
  if (summary.listedSpecies.length > 0) {
    lines.push(`Listed species: ${summary.listedSpecies.join('; ')}`)
  }
  if (summary.criticalHabitats.length > 0) {
    lines.push(`Critical habitats: ${summary.criticalHabitats.join('; ')}`)
  }
  if (summary.migratoryBirds.length > 0) {
    lines.push(`Migratory birds: ${summary.migratoryBirds.join('; ')}`)
  }
  if (summary.wetlands.length > 0) {
    const wetlands = summary.wetlands.map((wetland) =>
      wetland.acres ? `${wetland.name} (${wetland.acres} acres)` : wetland.name
    )
    lines.push(`Wetlands: ${wetlands.join('; ')}`)
  }

  if (lines.length === 0) {
    lines.push('No notable findings were returned.')
  }

  return lines
}

export function formatGeospatialResultsSummary(results: GeospatialResultsState): string {
  const lines: string[] = []
  lines.push('Geospatial screening results:')

  const lastRun = formatDateTime(results.lastRunAt)
  lines.push(`Last run: ${lastRun ?? 'not yet run'}`)

  if (results.messages && results.messages.length > 0) {
    lines.push('System messages:')
    for (const message of results.messages) {
      lines.push(`- ${message}`)
    }
  }

  const nepaStatus = describeServiceStatus(results.nepassist.status)
  lines.push(`NEPA Assist status: ${nepaStatus}`)
  if (results.nepassist.status === 'error' && results.nepassist.error) {
    lines.push(`- Error: ${results.nepassist.error}`)
  } else if (results.nepassist.status === 'success') {
    lines.push('- Findings:')
    for (const finding of formatNepassistSummary(results.nepassist.summary)) {
      lines.push(`  - ${finding}`)
    }
  }

  const ipacStatus = describeServiceStatus(results.ipac.status)
  lines.push(`IPaC status: ${ipacStatus}`)
  if (results.ipac.status === 'error' && results.ipac.error) {
    lines.push(`- Error: ${results.ipac.error}`)
  } else if (results.ipac.status === 'success') {
    lines.push('- Summary:')
    for (const entry of formatIpacSummary(results.ipac.summary)) {
      lines.push(`  - ${entry}`)
    }
  }

  return lines.join('\n')
}

export function isServiceLoading<T>(service: GeospatialServiceState<T>): boolean {
  return service.status === 'loading'
}
