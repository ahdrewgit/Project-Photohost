import { getRequiredEnv } from "@/utils/env"
import { useSessionStore } from "@/stores/useSessionStore"

type InvokeResult<T> = { data: T | null; error: null | { message: string; context?: { status?: number; body?: unknown } } }

function isDebugEnabled() {
  try {
    return localStorage.getItem("photohost_debug") === "1" || new URLSearchParams(window.location.search).get("debug") === "1"
  } catch {
    return false
  }
}

export async function invokeEdgeFunction<T>(name: string, body?: unknown): Promise<InvokeResult<T>> {
  const supabaseUrl = getRequiredEnv("VITE_SUPABASE_URL").trim().replace(/\/+$/, "")
  const anonKey = getRequiredEnv("VITE_SUPABASE_ANON_KEY").trim()
  const storeSession = useSessionStore.getState().session
  const token = storeSession?.access_token || anonKey

  if (isDebugEnabled()) {
    const safe = {
      fn: name,
      supabaseHost: (() => {
        try {
          return new URL(supabaseUrl).host
        } catch {
          return "(invalid url)"
        }
      })(),
      apikeyPrefix: anonKey ? anonKey.slice(0, 6) : "(empty)",
      apikeyLen: anonKey.length,
      authPrefix: token ? token.slice(0, 12) : "(empty)",
      authLen: token.length,
    }
    console.info("[PhotoHost] invokeEdgeFunction", safe)
  }

  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Network error" } }
  }

  const contentType = res.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")
  const parsedBody = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)

  if (!res.ok) {
    const message = "Edge Function returned a non-2xx status code"
    return { data: null, error: { message, context: { status: res.status, body: parsedBody } } }
  }

  return { data: (parsedBody as T) ?? null, error: null }
}
