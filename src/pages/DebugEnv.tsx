import { useMemo, useState } from "react"

type Row = { label: string; value: string; status: "ok" | "warn" }

function maskKey(value: string) {
  const v = value.trim()
  if (!v) return "(empty)"
  if (v.length <= 10) return `${v.slice(0, 3)}…(${v.length})`
  return `${v.slice(0, 6)}…${v.slice(-4)} (${v.length})`
}

export default function DebugEnv() {
  const [copied, setCopied] = useState<string | null>(null)

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "")
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "")

  const parsedHost = useMemo(() => {
    try {
      return new URL(supabaseUrl).host
    } catch {
      return ""
    }
  }, [supabaseUrl])

  const rows: Row[] = [
    { label: "Build sha", value: __PH_BUILD_SHA__ || "(empty)", status: __PH_BUILD_SHA__ ? "ok" : "warn" },
    { label: "Build time", value: __PH_BUILD_TIME__ || "(empty)", status: __PH_BUILD_TIME__ ? "ok" : "warn" },
    { label: "VITE_SUPABASE_URL", value: supabaseUrl || "(empty)", status: supabaseUrl ? "ok" : "warn" },
    { label: "Supabase host", value: parsedHost || "(invalid URL)", status: parsedHost ? "ok" : "warn" },
    { label: "VITE_SUPABASE_ANON_KEY", value: maskKey(anonKey), status: anonKey ? "ok" : "warn" },
  ]

  async function copyJson() {
    const payload = {
      buildSha: __PH_BUILD_SHA__ || null,
      buildTime: __PH_BUILD_TIME__ || null,
      supabaseUrl: supabaseUrl || null,
      supabaseHost: parsedHost || null,
      anonKeyLength: anonKey ? anonKey.trim().length : 0,
      anonKeyPrefix: anonKey ? anonKey.trim().slice(0, 6) : null,
    }
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setCopied("Copied")
    window.setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
          <div className="text-sm font-medium">Debug</div>
          <div className="mt-1 text-xs text-zinc-500">Verifies build stamp and Vite env values (no secrets shown).</div>

          <div className="mt-6 space-y-3">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-4 rounded-lg border border-zinc-900 bg-zinc-950 px-4 py-3">
                <div className="text-sm text-zinc-300">{r.label}</div>
                <div className="text-right text-sm">
                  <div className={r.status === "ok" ? "text-zinc-100" : "text-amber-200"}>{r.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2">
            <button
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white"
              onClick={copyJson}
              type="button"
            >
              Copy debug JSON
            </button>
            {copied && <div className="text-sm text-zinc-400">{copied}</div>}
          </div>

          <div className="mt-6 text-xs text-zinc-500">
            If values are empty in production, add them in Vercel Environment Variables and redeploy.
          </div>
        </div>
      </div>
    </div>
  )
}
