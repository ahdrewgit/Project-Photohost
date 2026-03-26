import Stripe from "https://esm.sh/stripe@14.25.0?target=deno"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createAnonAuthedClient, createServiceClient, getEnv } from "../_shared/supabase.ts"

type ReqBody = { galleryId: string; successUrl: string; cancelUrl: string }

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders })

    const userClient = createAnonAuthedClient(req)
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const { galleryId, successUrl, cancelUrl } = (await req.json()) as ReqBody
    if (!galleryId || !successUrl || !cancelUrl) return new Response("Bad request", { status: 400, headers: corsHeaders })

    const userId = userData.user.id
    const service = createServiceClient()

    const { data: gallery, error: gErr } = await service
      .from("galleries")
      .select("id,title,status,photographer_user_id,downloads_locked,price_cents,currency")
      .eq("id", galleryId)
      .single()
    if (gErr) throw gErr
    if (!gallery) return new Response("Not found", { status: 404, headers: corsHeaders })

    const isPhotographer = gallery.photographer_user_id === userId
    if (!isPhotographer) {
      if (gallery.status !== "published") return new Response("Forbidden", { status: 403, headers: corsHeaders })
      const { data: gc, error: gcErr } = await service
        .from("gallery_clients")
        .select("id")
        .eq("gallery_id", galleryId)
        .eq("client_user_id", userId)
        .maybeSingle()
      if (gcErr) throw gcErr
      if (!gc) return new Response("Forbidden", { status: 403, headers: corsHeaders })
    }

    if (!gallery.downloads_locked) {
      return new Response(JSON.stringify({ url: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (gallery.price_cents <= 0) {
      const up = await service
        .from("gallery_entitlements")
        .upsert(
          { gallery_id: galleryId, client_user_id: userId, downloads_unlocked: true, unlocked_at: new Date().toISOString() },
          { onConflict: "gallery_id,client_user_id" },
        )
      if (up.error) throw up.error
      return new Response(JSON.stringify({ url: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const stripe = new Stripe(getEnv("STRIPE_SECRET_KEY"), { apiVersion: "2024-06-20" })

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { gallery_id: galleryId, client_user_id: userId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: gallery.currency,
            unit_amount: gallery.price_cents,
            product_data: { name: `Unlock downloads: ${gallery.title}` },
          },
        },
      ],
    })

    if (!session.url) throw new Error("Stripe session missing url")

    const ins = await service.from("orders").insert({
      gallery_id: galleryId,
      client_user_id: userId,
      stripe_session_id: session.id,
      status: "created",
      amount_cents: gallery.price_cents,
      currency: gallery.currency,
    })
    if (ins.error) throw ins.error

    return new Response(JSON.stringify({ url: session.url }), {
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

