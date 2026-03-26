import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4"

export function getEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

export function createAnonAuthedClient(req: Request) {
  const url = getEnv("SUPABASE_URL")
  const anon = getEnv("SUPABASE_ANON_KEY")
  const auth = req.headers.get("Authorization") ?? ""
  return createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  })
}

export function createServiceClient() {
  const url = getEnv("SUPABASE_URL")
  const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, serviceRole)
}

