import Stripe from "https://esm.sh/stripe@14.25.0?target=deno"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createServiceClient, getEnv } from "../_shared/supabase.ts"

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders })

    const sig = req.headers.get("stripe-signature")
    if (!sig) return new Response("Missing signature", { status: 400, headers: corsHeaders })

    const stripe = new Stripe(getEnv("STRIPE_SECRET_KEY"), { apiVersion: "2024-06-20" })
    const webhookSecret = getEnv("STRIPE_WEBHOOK_SECRET")

    const raw = await req.text()
    const event = stripe.webhooks.constructEvent(raw, sig, webhookSecret)

    if (event.type !== "checkout.session.completed") {
      return new Response("ok", { headers: corsHeaders })
    }

    const session = event.data.object as Stripe.Checkout.Session
    const galleryId = (session.metadata?.gallery_id ?? "").toString()
    const clientUserId = (session.metadata?.client_user_id ?? "").toString()
    const sessionId = session.id

    if (!galleryId || !clientUserId) return new Response("Bad metadata", { status: 400, headers: corsHeaders })

    const service = createServiceClient()

    const amountCents = typeof session.amount_total === "number" ? session.amount_total : 0
    const currency = (session.currency ?? "usd").toString()

    const upOrder = await service
      .from("orders")
      .upsert(
        {
          gallery_id: galleryId,
          client_user_id: clientUserId,
          stripe_session_id: sessionId,
          status: "paid",
          amount_cents: amountCents,
          currency,
          paid_at: new Date().toISOString(),
        },
        { onConflict: "stripe_session_id" },
      )
    if (upOrder.error) throw upOrder.error

    const upEnt = await service
      .from("gallery_entitlements")
      .upsert(
        {
          gallery_id: galleryId,
          client_user_id: clientUserId,
          downloads_unlocked: true,
          unlocked_at: new Date().toISOString(),
        },
        { onConflict: "gallery_id,client_user_id" },
      )
    if (upEnt.error) throw upEnt.error

    return new Response("ok", { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(message, { status: 400, headers: corsHeaders })
  }
})
