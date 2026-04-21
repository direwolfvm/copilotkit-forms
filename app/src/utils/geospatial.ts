import type {
  EnvironmentalMapSummary,
  GeospatialResultsState,
  GeospatialServiceState,
  GeospatialStatus,
  IpacSummary,
  IpacWetlandSummary,
  NepassistSummaryItem,
  PreparedGeospatialPayload,
} from '../types/geospatial'

export const DEFAULT_BUFFER_MILES = 0.1
const ENVIRONMENTAL_MAP_MIN_BUFFER_MILES = 10

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

function haversineDistanceMiles([lonA, latA]: [number, number], [lonB, latB]: [number, number]): number {
  const radiusMiles = 3958.7613
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(latB - latA)
  const deltaLon = toRadians(lonB - lonA)
  const latARadians = toRadians(latA)
  const latBRadians = toRadians(latB)
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latARadians) * Math.cos(latBRadians) * Math.sin(deltaLon / 2) ** 2
  return radiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function averagePoint(points: Array<[number, number]>): [number, number] {
  const totals = points.reduce(
    (accumulator, [lon, lat]) => {
      accumulator.lon += lon
      accumulator.lat += lat
      return accumulator
    },
    { lon: 0, lat: 0 }
  )
  return [totals.lon / points.length, totals.lat / points.length]
}

function polygonCentroid(points: Array<[number, number]>): [number, number] {
  const ring = ensureClosedRing(points)
  let doubleArea = 0
  let centroidLon = 0
  let centroidLat = 0

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [lonA, latA] = ring[index]
    const [lonB, latB] = ring[index + 1]
    const cross = lonA * latB - lonB * latA
    doubleArea += cross
    centroidLon += (lonA + lonB) * cross
    centroidLat += (latA + latB) * cross
  }

  if (Math.abs(doubleArea) < 1e-12) {
    return averagePoint(points)
  }

  return [centroidLon / (3 * doubleArea), centroidLat / (3 * doubleArea)]
}

function buildEnvironmentalMapPayload(
  points: Array<[number, number]>,
  centroid: [number, number]
): PreparedGeospatialPayload['environmentalMap'] {
  const furthestPointMiles = points.reduce(
    (maxDistance, point) => Math.max(maxDistance, haversineDistanceMiles(centroid, point)),
    0
  )
  const bufferMiles = Math.max(ENVIRONMENTAL_MAP_MIN_BUFFER_MILES, furthestPointMiles + 10)
  return {
    longitude: Number(centroid[0].toFixed(6)),
    latitude: Number(centroid[1].toFixed(6)),
    bufferMiles: Number(bufferMiles.toFixed(2)),
  }
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
    result.environmentalMap = buildEnvironmentalMapPayload(pairs, polygonCentroid(pairs))
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
    result.environmentalMap = buildEnvironmentalMapPayload(pairs, averagePoint(pairs))
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
    result.environmentalMap = buildEnvironmentalMapPayload([pair], pair)
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

function findStartProjectUrl(value: unknown): string | undefined {
  if (!value) {
    return undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }
    return undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findStartProjectUrl(item)
      if (match) {
        return match
      }
    }
    return undefined
  }
  if (typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>
  const direct =
    record.startProjectURL ??
    record.startProjectUrl ??
    record.StartProjectURL ??
    record.returnURL ??
    record.ReturnURL
  if (direct !== undefined) {
    const directMatch = findStartProjectUrl(direct)
    if (directMatch) {
      return directMatch
    }
  }

  for (const nestedValue of Object.values(record)) {
    const match = findStartProjectUrl(nestedValue)
    if (match) {
      return match
    }
  }

  return undefined
}

export function extractIpacStartProjectUrl(data: unknown): string | undefined {
  return findStartProjectUrl(data)
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

function formatEnvironmentalMapSummary(summary: EnvironmentalMapSummary | undefined): string[] {
  if (!summary) {
    return ['No environmental map URL was returned.']
  }

  const lines = [
    summary.title ? `Map title: ${summary.title}` : 'Map generated.',
    `Center: ${summary.latitude}, ${summary.longitude}.`,
    `Buffer: ${summary.bufferMiles} miles.`,
    `URL: ${summary.url}`,
  ]
  if (summary.sourceUrl && summary.sourceUrl !== summary.url) {
    lines.push(`Source URL: ${summary.sourceUrl}`)
  }
  return lines
}

export function formatGeospatialResultsSummary(results: GeospatialResultsState | undefined | null): string {
  const safeResults: GeospatialResultsState = results ?? {
    nepassist: { status: 'idle' },
    ipac: { status: 'idle' },
    messages: []
  }

  const lines: string[] = []
  lines.push('Geospatial screening results:')

  const lastRun = formatDateTime(safeResults.lastRunAt)
  lines.push(`Last run: ${lastRun ?? 'not yet run'}`)

  if (safeResults.messages && safeResults.messages.length > 0) {
    lines.push('System messages:')
    for (const message of safeResults.messages) {
      lines.push(`- ${message}`)
    }
  }

  if (safeResults.environmentalMap) {
    const mapStatus = describeServiceStatus(safeResults.environmentalMap.status)
    lines.push(`Environmental map status: ${mapStatus}`)
    if (safeResults.environmentalMap.status === 'error' && safeResults.environmentalMap.error) {
      lines.push(`- Error: ${safeResults.environmentalMap.error}`)
    } else if (safeResults.environmentalMap.status === 'success') {
      for (const entry of formatEnvironmentalMapSummary(safeResults.environmentalMap.summary)) {
        lines.push(`- ${entry}`)
      }
    }
  }

  const nepaStatus = describeServiceStatus(safeResults.nepassist.status)
  lines.push(`NEPA Assist status: ${nepaStatus}`)
  if (safeResults.nepassist.status === 'error' && safeResults.nepassist.error) {
    lines.push(`- Error: ${safeResults.nepassist.error}`)
  } else if (safeResults.nepassist.status === 'success') {
    lines.push('- Findings:')
    for (const finding of formatNepassistSummary(safeResults.nepassist.summary)) {
      lines.push(`  - ${finding}`)
    }
  }

  const ipacStatus = describeServiceStatus(safeResults.ipac.status)
  lines.push(`IPaC status: ${ipacStatus}`)
  if (safeResults.ipac.status === 'error' && safeResults.ipac.error) {
    lines.push(`- Error: ${safeResults.ipac.error}`)
  } else if (safeResults.ipac.status === 'success') {
    lines.push('- Summary:')
    for (const entry of formatIpacSummary(safeResults.ipac.summary)) {
      lines.push(`  - ${entry}`)
    }
  }

  return lines.join('\n')
}

export function isServiceLoading<T>(service: GeospatialServiceState<T>): boolean {
  return service.status === 'loading'
}
