interface CopilotRuntimeConfig {
  publicApiKey?: string | null
  runtimeUrl?: string | null
}

declare global {
  interface Window {
    __COPILOTKIT_RUNTIME_CONFIG__?: CopilotRuntimeConfig
  }
}

function normalize(value: string | null | undefined) {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readRuntimeConfigFromWindow(): CopilotRuntimeConfig | undefined {
  if (typeof window === "undefined") {
    return undefined
  }

  return window.__COPILOTKIT_RUNTIME_CONFIG__ ?? undefined
}

export function getPublicApiKey(): string | undefined {
  return (
    normalize(import.meta.env.VITE_COPILOTKIT_PUBLIC_API_KEY) ??
    normalize(readRuntimeConfigFromWindow()?.publicApiKey ?? undefined)
  )
}

export function getRuntimeUrl(): string | undefined {
  return (
    normalize(import.meta.env.VITE_COPILOTKIT_RUNTIME_URL) ??
    normalize(readRuntimeConfigFromWindow()?.runtimeUrl ?? undefined)
  )
}
