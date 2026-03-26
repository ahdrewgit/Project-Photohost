import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { supabase } from "@/utils/supabaseClient"
import { invokeEdgeFunction } from "@/utils/invokeEdgeFunction"

type Gallery = {
  id: string
  title: string
  status: string
  description: string | null
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

type Invite = {
  id: string
  email: string
  token: string
  expires_at: string
  redeemed_at: string | null
}

type UploadUrlsRes = {
  original: { path: string; token: string }
  thumb: { path: string; token: string }
}

function describeFunctionInvokeError(err: unknown) {
  const anyErr = err as { message?: string; context?: { status?: number; statusText?: string; body?: unknown } }
  const status = anyErr?.context?.status
  const message = anyErr?.message ?? "Edge Function error"
  const body = anyErr?.context?.body

  if (status === 403) return "Upload not allowed for this gallery. Make sure you’re signed in as the photographer who created it."
  if (status === 401) {
    if (typeof body === "object" && body && "message" in body) {
      const m = String((body as { message?: string }).message ?? "")
      if (m.toLowerCase().includes("no api key")) {
        return "Upload request is missing the required Supabase apikey header. Deploy the latest frontend (and ensure VITE_SUPABASE_ANON_KEY is set in Vercel), then try again."
      }
    }
    return "You’re not signed in (or your session expired). Refresh the page and sign in again."
  }
  if (typeof body === "object" && body && "error" in body) {
    const inner = (body as { error?: string }).error
    if (inner && inner.toLowerCase().includes("bucket")) {
      return "Storage bucket is missing. In Supabase Dashboard → Storage, create a private bucket named gallery-assets."
    }
    if (inner) return inner
  }

  if (status) return `Upload service error (${status}). ${message}`
  return message
}

function fileExtFromType(type: string) {
  if (type === "image/jpeg") return "jpg"
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  return "bin"
}

async function createSquareThumb(file: File, size: number) {
  const img = document.createElement("img")
  img.decoding = "async"
  img.src = URL.createObjectURL(file)

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("Invalid image"))
  })

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unsupported")

  const s = Math.min(img.naturalWidth, img.naturalHeight)
  const sx = Math.floor((img.naturalWidth - s) / 2)
  const sy = Math.floor((img.naturalHeight - s) / 2)

  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Thumb render failed"))), "image/jpeg", 0.82)
  })

  URL.revokeObjectURL(img.src)
  return new File([blob], `thumb.jpg`, { type: "image/jpeg" })
}

