import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { supabase } from "@/utils/supabaseClient"
import { invokeEdgeFunction } from "@/utils/invokeEdgeFunction"
import { useSessionStore } from "@/stores/useSessionStore"

type Gallery = {
  id: string
  title: string
  description: string | null
  status: string
  favorite_limit: number | null
  downloads_locked: boolean
  price_cents: number
  currency: string
}

type Asset = {
  id: string
  gallery_id: string
  storage_path_original: string
  storage_path_thumb: string
  sort_order: number
  kind: "proof" | "final"
}

type ProofMark = {
  id: string
  asset_id: string
  client_user_id: string
  is_favorite: boolean
  rating: number | null
}

type CommentRow = {
  id: string
  asset_id: string
  author_user_id: string
  body: string
  created_at: string
}

type Entitlement = {
  gallery_id: string
  client_user_id: string
  downloads_unlocked: boolean
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function formatTs(value: string) {
  const d = new Date(value)
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d)
}

export default function ClientGallery() {
  const { galleryId } = useParams()
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.user)

  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [proofMarks, setProofMarks] = useState<Record<string, ProofMark>>({})
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({})
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null)
  const [busyCheckout, setBusyCheckout] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [commentDraft, setCommentDraft] = useState("")

  const activeAsset = useMemo(() => assets.find((a) => a.id === activeAssetId) ?? null, [activeAssetId, assets])
  const favoriteLimit = Math.max(0, gallery?.favorite_limit ?? 0)
  const favoriteCount = useMemo(
    () => Object.values(proofMarks).filter((m) => m.is_favorite).length,
    [proofMarks],
  )
  const downloadsUnlocked = entitlement?.downloads_unlocked === true || gallery?.downloads_locked === false

  useEffect(() => {
    if (!galleryId) return
    let isActive = true
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const g = await supabase
          .from("galleries")
          .select("id,title,description,status,favorite_limit,downloads_locked,price_cents,currency")
          .eq("id", galleryId)
          .single()
        if (g.error) throw g.error

        const a = await supabase
          .from("assets")
          .select("id,gallery_id,storage_path_original,storage_path_thumb,sort_order,kind")
          .eq("gallery_id", galleryId)
          .order("sort_order", { ascending: true })
        if (a.error) throw a.error

        const assetRows = (a.data as Asset[]) ?? []
        const assetIds = assetRows.map((r) => r.id)

        const pmRes =
          assetIds.length === 0
            ? ({ data: [] as ProofMark[], error: null } as const)
            : await supabase
                .from("proof_marks")
                .select("id,asset_id,client_user_id,is_favorite,rating")
                .in("asset_id", assetIds)
        if (pmRes.error) throw pmRes.error

        const cRes =
          assetIds.length === 0
            ? ({ data: [] as CommentRow[], error: null } as const)
            : await supabase
                .from("comments")
                .select("id,asset_id,author_user_id,body,created_at")
                .in("asset_id", assetIds)
                .order("created_at", { ascending: true })
        if (cRes.error) throw cRes.error

        const entRes = await supabase
          .from("gallery_entitlements")
          .select("gallery_id,client_user_id,downloads_unlocked")
          .eq("gallery_id", galleryId)
          .maybeSingle()
        if (entRes.error) throw entRes.error

        if (!isActive) return

        setGallery(g.data as Gallery)
        setAssets(assetRows)

        const markMap: Record<string, ProofMark> = {}
        for (const m of (pmRes.data as ProofMark[]) ?? []) markMap[m.asset_id] = m
        setProofMarks(markMap)

        const commentMap: Record<string, CommentRow[]> = {}
        for (const row of (cRes.data as CommentRow[]) ?? []) {
          commentMap[row.asset_id] = [...(commentMap[row.asset_id] ?? []), row]
        }
        setComments(commentMap)

        setEntitlement((entRes.data as Entitlement) ?? null)

        const urlPairs = await Promise.all(
          assetRows.map(async (asset) => {
            const { data: signed, error: signErr } = await invokeEdgeFunction<{ url?: string }>("asset-signed-url", {
              galleryId,
              assetId: asset.id,
              variant: "thumb",
            })
            if (signErr) return null
            const url = (signed as { url?: string } | null)?.url
            if (!url) return null
            return { assetId: asset.id, url }
          }),
        )

        if (!isActive) return
        const map: Record<string, string> = {}
        for (const p of urlPairs) {
          if (p) map[p.assetId] = p.url
        }
        setThumbUrls(map)
      } catch (err) {
        if (!isActive) return
        setError(err instanceof Error ? err.message : "Unable to load gallery")
      } finally {
        if (isActive) setLoading(false)
      }
    })()

    const channel = supabase
      .channel(`gallery-${galleryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proof_marks" },
        async () => {
          const { data } = await supabase.from("proof_marks").select("id,asset_id,client_user_id,is_favorite,rating")
          const markMap: Record<string, ProofMark> = {}
          for (const m of (data as ProofMark[]) ?? []) markMap[m.asset_id] = m
          setProofMarks(markMap)
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        async () => {
          const { data } = await supabase
            .from("comments")
            .select("id,asset_id,author_user_id,body,created_at")
            .order("created_at", { ascending: true })
          const commentMap: Record<string, CommentRow[]> = {}
          for (const row of (data as CommentRow[]) ?? []) {
            commentMap[row.asset_id] = [...(commentMap[row.asset_id] ?? []), row]
          }
          setComments(commentMap)
        },
      )
      .subscribe()

    return () => {
      isActive = false
      supabase.removeChannel(channel)
    }
  }, [galleryId])

  useEffect(() => {
    if (!galleryId) return
    if (!activeAssetId) {
      setActivePreviewUrl(null)
      return
    }

    let isActive = true
    setActivePreviewUrl(null)

    invokeEdgeFunction<{ url?: string }>("asset-signed-url", {
      galleryId,
      assetId: activeAssetId,
      variant: "original",
    })
      .then(({ data, error }) => {
        if (!isActive) return
        if (error) return
        const url = (data as { url?: string } | null)?.url
        if (url) setActivePreviewUrl(url)
      })

    return () => {
      isActive = false
    }
  }, [activeAssetId, galleryId])

  async function setFavorite(assetId: string, isFavorite: boolean) {
    if (!user) return
    setError(null)

    if (favoriteLimit > 0 && isFavorite && favoriteCount >= favoriteLimit && !proofMarks[assetId]?.is_favorite) {
      setError(`You can select up to ${favoriteLimit} favorites.`)
      return
    }

    const existing = proofMarks[assetId]
    if (!existing) {
      const { data, error } = await supabase
        .from("proof_marks")
        .insert({ asset_id: assetId, client_user_id: user.id, is_favorite: isFavorite, rating: null })
        .select("id,asset_id,client_user_id,is_favorite,rating")
        .single()
      if (error) {
        setError(error.message)
        return
      }
      const row = data as ProofMark
      setProofMarks((prev) => ({ ...prev, [assetId]: row }))
      return
    }

    const { data, error } = await supabase
      .from("proof_marks")
      .update({ is_favorite: isFavorite })
      .eq("id", existing.id)
      .select("id,asset_id,client_user_id,is_favorite,rating")
      .single()
    if (error) {
      setError(error.message)
      return
    }
    const row = data as ProofMark
    setProofMarks((prev) => ({ ...prev, [assetId]: row }))
  }

  async function setRating(assetId: string, rating: number | null) {
    if (!user) return
    setError(null)

    const existing = proofMarks[assetId]
    if (!existing) {
      const { data, error } = await supabase
        .from("proof_marks")
        .insert({ asset_id: assetId, client_user_id: user.id, is_favorite: false, rating })
        .select("id,asset_id,client_user_id,is_favorite,rating")
        .single()
      if (error) {
        setError(error.message)
        return
      }
      const row = data as ProofMark
      setProofMarks((prev) => ({ ...prev, [assetId]: row }))
      return
    }

    const { data, error } = await supabase
      .from("proof_marks")
      .update({ rating })
      .eq("id", existing.id)
      .select("id,asset_id,client_user_id,is_favorite,rating")
      .single()
    if (error) {
      setError(error.message)
      return
    }
    const row = data as ProofMark
    setProofMarks((prev) => ({ ...prev, [assetId]: row }))
  }

  async function addComment(assetId: string) {
    if (!user) return
    const body = commentDraft.trim()
    if (!body) return
    setError(null)
    setCommentDraft("")
    const { data, error } = await supabase
      .from("comments")
      .insert({ asset_id: assetId, author_user_id: user.id, body })
      .select("id,asset_id,author_user_id,body,created_at")
      .single()
    if (error) {
      setError(error.message)
      return
    }
    const row = data as CommentRow
    setComments((prev) => ({ ...prev, [assetId]: [...(prev[assetId] ?? []), row] }))
  }

  async function startCheckout() {
    if (!galleryId) return
    setBusyCheckout(true)
    setError(null)
    try {
      const successUrl = `${window.location.origin}/checkout/success?galleryId=${encodeURIComponent(galleryId)}`
      const cancelUrl = `${window.location.origin}/checkout/cancel?galleryId=${encodeURIComponent(galleryId)}`

      const { data, error } = await invokeEdgeFunction<{ url?: string }>("stripe-create-checkout", { galleryId, successUrl, cancelUrl })
      if (error) throw error

      const url = (data as { url?: string } | null)?.url
      if (!url) {
        const { data: ent } = await supabase
          .from("gallery_entitlements")
          .select("gallery_id,client_user_id,downloads_unlocked")
          .eq("gallery_id", galleryId)
          .maybeSingle()
        setEntitlement((ent as Entitlement) ?? null)
        return
      }
      window.location.assign(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed")
    } finally {
      setBusyCheckout(false)
    }
  }

  async function downloadAsset(asset: Asset) {
    if (!galleryId) return
    if (!downloadsUnlocked) {
      setError("Downloads are locked until payment is completed.")
      return
    }
    if (asset.kind !== "final") {
      setError("This file is not available for download yet.")
      return
    }
    setError(null)
    const { data, error } = await invokeEdgeFunction<{ url?: string }>("asset-signed-url", {
      galleryId,
      assetId: asset.id,
      variant: "original",
      forDownload: true,
    })
    if (error) {
      setError(error.message)
      return
    }
    const url = (data as { url?: string } | null)?.url
    if (!url) {
      setError("Unable to generate download link")
      return
    }
    window.location.assign(url)
  }

  if (!galleryId) return null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">PhotoHost</div>
            <div className="mt-1 text-sm font-medium">{gallery?.title ?? "Gallery"}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" to="/">
              Home
            </Link>
            <button
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
              onClick={async () => {
                await supabase.auth.signOut()
                navigate("/", { replace: true })
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {error && <div className="mb-4 rounded-lg border border-red-900/60 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}

        {loading ? (
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
            <div className="h-5 w-44 animate-pulse rounded bg-zinc-900" />
            <div className="mt-4 h-28 w-full animate-pulse rounded bg-zinc-900" />
          </div>
        ) : !gallery ? (
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6 text-sm text-zinc-300">Not found.</div>
        ) : gallery.status !== "published" ? (
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6 text-sm text-zinc-300">This gallery is not published.</div>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-zinc-900 bg-zinc-950 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium">Proofing</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {favoriteLimit > 0 ? `${favoriteCount}/${favoriteLimit} favorites selected` : `${favoriteCount} favorites selected`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {gallery.downloads_locked && !downloadsUnlocked && (
                  <button
                    className={classNames(
                      "rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white",
                      busyCheckout && "cursor-not-allowed opacity-60",
                    )}
                    onClick={startCheckout}
                    disabled={busyCheckout}
                  >
                    {busyCheckout ? "Opening…" : `Unlock downloads · ${(gallery.price_cents / 100).toFixed(2)} ${
                      gallery.currency.toUpperCase()
                    }`}
                  </button>
                )}
                {downloadsUnlocked && (
                  <div className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200">Downloads unlocked</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {assets.map((asset) => {
                const mark = proofMarks[asset.id]
                const isFav = mark?.is_favorite === true
                const rating = mark?.rating ?? 0
                const commentCount = comments[asset.id]?.length ?? 0
                const src = thumbUrls[asset.id]

                return (
                  <button
                    key={asset.id}
                    className={classNames(
                      "group relative overflow-hidden rounded-xl border bg-zinc-950 text-left",
                      isFav ? "border-zinc-500" : "border-zinc-900",
                    )}
                    onClick={() => setActiveAssetId(asset.id)}
                  >
                    <div className="aspect-square bg-zinc-900">
                      {src ? (
                        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="h-full w-full animate-pulse bg-zinc-900" />
                      )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-8">
                      <div className="flex items-center gap-2">
                        <div className={classNames("text-xs", isFav ? "text-zinc-100" : "text-zinc-300")}>{isFav ? "♥" : "♡"}</div>
                        <div className="text-xs text-zinc-300">{rating > 0 ? `${rating}★` : ""}</div>
                      </div>
                      <div className="text-xs text-zinc-300">{commentCount > 0 ? `${commentCount} comments` : ""}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            {activeAsset && (
              <div className="fixed inset-0 z-50 bg-black/80">
                <div className="absolute inset-0" onClick={() => setActiveAssetId(null)} />
                <div className="relative mx-auto flex h-full max-w-6xl flex-col px-4 py-6 md:flex-row md:gap-6">
                  <div className="flex-1 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                    <div className="flex items-center justify-between px-2 py-2">
                      <div className="text-sm text-zinc-300">Preview</div>
                      <button
                        className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                        onClick={() => setActiveAssetId(null)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-2 aspect-[4/3] overflow-hidden rounded-xl bg-zinc-900">
                      <img
                        src={activePreviewUrl ?? thumbUrls[activeAsset.id]}
                        alt=""
                        className="h-full w-full object-contain"
                        draggable={false}
                      />
                    </div>
                  </div>

                  <div className="mt-4 w-full md:mt-0 md:w-[360px]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                      <div className="text-sm font-medium">Proofing</div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm text-zinc-300">Favorite</div>
                        <button
                          className={classNames(
                            "rounded-lg border px-3 py-2 text-sm",
                            proofMarks[activeAsset.id]?.is_favorite ? "border-zinc-500 bg-zinc-900/40" : "border-zinc-800",
                          )}
                          onClick={() => setFavorite(activeAsset.id, !(proofMarks[activeAsset.id]?.is_favorite ?? false))}
                        >
                          {proofMarks[activeAsset.id]?.is_favorite ? "♥ Favorited" : "♡ Favorite"}
                        </button>
                      </div>

                      <div className="mt-4">
                        <div className="text-sm text-zinc-300">Rating</div>
                        <div className="mt-2 flex gap-2">
                          {[1, 2, 3, 4, 5].map((r) => (
                            <button
                              key={r}
                              className={classNames(
                                "h-10 w-10 rounded-lg border text-sm",
                                (proofMarks[activeAsset.id]?.rating ?? 0) >= r
                                  ? "border-zinc-500 bg-zinc-900/40 text-zinc-50"
                                  : "border-zinc-800 text-zinc-300 hover:bg-zinc-900",
                              )}
                              onClick={() => setRating(activeAsset.id, r)}
                            >
                              {r}
                            </button>
                          ))}
                          <button
                            className="h-10 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-900"
                            onClick={() => setRating(activeAsset.id, null)}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-zinc-900 pt-5">
                        <div className="text-sm font-medium">Comments</div>
                        <div className="mt-3 max-h-48 space-y-3 overflow-auto pr-1">
                          {(comments[activeAsset.id] ?? []).map((c) => (
                            <div key={c.id} className="rounded-lg border border-zinc-900 bg-zinc-900/20 p-3">
                              <div className="text-xs text-zinc-500">{formatTs(c.created_at)}</div>
                              <div className="mt-1 text-sm text-zinc-200">{c.body}</div>
                            </div>
                          ))}
                          {(comments[activeAsset.id] ?? []).length === 0 && (
                            <div className="text-sm text-zinc-500">No comments yet.</div>
                          )}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <input
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                            value={commentDraft}
                            onChange={(e) => setCommentDraft(e.target.value)}
                            placeholder="Write a comment…"
                          />
                          <button
                            className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white"
                            onClick={() => addComment(activeAsset.id)}
                          >
                            Send
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-zinc-900 pt-5">
                        <button
                          className={classNames(
                            "w-full rounded-lg px-3 py-2 text-sm font-medium",
                            downloadsUnlocked && activeAsset.kind === "final"
                              ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                              : "cursor-not-allowed border border-zinc-800 text-zinc-400",
                          )}
                          onClick={() => downloadAsset(activeAsset)}
                        >
                          Download
                        </button>
                        {!downloadsUnlocked && (
                          <div className="mt-2 text-xs text-zinc-500">Payment required to unlock downloads.</div>
                        )}
                        {downloadsUnlocked && activeAsset.kind !== "final" && (
                          <div className="mt-2 text-xs text-zinc-500">Only final images can be downloaded.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
