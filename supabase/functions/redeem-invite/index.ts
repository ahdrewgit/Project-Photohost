import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createAnonAuthedClient, createServiceClient } from "../_shared/supabase.ts"

type ReqBody = { token: string }

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders })

    const userClient = createAnonAuthedClient(req)
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const { token } = (await req.json()) as ReqBody
    const cleanToken = (token ?? "").trim()
    if (!cleanToken) return new Response("Bad request", { status: 400, headers: corsHeaders })

    const service = createServiceClient()

    const { data: invite, error: invErr } = await service
      .from("gallery_invites")
      .select("id,gallery_id,expires_at,redeemed_at")
      .eq("token", cleanToken)
      .maybeSingle()

    if (invErr) throw invErr
    if (!invite) return new Response("Invalid invite", { status: 404, headers: corsHeaders })
    if (invite.redeemed_at) return new Response("Invite already used", { status: 409, headers: corsHeaders })
    if (new Date(invite.expires_at).getTime() < Date.now()) return new Response("Invite expired", { status: 410, headers: corsHeaders })

    const userId = userData.user.id

    const up1 = await service.from("client_profiles").upsert({ user_id: userId }, { onConflict: "user_id" })
    if (up1.error) throw up1.error

    const up2 = await service
      .from("gallery_clients")
      .upsert({ gallery_id: invite.gallery_id, client_user_id: userId }, { onConflict: "gallery_id,client_user_id" })
    if (up2.error) throw up2.error

    const up3 = await service
      .from("gallery_entitlements")
      .upsert(
        { gallery_id: invite.gallery_id, client_user_id: userId, downloads_unlocked: false },
        { onConflict: "gallery_id,client_user_id" },
      )
    if (up3.error) throw up3.error

    const up4 = await service
      .from("gallery_invites")
      .update({ redeemed_at: new Date().toISOString(), redeemed_user_id: userId })
      .eq("id", invite.id)
    if (up4.error) throw up4.error

    return new Response(JSON.stringify({ galleryId: invite.gallery_id }), {
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

