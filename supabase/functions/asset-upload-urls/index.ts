import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createAnonAuthedClient, createServiceClient } from "../_shared/supabase.ts"

type ReqBody = { galleryId: string; assetId: string; originalExt: string }

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

    const { galleryId, assetId, originalExt } = (await req.json()) as ReqBody
    const ext = (originalExt ?? "").trim().replace(".", "")
    if (!galleryId || !assetId || !ext) return new Response("Bad request", { status: 400, headers: corsHeaders })

    const service = createServiceClient()

    const { data: gallery, error: gErr } = await service
      .from("galleries")
      .select("id,photographer_user_id")
      .eq("id", galleryId)
      .single()

    if (gErr) throw gErr
    if (!gallery || gallery.photographer_user_id !== userData.user.id) return new Response("Forbidden", { status: 403, headers: corsHeaders })

    const originalPath = `galleries/${galleryId}/${assetId}/original.${ext}`
    const thumbPath = `galleries/${galleryId}/${assetId}/thumb.jpg`

    const [o, t] = await Promise.all([
      service.storage.from(bucket).createSignedUploadUrl(originalPath),
      service.storage.from(bucket).createSignedUploadUrl(thumbPath),
    ])

    if (o.error || t.error) {
      const msg = (o.error?.message || t.error?.message || "Storage error").toLowerCase()
      if (msg.includes("bucket") && msg.includes("not") && msg.includes("found")) {
        return new Response(JSON.stringify({ error: `Storage bucket not found: ${bucket}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      throw o.error ?? t.error
    }

    return new Response(
      JSON.stringify({
        original: { path: originalPath, token: o.data.token },
        thumb: { path: thumbPath, token: t.data.token },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
