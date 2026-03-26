import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { supabase } from "@/utils/supabaseClient"
import { useSessionStore } from "@/stores/useSessionStore"

export default function InviteAccept() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = useMemo(() => params.get("token")?.trim() ?? "", [params])
  const user = useSessionStore((s) => s.user)
  const isReady = useSessionStore((s) => s.isReady)
  const [status, setStatus] = useState<string>("Redeeming invite…")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return
    if (!user) {
      navigate(`/login?invite=${encodeURIComponent(token)}`, { replace: true })
      return
    }
    if (!token) {
      setError("Missing invite token")
      setStatus("")
      return
    }

    let isActive = true

    supabase
      .functions.invoke("redeem-invite", { body: { token } })
      .then(({ data, error: fnErr }) => {
        if (!isActive) return
        if (fnErr) throw fnErr
        const galleryId = (data as { galleryId?: string } | null)?.galleryId
        if (!galleryId) throw new Error("Invite redeem failed")
        navigate(`/g/${galleryId}`, { replace: true })
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : "Unable to redeem invite")
        setStatus("")
      })

    return () => {
      isActive = false
    }
  }, [isReady, navigate, token, user])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
          <div className="text-sm text-zinc-400">PhotoHost</div>
          <div className="mt-3 text-lg font-medium">Invite</div>
          {status && <div className="mt-4 text-sm text-zinc-200">{status}</div>}
          {error && <div className="mt-4 rounded-lg border border-red-900/60 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}
        </div>
      </div>
    </div>
  )
}