export default function AdminGallery() {
  const navigate = useNavigate()
  const { galleryId } = useParams()

  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [busyInvite, setBusyInvite] = useState(false)
  const [busyUpload, setBusyUpload] = useState(false)

  const bucket = "gallery-assets"

  const inviteLinkBase = useMemo(() => `${window.location.origin}/invite?token=`, [])

  useEffect(() => {
    if (!galleryId) return
    let isActive = true
    setLoading(true)
    setError(null)

    Promise.all([
      supabase
        .from("galleries")
        .select("id,title,status,description,favorite_limit,downloads_locked,price_cents,currency")
        .eq("id", galleryId)
        .single(),
      supabase
        .from("assets")
        .select("id,gallery_id,storage_path_original,storage_path_thumb,sort_order,kind")
        .eq("gallery_id", galleryId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("gallery_invites")
        .select("id,email,token,expires_at,redeemed_at")
        .eq("gallery_id", galleryId)
        .order("created_at", { ascending: false }),
    ])
      .then(([g, a, i]) => {
        if (!isActive) return
        if (g.error) throw g.error
        if (a.error) throw a.error
        if (i.error) throw i.error

        setGallery(g.data as Gallery)
        const assetRows = (a.data as Asset[]) ?? []
        setAssets(assetRows)
        setInvites((i.data as Invite[]) ?? [])

        Promise.all(
          assetRows.map(async (asset) => {
            const { data, error } = await invokeEdgeFunction<{ url?: string }>("asset-signed-url", {
              galleryId,
              assetId: asset.id,
              variant: "thumb",
            })
            if (error) return null
            const url = (data as { url?: string } | null)?.url
            if (!url) return null
            return { assetId: asset.id, url }
          }),
        ).then((pairs) => {
          if (!isActive) return
          const map: Record<string, string> = {}
          for (const p of pairs) {
            if (p) map[p.assetId] = p.url
          }
          setThumbUrls(map)
        })
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : "Unable to load gallery")
      })
      .finally(() => {
        if (!isActive) return
        setLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [galleryId])

  async function publishGallery() {
    if (!galleryId) return
    setError(null)
    const { data, error } = await supabase
      .from("galleries")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", galleryId)
      .select("id,title,status,description,favorite_limit,downloads_locked,price_cents,currency")
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setGallery(data as Gallery)
  }

  async function createInvite() {
    if (!galleryId) return
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setBusyInvite(true)
    setError(null)
    try {
      const { data, error } = await invokeEdgeFunction<Invite>("create-invite", { galleryId, email })
      if (error) throw error
      const invite = data as Invite
      setInvites((prev) => [invite, ...prev])
      setInviteEmail("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create invite")
    } finally {
      setBusyInvite(false)
    }
  }

  async function onUpload(files: FileList | null) {
    if (!galleryId) return
    if (!files || files.length === 0) return
    setBusyUpload(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const ext = fileExtFromType(file.type)
        const assetId = crypto.randomUUID()
        const thumbFile = await createSquareThumb(file, 512)

        const { data: urls, error: urlErr } = await invokeEdgeFunction<UploadUrlsRes>("asset-upload-urls", {
          galleryId,
          assetId,
          originalExt: ext,
        })
        if (urlErr) {
          const msg = urlErr.message
          if (msg.includes("Failed to send a request to the Edge Function")) {
            throw new Error(
              "Upload service is not reachable. This usually means Edge Functions are not deployed yet for your Supabase project."
            )
          }
          throw new Error(describeFunctionInvokeError(urlErr))
        }

        const parsed = urls as UploadUrlsRes
        const originalPath = parsed?.original?.path
        const originalToken = parsed?.original?.token
        const thumbPath = parsed?.thumb?.path
        const thumbToken = parsed?.thumb?.token

        if (!originalPath || !originalToken || !thumbPath || !thumbToken) throw new Error("Upload URLs unavailable")

        const up1 = await supabase.storage.from(bucket).uploadToSignedUrl(originalPath, originalToken, file)
        if (up1.error) throw up1.error

        const up2 = await supabase.storage.from(bucket).uploadToSignedUrl(thumbPath, thumbToken, thumbFile)
        if (up2.error) throw up2.error

        const { data: inserted, error: insErr } = await supabase
          .from("assets")
          .insert({
            id: assetId,
            gallery_id: galleryId,
            storage_path_original: originalPath,
            storage_path_thumb: thumbPath,
            sort_order: assets.length,
            kind: "proof",
          })
          .select("id,gallery_id,storage_path_original,storage_path_thumb,sort_order,kind")
          .single()
        if (insErr) throw insErr

        const insertedAsset = inserted as Asset
        setAssets((prev) => [...prev, insertedAsset])
        const { data: signed, error: signErr } = await invokeEdgeFunction<{ url?: string }>("asset-signed-url", {
          galleryId,
          assetId: insertedAsset.id,
          variant: "thumb",
        })
        if (!signErr) {
          const url = (signed as { url?: string } | null)?.url
          if (url) setThumbUrls((prev) => ({ ...prev, [insertedAsset.id]: url }))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusyUpload(false)
    }
  }

  async function toggleKind(asset: Asset) {
    const next = asset.kind === "proof" ? "final" : "proof"
    const { data, error } = await supabase
      .from("assets")
      .update({ kind: next })
      .eq("id", asset.id)
      .select("id,gallery_id,storage_path_original,storage_path_thumb,sort_order,kind")
      .single()
    if (error) {
      setError(error.message)
      return
    }
    const updated = data as Asset
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  if (!galleryId) return null

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <div className="text-xs font-medium text-zinc-400">PhotoHost</div>
            <div className="mt-1 text-sm font-medium">Gallery</div>
          </div>
          <div className="flex items-center gap-2">
            <Link className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900" to="/admin">
              Back
            </Link>
            <button
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={publishGallery}
              disabled={!gallery || gallery.status === "published"}
            >
              {gallery?.status === "published" ? "Published" : "Publish"}
            </button>
            <button
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
              onClick={() => navigate(`/g/${galleryId}`)}
            >
              View
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
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-medium">{gallery.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {gallery.status.toUpperCase()} · Favorites limit {gallery.favorite_limit ?? 0} ·
                      {" "}
                      {gallery.downloads_locked ? "Downloads locked" : "Downloads unlocked"} · Price {(
                        gallery.price_cents / 100
                      ).toFixed(2)} {gallery.currency.toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 rounded-lg border border-zinc-900 bg-zinc-900/20 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium">Upload photos</div>
                    <div className="mt-1 text-xs text-zinc-500">Uploads store originals + generated thumbnails.</div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white">
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={busyUpload}
                      onChange={(e) => onUpload(e.target.files)}
                    />
                    {busyUpload ? "Uploading…" : "Select files"}
                  </label>
                </div>

                <div className="mt-6">
                  <div className="text-sm font-medium">Assets</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {assets.map((a) => (
                      <div key={a.id} className="rounded-xl border border-zinc-900 bg-zinc-950 p-2">
                        <div className="aspect-square overflow-hidden rounded-lg bg-zinc-900">
                          {thumbUrls[a.id] ? (
                            <img src={thumbUrls[a.id]} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full animate-pulse bg-zinc-900" />
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-xs text-zinc-400">{a.kind.toUpperCase()}</div>
                          <button
                            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                            onClick={() => toggleKind(a)}
                          >
                            Toggle
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
                <div className="text-sm font-medium">Client invites</div>
                <div className="mt-1 text-xs text-zinc-500">Create expiring invite links for client access.</div>

                <div className="mt-5 flex gap-2">
                  <input
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="client@email.com"
                    type="email"
                  />
                  <button
                    className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={createInvite}
                    disabled={busyInvite || inviteEmail.trim().length === 0}
                  >
                    {busyInvite ? "Creating…" : "Invite"}
                  </button>
                </div>

                <div className="mt-5 space-y-2">
                  {invites.map((i) => (
                    <div key={i.id} className="rounded-lg border border-zinc-900 bg-zinc-900/20 p-3">
                      <div className="text-sm text-zinc-100">{i.email}</div>
                      <div className="mt-1 text-xs text-zinc-500">{i.redeemed_at ? "Redeemed" : "Pending"}</div>
                      <div className="mt-3">
                        <input
                          className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                          readOnly
                          value={`${inviteLinkBase}${i.token}`}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
