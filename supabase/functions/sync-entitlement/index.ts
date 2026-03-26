import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createAnonAuthedClient, createServiceClient } from "../_shared/supabase.ts"

type ReqBody = { galleryId: string }

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders })

    const userClient = createAnonAuthedClient(req)
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const { galleryId } = (await req.json()) as ReqBody
    if (!galleryId) return new Response("Bad request", { status: 400, headers: corsHeaders })

    const service = createServiceClient()
    const userId = userData.user.id

    const { data: ent, error: entErr } = await service
      .from("gallery_entitlements")
      .select("downloads_unlocked")
      .eq("gallery_id", galleryId)
      .eq("client_user_id", userId)
      .maybeSingle()
    if (entErr) throw entErr

    return new Response(JSON.stringify({ downloadsUnlocked: ent?.downloads_unlocked === true }), {
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

