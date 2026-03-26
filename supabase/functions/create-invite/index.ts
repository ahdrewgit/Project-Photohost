import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createAnonAuthedClient, createServiceClient, getEnv } from "../_shared/supabase.ts"

type ReqBody = { galleryId: string; email: string }

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders })

    const userClient = createAnonAuthedClient(req)
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const { galleryId, email } = (await req.json()) as ReqBody
    const cleanEmail = (email ?? "").trim().toLowerCase()
    if (!galleryId || !cleanEmail) return new Response("Bad request", { status: 400, headers: corsHeaders })

    const service = createServiceClient()

    const { data: gallery, error: gErr } = await service
      .from("galleries")
      .select("id,photographer_user_id")
      .eq("id", galleryId)
      .single()

    if (gErr) throw gErr
    if (!gallery || gallery.photographer_user_id !== userData.user.id) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders })
    }

    const token = crypto.randomUUID().replace(/-/g, "")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: invite, error: iErr } = await service
      .from("gallery_invites")
      .insert({ gallery_id: galleryId, email: cleanEmail, token, expires_at: expiresAt })
      .select("id,email,token,expires_at,redeemed_at")
      .single()

    if (iErr) throw iErr

    try {
      const resendKey = Deno.env.get("RESEND_API_KEY")
      const resendFrom = Deno.env.get("RESEND_FROM")
      const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL")
      if (resendKey && resendFrom && publicSiteUrl) {
        const link = `${publicSiteUrl.replace(/\/$/, "")}/invite?token=${token}`
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: resendFrom,
            to: [cleanEmail],
            subject: "Your gallery is ready",
            html: `<p>Your gallery invite link:</p><p><a href="${link}">${link}</a></p>`,
            text: `Your gallery invite link: ${link}`,
          }),
        })
      }
    } catch {
    }

    return new Response(JSON.stringify(invite), {
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
