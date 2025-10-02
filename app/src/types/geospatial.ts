export type GeospatialStatus = 'idle' | 'loading' | 'success' | 'error'

export interface NepassistSummaryItem {
  question: string
  displayAnswer: string
  severity: 'yes' | 'ondemand' | 'no' | 'other'
}

export interface IpacWetlandSummary {
  name: string
  acres?: string
}

export interface IpacSummary {
  locationDescription?: string
  listedSpecies: string[]
  criticalHabitats: string[]
  migratoryBirds: string[]
  wetlands: IpacWetlandSummary[]
}

export interface GeospatialServiceState<TSummary = unknown> {
  status: GeospatialStatus
  summary?: TSummary
  raw?: unknown
  error?: string
  meta?: Record<string, unknown>
}

export interface GeospatialResultsState {
  nepassist: GeospatialServiceState<NepassistSummaryItem[]>
  ipac: GeospatialServiceState<IpacSummary>
  lastRunAt?: string
  messages?: string[]
}

export interface PreparedGeospatialPayload {
  nepassist?: {
    coords: Array<[number, number]>
    coordsString: string
    type: 'polygon' | 'polyline' | 'point'
  }
  ipac?: {
    wkt: string
    geometryType: 'polygon' | 'polyline'
  }
  errors: string[]
}
