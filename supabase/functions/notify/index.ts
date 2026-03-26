import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { createAnonAuthedClient, getEnv } from "../_shared/supabase.ts"

type ReqBody = { toEmail: string; subject: string; html: string; text?: string }

function getOptionalEnv(name: string) {
  try {
    return getEnv(name)
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders })

    const userClient = createAnonAuthedClient(req)
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders })

    const { toEmail, subject, html, text } = (await req.json()) as ReqBody
    const to = (toEmail ?? "").trim().toLowerCase()
    if (!to || !subject || !html) return new Response("Bad request", { status: 400, headers: corsHeaders })

    const key = getOptionalEnv("RESEND_API_KEY")
    const from = getOptionalEnv("RESEND_FROM")
    if (!key || !from) {
      return new Response(JSON.stringify({ sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    })

    if (!res.ok) {
      const body = await res.text()
      return new Response(JSON.stringify({ sent: false, error: body }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ sent: true }), {
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

