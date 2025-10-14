/// <reference types="vitest" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'
import { configDefaults } from 'vitest/config'

import { callIpacProxy, callNepassistProxy, ProxyError } from './server/geospatialProxy.js'
import {
  createSupabaseStorageUploader,
  StorageUploadError,
} from './server/storageProxy.js'

type ProxyHandler = (body: any) => Promise<unknown>

const BODY_LIMIT_BYTES = 1_000_000

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > BODY_LIMIT_BYTES) {
        reject(new ProxyError('Request body too large', 413))
      }
    })
    req.on('end', () => {
      if (!data) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(data))
      } catch (error) {
        reject(new ProxyError('Invalid JSON body', 400, error instanceof Error ? error.message : undefined))
      }
    })
    req.on('error', (error) => reject(error))
  })
}

function readBinaryBody(req: IncomingMessage, limitBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    req.on('data', (chunk: Buffer | string) => {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += bufferChunk.length

      if (total > limitBytes) {
        reject(new StorageUploadError('Request body too large', { status: 413 }))
        req.destroy()
        return
      }

      chunks.push(bufferChunk)
    })

    req.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    req.on('error', (error) => reject(error))
  })
}

function sendJson(res: ServerResponse, statusCode: number, payload: any) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function createProxyMiddleware(handler: ProxyHandler) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url) {
      next()
      return
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.end()
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    try {
      const body = await readJsonBody(req)
      const result = await handler(body ?? {})
      sendJson(res, 200, result)
    } catch (error: unknown) {
      if (error instanceof ProxyError) {
        sendJson(res, error.status ?? 500, { error: error.message, details: error.details ?? null })
        return
      }
      console.error('Geospatial proxy middleware error', error)
      sendJson(res, 500, { error: 'Unexpected server error' })
    }
  }
}

function attachGeospatialProxy(server: { middlewares: { use: (path: string, handler: any) => void } }) {
  server.middlewares.use('/api/geospatial/nepassist', createProxyMiddleware(callNepassistProxy))
  server.middlewares.use('/api/geospatial/ipac', createProxyMiddleware(callIpacProxy))
}

function createStorageProxyMiddleware() {
  const uploader = createSupabaseStorageUploader(process.env)
  const uploadLimit = uploader.maxUploadBytes

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url) {
      next()
      return
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.end()
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' })
      return
    }

    if (!uploader.isConfigured()) {
      sendJson(res, 500, { error: 'Supabase storage credentials are not configured' })
      return
    }

    let requestUrl: URL
    try {
      requestUrl = new URL(req.url, 'http://localhost')
    } catch {
      sendJson(res, 400, { error: 'Invalid upload request' })
      return
    }

    const bucket =
      requestUrl.searchParams.get('bucket') ?? requestUrl.searchParams.get('bucketName')
    const objectKey =
      requestUrl.searchParams.get('object') ??
      requestUrl.searchParams.get('key') ??
      requestUrl.searchParams.get('path')

    if (!bucket || !objectKey) {
      sendJson(res, 400, { error: 'Missing bucket or object key' })
      return
    }

    try {
      const body = await readBinaryBody(req, uploadLimit)
      const contentTypeHeader = req.headers['content-type']
      const contentType =
        typeof contentTypeHeader === 'string' && contentTypeHeader.trim().length > 0
          ? contentTypeHeader
          : undefined
      const result = await uploader.upload({
        bucket,
        objectKey,
        body,
        contentType,
      })

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ key: result?.key ?? objectKey }))
    } catch (error) {
      if (error instanceof StorageUploadError) {
        sendJson(res, error.status ?? 500, { error: error.message })
        return
      }

      console.error('Supabase storage proxy error', error)
      sendJson(res, 502, { error: 'Failed to upload document to Supabase storage' })
    }
  }
}

function attachStorageProxy(server: { middlewares: { use: (path: string, handler: any) => void } }) {
  server.middlewares.use('/api/storage/upload', createStorageProxyMiddleware())
}

const defaultBenchmarkExclude = (configDefaults as { benchmark?: { exclude?: string[] } }).benchmark?.exclude ?? []

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Use absolute paths during development for the Vite dev server, but
  // switch to relative paths in the production build so the app can be
  // hosted from a subdirectory (e.g. behind a Google Cloud Run service
  // that mounts the site on a non-root path).
  base: command === 'serve' ? '/' : './',
  plugins: [
    react(),
    {
      name: 'geospatial-proxy',
      configureServer(server) {
        attachStorageProxy(server)
        attachGeospatialProxy(server)
      },
      configurePreviewServer(server) {
        attachStorageProxy(server)
        attachGeospatialProxy(server)
      },
    },
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setupTests.ts',
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'src/**/*.bench.{ts,tsx}'],
    benchmark: {
      include: ['src/**/*.bench.{ts,tsx}'],
      exclude: defaultBenchmarkExclude,
    },
  },
}))
