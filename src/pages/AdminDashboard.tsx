import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "@/utils/supabaseClient"
import { useSessionStore } from "@/stores/useSessionStore"

type GalleryRow = {
  id: string
  title: string
  status: string
  created_at: string
  published_at: string | null
  favorite_limit: number | null
  downloads_locked: boolean
  price_cents: number
  currency: string
}

function formatDate(value: string) {
  const d = new Date(value)
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(d)
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<GalleryRow[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [price, setPrice] = useState("")
  const [favoriteLimit, setFavoriteLimit] = useState("20")
  const [downloadsLocked, setDownloadsLocked] = useState(true)

  const currency = "usd"

  const canCreate = useMemo(() => title.trim().length > 0, [title])

  useEffect(() => {
    let isActive = true
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from("galleries")
          .select("id,title,status,created_at,published_at,favorite_limit,downloads_locked,price_cents,currency")
          .order("created_at", { ascending: false })
        if (!isActive) return
        if (error) throw error
        setRows((data as GalleryRow[]) ?? [])
      } catch (err) {
        if (!isActive) return
        setError(err instanceof Error ? err.message : "Unable to load galleries")
      } finally {
        if (isActive) setLoading(false)
      }
    })()

    return () => {
      isActive = false
    }
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    navigate("/", { replace: true })
  }

  async function createGallery() {
    if (!user) return
    setError(null)

    const priceCents = Math.max(0, Math.round(Number(price || "0") * 100))
    const limit = Math.max(0, Math.round(Number(favoriteLimit || "0")))

    const { data, error } = await supabase
      .from("galleries")
      .insert({
        photographer_user_id: user.id,
        title: title.trim(),
        status: "draft",
        favorite_limit: limit,
        downloads_locked: downloadsLocked,
        price_cents: priceCents,
        currency,
      })
      .select("id,title,status,created_at,published_at,favorite_limit,downloads_locked,price_cents,currency")
      .single()

    if (error) {
      setError(error.message)
      return
    }

    const newRow = data as GalleryRow
    setRows((prev) => [newRow, ...prev])
    setCreateOpen(false)
    setTitle("")
    setPrice("")
    setFavoriteLimit("20")
    setDownloadsLocked(true)
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">PhotoHost</div>
            <div className="mt-1 text-sm font-medium">Admin</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white"
              onClick={() => setCreateOpen(true)}
            >
              New gallery
            </button>
            <button
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {error && <div className="mb-4 rounded-lg border border-red-900/60 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}

        <div className="rounded-xl border border-zinc-900 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-900 px-5 py-4">
            <div>
              <div className="text-sm font-medium">Galleries</div>
              <div className="mt-1 text-xs text-zinc-500">Create, upload, invite, and review selections.</div>
            </div>
          </div>

          {loading ? (
            <div className="p-5">
              <div className="h-5 w-40 animate-pulse rounded bg-zinc-900" />
              <div className="mt-3 h-16 w-full animate-pulse rounded bg-zinc-900" />
              <div className="mt-3 h-16 w-full animate-pulse rounded bg-zinc-900" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-sm text-zinc-400">No galleries yet.</div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {rows.map((g) => (
                <div key={g.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">{g.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {g.status.toUpperCase()} · Created {formatDate(g.created_at)} · Favorites limit {g.favorite_limit ?? 0} ·
                      {" "}
                      {g.downloads_locked ? "Downloads locked" : "Downloads unlocked"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                      to={`/g/${g.id}`}
                    >
                      View as client
                    </Link>
                    <Link
                      className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white"
                      to={`/admin/g/${g.id}`}
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="text-sm font-medium">New gallery</div>
              <div className="mt-1 text-xs text-zinc-500">Draft galleries aren’t visible to clients until published.</div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm text-zinc-300">Title</label>
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Smith Wedding"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm text-zinc-300">Price (USD)</label>
                    <input
                      className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="199"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-300">Favorite limit</label>
                    <input
                      className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                      value={favoriteLimit}
                      onChange={(e) => setFavoriteLimit(e.target.value)}
                      placeholder="20"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={downloadsLocked}
                    onChange={(e) => setDownloadsLocked(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
                  />
                  Lock downloads until paid
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={createGallery}
                  disabled={!canCreate}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
