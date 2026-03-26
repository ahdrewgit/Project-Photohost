# PhotoHost (Pixieset Alternative)

Production-ready SaaS-style photography client proofing + delivery app.

## Tech
- React + Vite + Tailwind
- Supabase: Auth (email/password + magic link), Postgres (RLS), Storage (private), Edge Functions
- Stripe Checkout + webhook (unlock downloads)

## Local setup

### 1) Environment variables
Create `.env.local`:

```bash
cp .env.example .env.local
```

Fill in:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 2) Install and run
```bash
npm install
npm run dev
```

## Supabase setup (hosted)

### 1) Apply database migration
This repo includes SQL migrations under `supabase/migrations/`.

Using Supabase CLI (recommended):
```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push
```

### 2) Create Storage bucket
Create a private bucket named `gallery-assets`.

### 3) Deploy Edge Functions
```bash
npx supabase functions deploy create-invite
npx supabase functions deploy redeem-invite
npx supabase functions deploy asset-signed-url
npx supabase functions deploy asset-upload-urls
npx supabase functions deploy stripe-create-checkout
npx supabase functions deploy stripe-webhook
npx supabase functions deploy sync-entitlement
npx supabase functions deploy notify
```

### 4) Set Edge Function secrets
```bash
npx supabase secrets set STRIPE_SECRET_KEY=<...>
npx supabase secrets set STRIPE_WEBHOOK_SECRET=<...>
npx supabase secrets set RESEND_API_KEY=<...>
npx supabase secrets set RESEND_FROM=<...>
npx supabase secrets set PUBLIC_SITE_URL=<YOUR_FRONTEND_ORIGIN>
```

## Stripe setup

Create a webhook endpoint in Stripe Dashboard:
- URL: `https://<YOUR_PROJECT_REF>.functions.supabase.co/stripe-webhook`
- Events: `checkout.session.completed`

Copy the webhook signing secret and set `STRIPE_WEBHOOK_SECRET`.

## Usage

### Photographer
1. Open `/login` → Photographer tab.
2. Sign in (creates an account on first attempt) and confirm email if prompted.
3. Create a gallery, upload photos, publish.
4. Create an invite for a client email.

### Client
1. Open invite link → request magic link.
2. Click magic link → invite is redeemed → redirected to gallery.
3. Favorite and rate images, leave comments.
4. Pay to unlock downloads (Stripe Checkout).

## Deployment

Deploy the frontend as a static SPA (Vercel/Netlify/Cloudflare Pages) and configure an SPA rewrite so all routes serve `index.html`.

See `.trae/documents/build-handoff-supabase-photohost.md` for the full handoff.
