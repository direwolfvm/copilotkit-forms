import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const DEFAULT_SUPABASE_S3_ENDPOINT =
  "https://yiggjfcwpagbupsmueax.storage.supabase.co/storage/v1/s3"
const DEFAULT_SUPABASE_S3_REGION = "us-east-1"
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export class StorageUploadError extends Error {
  constructor(message, options = {}) {
    super(message, options)
    this.name = "StorageUploadError"
    this.status = options.status
  }
}

function normalizeEnvValue(value) {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseCompositeKey(value) {
  if (!value) {
    return undefined
  }

  const colonIndex = value.indexOf(":")
  if (colonIndex > 0) {
    const accessKeyId = value.slice(0, colonIndex).trim()
    const secretAccessKey = value.slice(colonIndex + 1).trim()
    if (accessKeyId && secretAccessKey) {
      return { accessKeyId, secretAccessKey }
    }
  }

  try {
    const decoded = Buffer.from(value, "base64").toString("utf-8")
    if (decoded && decoded !== value) {
      const parsed = parseCompositeKey(decoded)
      if (parsed) {
        return parsed
      }
    }
  } catch {
    // Ignore base64 parsing errors.
  }

  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === "object") {
      const accessKeyId =
        typeof parsed.accessKeyId === "string"
          ? parsed.accessKeyId
          : typeof parsed.keyId === "string"
          ? parsed.keyId
          : typeof parsed.key === "string"
          ? parsed.key
          : undefined
      const secretAccessKey =
        typeof parsed.secretAccessKey === "string"
          ? parsed.secretAccessKey
          : typeof parsed.secretKey === "string"
          ? parsed.secretKey
          : typeof parsed.secret === "string"
          ? parsed.secret
          : undefined
      if (accessKeyId && secretAccessKey) {
        return { accessKeyId, secretAccessKey }
      }
    }
  } catch {
    // Ignore JSON parsing errors.
  }

  return undefined
}

function parseSupabaseS3Credentials(env) {
  const directAccessKeyId =
    normalizeEnvValue(env.SUPABASE_S3_ACCESS_KEY_ID) ??
    normalizeEnvValue(env.SUPABASE_S3_KEY_ID)
  const directSecret =
    normalizeEnvValue(env.SUPABASE_S3_SECRET_ACCESS_KEY) ??
    normalizeEnvValue(env.SUPABASE_S3_SECRET_KEY) ??
    normalizeEnvValue(env.SUPABASE_S3_SECRET)

  if (directAccessKeyId && directSecret) {
    return { accessKeyId: directAccessKeyId, secretAccessKey: directSecret }
  }

  const composite = normalizeEnvValue(env.SUPABASE_S3_KEY)
  if (composite) {
    const parsed = parseCompositeKey(composite)
    if (parsed) {
      return parsed
    }
  }

  return undefined
}

function parseUploadLimit(env) {
  const rawLimit =
    normalizeEnvValue(env.SUPABASE_S3_MAX_UPLOAD_BYTES) ??
    normalizeEnvValue(env.SUPABASE_STORAGE_MAX_UPLOAD_BYTES) ??
    normalizeEnvValue(env.SUPPORTING_DOCUMENT_MAX_UPLOAD_BYTES)

  if (!rawLimit) {
    return DEFAULT_MAX_UPLOAD_BYTES
  }

  const parsed = Number.parseInt(rawLimit, 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }

  return DEFAULT_MAX_UPLOAD_BYTES
}

function toUint8Array(body) {
  if (!body) {
    return undefined
  }

  if (body instanceof Uint8Array) {
    return body
  }

  if (typeof body === "string") {
    return Buffer.from(body)
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body)
  }

  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  }

  if (Buffer.isBuffer(body)) {
    return body
  }

  return undefined
}

export function createSupabaseStorageUploader(env = process.env) {
  const endpoint =
    normalizeEnvValue(env.SUPABASE_S3_ENDPOINT) ?? DEFAULT_SUPABASE_S3_ENDPOINT
  const region =
    normalizeEnvValue(env.SUPABASE_S3_REGION) ?? DEFAULT_SUPABASE_S3_REGION
  const credentials = parseSupabaseS3Credentials(env)
  const maxUploadBytes = parseUploadLimit(env)

  if (!credentials) {
    return {
      isConfigured: () => false,
      endpoint,
      region,
      maxUploadBytes,
      async upload() {
        throw new StorageUploadError(
          "Supabase storage credentials are not configured.",
          { status: 500 }
        )
      }
    }
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials
  })

  return {
    isConfigured: () => true,
    endpoint,
    region,
    maxUploadBytes,
    async upload({ bucket, objectKey, body, contentType }) {
      if (!bucket) {
        throw new StorageUploadError("Storage bucket is required.", {
          status: 400
        })
      }

      if (!objectKey) {
        throw new StorageUploadError("Storage object key is required.", {
          status: 400
        })
      }

      const payload = toUint8Array(body)
      if (!payload || payload.byteLength === 0) {
        throw new StorageUploadError("Storage payload is empty.", {
          status: 400
        })
      }

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: payload,
        ContentType: contentType ?? undefined
      })

      await client.send(command)

      return { key: objectKey }
    }
  }
}

export {
  DEFAULT_SUPABASE_S3_ENDPOINT,
  DEFAULT_SUPABASE_S3_REGION,
  DEFAULT_MAX_UPLOAD_BYTES as DEFAULT_STORAGE_UPLOAD_LIMIT_BYTES
}
