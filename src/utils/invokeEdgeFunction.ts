import { supabase } from "@/utils/supabaseClient"
import { getRequiredEnv } from "@/utils/env"
import { useSessionStore } from "@/stores/useSessionStore"

export async function invokeEdgeFunction<T>(name: string, body?: unknown) {
  const anonKey = getRequiredEnv("VITE_SUPABASE_ANON_KEY").trim()
  const storeSession = useSessionStore.getState().session
  const tokenFromStore = storeSession?.access_token
  const token = tokenFromStore ?? (await supabase.auth.getSession()).data.session?.access_token

  const headers: Record<string, string> = { apikey: anonKey }
  if (token) headers.Authorization = `Bearer ${token}`

  return supabase.functions.invoke<T>(name, { body, headers })
}
