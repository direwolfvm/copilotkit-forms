export class StorageUploadError extends Error {
  constructor(message: string, options?: { status?: number })
  status?: number
}

type UploadInput = {
  bucket: string
  objectKey: string
  body?: unknown
  contentType?: string
}

type UploadResult = {
  key: string
}

type StorageUploader = {
  isConfigured: () => boolean
  endpoint: string
  region: string
  maxUploadBytes: number
  upload: (input: UploadInput) => Promise<UploadResult>
}

export function createSupabaseStorageUploader(
  env?: NodeJS.ProcessEnv
): StorageUploader

export const DEFAULT_SUPABASE_S3_ENDPOINT: string
export const DEFAULT_SUPABASE_S3_REGION: string
export const DEFAULT_STORAGE_UPLOAD_LIMIT_BYTES: number
