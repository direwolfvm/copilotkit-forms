export type GeospatialStatus = 'idle' | 'loading' | 'success' | 'error'

export interface NepassistSummaryItem {
  question: string
  displayAnswer: string
  severity: 'yes' | 'ondemand' | 'no' | 'other'
  category?: string
  rawAnswer?: string
}

export interface IpacWetlandSummary {
  name: string
  code?: string
  acres?: string
}

export interface IpacListedSpeciesSummary {
  commonName: string
  scientificName?: string
  group?: string
  status?: string
  speciesProfileUrl?: string
  criticalHabitat?: string
}

export interface IpacMigratoryBirdWeekSummary {
  weekId: number
  probability?: number
  surveyBarHeight?: number
  surveyYPosition?: number
  eventCount?: number
  noData?: boolean
}

export interface IpacMigratoryBirdSummary {
  commonName: string
  scientificName?: string
  status?: string
  speciesProfileUrl?: string
  breedingSeason?: string
  optionalBreedsFrom?: string
  optionalBreedsTo?: string
  weeklyData?: IpacMigratoryBirdWeekSummary[]
}

export interface IpacFacilitySummary {
  name: string
  type?: string
  acres?: string
  url?: string
}

export interface IpacCoastalBarrierSummary {
  nameOrCode: string
  type?: string
  fastAcres?: string
  wetAcres?: string
  shoreMiles?: string
}

export interface IpacSummary {
  locationDescription?: string
  listedSpecies: Array<string | IpacListedSpeciesSummary>
  criticalHabitats: string[]
  migratoryBirds: Array<string | IpacMigratoryBirdSummary>
  refuges?: IpacFacilitySummary[]
  fishHatcheries?: IpacFacilitySummary[]
  wetlands: IpacWetlandSummary[]
  coastalBarriers?: IpacCoastalBarrierSummary[]
}

export interface EnvironmentalMapSummary {
  url: string
  sourceUrl?: string
  title?: string
  latitude: number
  longitude: number
  bufferMiles: number
}

export interface GeospatialServiceState<TSummary = unknown> {
  status: GeospatialStatus
  summary?: TSummary
  raw?: unknown
  error?: string
  meta?: Record<string, unknown>
}

export interface GeospatialResultsState {
  environmentalMap?: GeospatialServiceState<EnvironmentalMapSummary>
  nepassist: GeospatialServiceState<NepassistSummaryItem[]>
  ipac: GeospatialServiceState<IpacSummary>
  lastRunAt?: string
  messages?: string[]
}

export interface PreparedGeospatialPayload {
  environmentalMap?: {
    latitude: number
    longitude: number
    bufferMiles: number
  }
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
