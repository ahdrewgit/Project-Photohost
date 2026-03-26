import { create } from "zustand"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/utils/supabaseClient"

export type AppRole = "photographer" | "client" | null

type SessionState = {
  isReady: boolean
  session: Session | null
  user: User | null
  role: AppRole
  setSession: (session: Session | null) => void
  setReady: (ready: boolean) => void
  refreshRole: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  isReady: false,
  session: null,
  user: null,
  role: null,
  setSession: (session) => {
    set({
      session,
      user: session?.user ?? null,
      role: null,
    })
  },
  setReady: (ready) => set({ isReady: ready }),
  refreshRole: async () => {
    const user = get().user
    if (!user) {
      set({ role: null })
      return
    }

    const { data: photographerRow, error: photographerErr } = await supabase
      .from("photographer_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (photographerErr) {
      set({ role: null })
      return
    }

    if (photographerRow?.user_id) {
      set({ role: "photographer" })
      return
    }

    set({ role: "client" })
  },
}))

