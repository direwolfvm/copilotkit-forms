interface CopilotRuntimeConfig {
  publicApiKey?: string | null
  runtimeUrl?: string | null
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
  permitflowUrl?: string | null
  permitflowAnonKey?: string | null
  reviewworksUrl?: string | null
  reviewworksAnonKey?: string | null
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

const envVars = import.meta.env as Record<string, string | undefined>

export function getPublicApiKey(): string | undefined {
  return (
    normalize(envVars.VITE_COPILOTKIT_PUBLIC_API_KEY) ??
    normalize(readRuntimeConfigFromWindow()?.publicApiKey ?? undefined)
  )
}

export function getRuntimeUrl(): string | undefined {
  return (
    normalize(envVars.VITE_COPILOTKIT_RUNTIME_URL) ??
    normalize(readRuntimeConfigFromWindow()?.runtimeUrl ?? undefined)
  )
}

export function getSupabaseUrl(): string | undefined {
  return (
    normalize(envVars.VITE_SUPABASE_URL) ??
    normalize(envVars.NEXT_PUBLIC_SUPABASE_URL) ??
    normalize(readRuntimeConfigFromWindow()?.supabaseUrl ?? undefined)
  )
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    normalize(envVars.VITE_SUPABASE_ANON_KEY) ??
    normalize(envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    normalize(readRuntimeConfigFromWindow()?.supabaseAnonKey ?? undefined)
  )
}

export function getPermitflowUrl(): string | undefined {
  return (
    normalize(envVars.PERMITFLOW_SUPABASE_URL) ??
    normalize(envVars.NEXT_PUBLIC_PERMITFLOW_SUPABASE_URL) ??
    normalize(readRuntimeConfigFromWindow()?.permitflowUrl ?? undefined)
  )
}

export function getPermitflowAnonKey(): string | undefined {
  return (
    normalize(envVars.PERMITFLOW_SUPABASE_ANON_KEY) ??
    normalize(envVars.NEXT_PUBLIC_PERMITFLOW_SUPABASE_ANON_KEY) ??
    normalize(readRuntimeConfigFromWindow()?.permitflowAnonKey ?? undefined)
  )
}

export function getReviewworksUrl(): string | undefined {
  return (
    normalize(envVars.REVIEWWORKS_SUPABASE_URL) ??
    normalize(envVars.NEXT_PUBLIC_REVIEWWORKS_SUPABASE_URL) ??
    normalize(readRuntimeConfigFromWindow()?.reviewworksUrl ?? undefined)
  )
}

export function getReviewworksAnonKey(): string | undefined {
  return (
    normalize(envVars.REVIEWWORKS_SUPABASE_ANON_KEY) ??
    normalize(envVars.NEXT_PUBLIC_REVIEWWORKS_SUPABASE_ANON_KEY) ??
    normalize(readRuntimeConfigFromWindow()?.reviewworksAnonKey ?? undefined)
  )
}
