import { createClient } from "@supabase/supabase-js"
import { getRequiredEnv } from "@/utils/env"

export const supabase = createClient(
  getRequiredEnv("VITE_SUPABASE_URL"),
  getRequiredEnv("VITE_SUPABASE_ANON_KEY"),
)

