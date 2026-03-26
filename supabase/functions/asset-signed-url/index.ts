import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createAnonAuthedClient, createServiceClient } from "../_shared/supabase.ts"

type ReqBody = {
  galleryId: string
  assetId: string
  variant: "thumb" | "original"
  forDownload?: boolean
}

const bucket = "gallery-assets"

const DenoRuntime = (globalThis as any).Deno

DenoRuntime.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders })

    const userClient = createAnonAuthedClient(req)
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: userErr?.message ?? null }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { galleryId, assetId, variant, forDownload } = (await req.json()) as ReqBody
    if (!galleryId || !assetId || (variant !== "thumb" && variant !== "original")) {
      return new Response("Bad request", { status: 400, headers: corsHeaders })
    }

    const service = createServiceClient()
    const userId = userData.user.id

    const [{ data: gallery, error: gErr }, { data: asset, error: aErr }] = await Promise.all([
      service
        .from("galleries")
        .select("id,photographer_user_id,downloads_locked,status")
        .eq("id", galleryId)
        .single(),
      service
        .from("assets")
        .select("id,gallery_id,storage_path_original,storage_path_thumb,kind")
        .eq("id", assetId)
        .single(),
    ])

    if (gErr) throw gErr
    if (aErr) throw aErr
    if (!gallery || !asset) return new Response("Not found", { status: 404, headers: corsHeaders })
    if (asset.gallery_id !== gallery.id) return new Response("Not found", { status: 404, headers: corsHeaders })

    const isPhotographer = gallery.photographer_user_id === userId

    let isClient = false
    if (!isPhotographer) {
      const { data: gc, error: gcErr } = await service
        .from("gallery_clients")
        .select("id")
        .eq("gallery_id", galleryId)
        .eq("client_user_id", userId)
        .maybeSingle()
      if (gcErr) throw gcErr
      isClient = !!gc
    }

    if (!isPhotographer && !isClient) return new Response("Forbidden", { status: 403, headers: corsHeaders })
    if (!isPhotographer && gallery.status !== "published") return new Response("Forbidden", { status: 403, headers: corsHeaders })

    if (forDownload) {
      if (asset.kind !== "final") return new Response("Forbidden", { status: 403, headers: corsHeaders })
      if (!isPhotographer && gallery.downloads_locked) {
        const { data: ent, error: entErr } = await service
          .from("gallery_entitlements")
          .select("downloads_unlocked")
          .eq("gallery_id", galleryId)
          .eq("client_user_id", userId)
          .maybeSingle()
        if (entErr) throw entErr
        if (!ent?.downloads_unlocked) return new Response("Payment required", { status: 402, headers: corsHeaders })
      }
    }

    const path = variant === "thumb" ? asset.storage_path_thumb : asset.storage_path_original
    const expiresIn = forDownload ? 60 : 60 * 5
    const { data, error } = await service.storage.from(bucket).createSignedUrl(path, expiresIn)
    if (error) throw error
    return new Response(JSON.stringify({ url: data.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
