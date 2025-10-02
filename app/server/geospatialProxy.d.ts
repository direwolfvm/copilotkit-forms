export declare class ProxyError extends Error {
  status?: number
  details?: unknown
  constructor(message: string, status?: number, details?: unknown)
}

export interface ProxyResult {
  data: unknown
  meta?: Record<string, unknown>
}

export declare function callNepassistProxy(payload?: unknown): Promise<ProxyResult>
export declare function callIpacProxy(payload?: unknown): Promise<ProxyResult>
