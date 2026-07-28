import type { IncomingMessage, ServerResponse } from "http"

export declare function resolveSection106ExchangeUrl(): string
export declare function resolveSection106ApiKey(): string | undefined
export declare function createSection106ProxyMiddleware(): (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<void>
