# PhotoHost — Supabase Connected Build Handoff

This handoff describes the minimum configuration and steps to run PhotoHost locally and deploy it with Supabase (Auth/DB/Storage + Edge Functions).

## 1) Required environment variables

### 1.1 Frontend (React + Vite)
Create `.env.local` (not committed) and set:

- `VITE_SUPABASE_URL` = your Supabase project URL (from Supabase Dashboard → Project Settings → API)
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon public key (from Supabase Dashboard → Project Settings → API)

If your app uses Stripe/checkout configuration from the client (only publishable values):
- `VITE_STRIPE_PUBLISHABLE_KEY` = Stripe publishable key (optional; only if frontend needs it)

### 1.2 Supabase Edge Functions (server-side secrets)
Set these as Supabase secrets (do NOT put them in frontend env):

- `STRIPE_SECRET_KEY` = Stripe secret key
- `STRIPE_WEBHOOK_SECRET` = Stripe webhook signing secret
- `RESEND_API_KEY` = Resend API key (if email sending is enabled)

Optional (email sender configuration):
- `RESEND_FROM` = verified sender (e.g., `"Studio <no-reply@yourdomain.com>"`)
- `PUBLIC_SITE_URL` = your deployed frontend origin (used to generate invite links)

> Set with: `supabase secrets set KEY=value` (see §3.3).

## 2) Local development (recommended path)

### 2.1 Install tooling
- Install Node.js (LTS) and your package manager.
- Install Supabase CLI.

### 2.2 Link project (if using a hosted Supabase project)
From repo root:
- `supabase login`
- `supabase link --project-ref <YOUR_PROJECT_REF>`

> Your project ref is shown in Supabase Dashboard → Project Settings.

### 2.3 Run Supabase locally (optional but best for DB + functions)
- `supabase start`

This will start a local Postgres + local Supabase stack. Use the local URL/keys printed by the CLI for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when running against local.

### 2.4 Run the frontend
- `npm install`
- `npm run dev`

## 3) Database migrations / apply steps

> This section assumes you keep SQL migrations under `supabase/migrations`.

### 3.1 Apply migrations to local Supabase
- `supabase db reset`

This recreates the local DB and applies migrations.

### 3.2 Apply migrations to hosted Supabase (production)
Use one of these approaches (choose one and standardize it for your team):

A) Push local migrations to the linked hosted project
- `supabase db push`

B) If your workflow uses migration files generated from the remote DB
- `supabase db pull` (creates/updates migrations locally)

> Avoid running ad-hoc SQL in production without checking in a migration.

### 3.3 Verify / apply Edge Function + RLS dependencies
If your migrations include RLS policies, triggers, or storage buckets, validate after apply:
- Auth settings (email/password and magic-link enabled as required)
- Storage buckets exist (and have correct policies)
- RLS policies allow intended read/write paths

## 4) Edge Functions (Stripe + webhooks + notifications)

### 4.1 Deploy functions
From repo root (after linking):
- `supabase functions deploy create-invite`
- `supabase functions deploy redeem-invite`
- `supabase functions deploy asset-signed-url`
- `supabase functions deploy asset-upload-urls`
- `supabase functions deploy stripe-create-checkout`
- `supabase functions deploy stripe-webhook`
- `supabase functions deploy sync-entitlement`
- `supabase functions deploy notify` (optional)

### 4.2 Set function secrets
- `supabase secrets set STRIPE_SECRET_KEY=<...>`
- `supabase secrets set STRIPE_WEBHOOK_SECRET=<...>`
- `supabase secrets set RESEND_API_KEY=<...>`
- `supabase secrets set RESEND_FROM=<...>` (optional)
- `supabase secrets set PUBLIC_SITE_URL=<...>` (optional)

### 4.3 Configure Stripe webhooks
In Stripe Dashboard, create a webhook endpoint targeting your deployed function URL:
- `https://<YOUR_PROJECT_REF>.functions.supabase.co/stripe-webhook`

Copy the webhook signing secret from Stripe and set `STRIPE_WEBHOOK_SECRET` via `supabase secrets set ...`.

## 5) Minimal deployment instructions

### 5.1 Supabase (backend)
1. Create a Supabase project.
2. Apply migrations (see §3.2).
3. Create a private Storage bucket named `gallery-assets`.
4. Deploy Edge Functions and set secrets (see §4).

### 5.2 Frontend (Vite React)
Deploy to any static hosting that supports SPA routing (e.g., Vercel/Netlify/Cloudflare Pages).

Minimum requirements:
1. Set build command to your standard Vite build (commonly `npm run build`).
2. Set output directory to Vite’s build output (commonly `dist`).
3. Configure SPA rewrites so all routes serve `index.html`.
4. Configure environment variables in the hosting provider:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - (optional) `VITE_STRIPE_PUBLISHABLE_KEY`

## 6) Security notes (do not skip)
- Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, or `RESEND_API_KEY` in frontend env.
- Use Supabase RLS to protect private galleries/assets; validate anon vs authenticated access matches your intended sharing model.
- Treat `.env.local` as developer-specific; do not commit it.
