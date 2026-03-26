import { supabase } from "@/utils/supabaseClient"
import { getRequiredEnv } from "@/utils/env"

export async function invokeEdgeFunction<T>(name: string, body?: unknown) {
  const anonKey = getRequiredEnv("VITE_SUPABASE_ANON_KEY").trim()
  const { data } = await supabase.auth.getSession()

  const headers: Record<string, string> = { apikey: anonKey }
  const token = data.session?.access_token
  if (token) headers.Authorization = `Bearer ${token}`

  return supabase.functions.invoke<T>(name, { body, headers })
}
