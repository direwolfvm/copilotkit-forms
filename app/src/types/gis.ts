export type GeometrySource = "draw" | "search" | "upload"

export type UploadedGisFile = {
  format: "kml" | "kmz" | "geojson"
  fileName: string
  fileSize: number
  fileType?: string
  base64Data: string
  lastModified?: number
}

export type GeometryChange = {
  geoJson?: string
  arcgisJson?: string
  latitude?: number
  longitude?: number
  source?: GeometrySource
  uploadedFile?: UploadedGisFile | null
}

export type ProjectGisUpload = {
  arcgisJson?: string
  geoJson?: string
  source?: GeometrySource
  uploadedFile?: UploadedGisFile | null
}
