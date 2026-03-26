import { useEffect } from "react"
import { supabase } from "@/utils/supabaseClient"
import { useSessionStore } from "@/stores/useSessionStore"

export function useAuthBootstrap() {
  const setSession = useSessionStore((s) => s.setSession)
  const setReady = useSessionStore((s) => s.setReady)
  const refreshRole = useSessionStore((s) => s.refreshRole)

  useEffect(() => {
    let isActive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!isActive) return
      setSession(data.session ?? null)
      refreshRole().finally(() => {
        if (!isActive) return
        setReady(true)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      refreshRole()
    })

    return () => {
      isActive = false
      sub.subscription.unsubscribe()
    }
  }, [refreshRole, setReady, setSession])
}

