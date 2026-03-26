import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { supabase } from "@/utils/supabaseClient"

export default function CheckoutResult({ mode }: { mode: "success" | "cancel" }) {
  const [params] = useSearchParams()
  const galleryId = useMemo(() => params.get("galleryId") ?? "", [params])
  const [status, setStatus] = useState<string | null>(mode === "success" ? "Confirming payment…" : "Checkout canceled")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== "success") return
    if (!galleryId) return
    let isActive = true

    supabase
      .functions.invoke("sync-entitlement", { body: { galleryId } })
      .then(({ error }) => {
        if (!isActive) return
        if (error) throw error
        setStatus("Payment confirmed. Downloads are unlocked.")
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : "Unable to confirm payment")
        setStatus(null)
      })

    return () => {
      isActive = false
    }
  }, [galleryId, mode])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
          <div className="text-sm text-zinc-400">PhotoHost</div>
          <div className="mt-3 text-lg font-medium">{mode === "success" ? "Success" : "Canceled"}</div>
          {status && <div className="mt-4 text-sm text-zinc-200">{status}</div>}
          {error && <div className="mt-4 rounded-lg border border-red-900/60 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}

          <div className="mt-6 flex gap-2">
            <Link
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white"
              to={galleryId ? `/g/${galleryId}` : "/"}
            >
              Back to gallery
            </Link>
            <Link className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" to="/">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

