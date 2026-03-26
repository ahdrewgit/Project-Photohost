## 1.Architecture design
```mermaid
graph TD
  A["User Browser"] --> B["React Frontend Application"]
  B --> C["Supabase JS SDK"]
  C --> D["Supabase Service (Auth/DB/Storage)"]
  B --> E["Stripe Checkout (Hosted)"]
  E --> F["Stripe Webhooks"]
  F --> G["Supabase Edge Functions"]
  G --> D
  G --> H["Email Provider (Resend)"]

  subgraph "Frontend Layer"
    B
  end

  subgraph "Service Layer (Supabase)"
    D
    G
  end

  subgraph "External Services"
    E
    F
    H
  end
```

## 2.Technology Description
- Frontend: React@18 + vite + tailwindcss@3
- Backend: Supabase (Auth + Postgres + Storage + Edge Functions)
- Payments: Stripe Checkout + Webhooks
- Email: Resend (called from Edge Functions)

## 3.Route definitions
| Route | Purpose |
|-------|---------|
| / | Entry page: product intro + photographer login/signup + client magic-link login |
| /admin | Photographer dashboard: galleries, uploads, proofing rules, invites, results, payments |
| /g/:galleryId | Client gallery viewer: proofing, comments, checkout, downloads |

## 4.API definitions (If it includes backend services)
### 4.1 Core API
1) Create Stripe checkout session
```
POST /functions/v1/stripe-create-checkout
```
Request (TypeScript)
```ts
type CreateCheckoutReq = {
  galleryId: string;
  priceCents: number;
  currency: "usd" | "eur" | string;
  successUrl: string;
  cancelUrl: string;
};
```
Response
```ts
type CreateCheckoutRes = { url: string };
```

2) Stripe webhook (server-to-server)
```
POST /functions/v1/stripe-webhook
```
- Verifies Stripe signature
- Marks order paid
- Creates download entitlement for the client + gallery

3) Send notification email (internal)
```
POST /functions/v1/notify
```
```ts
type NotifyReq = {
  template: "gallery_invite" | "new_comment";
  toEmail: string;
  payload: Record<string, string>;
};
```

## 5.Server architecture diagram (If it includes backend services)
```mermaid
graph TD
  A["Stripe / Frontend"] --> B["Edge Function Endpoint"]
  B --> C["Service Logic"]
  C --> D["Supabase SDK"]
  D --> E["Supabase Postgres/Storage"]

  subgraph "Edge Functions"
    B
    C
    D
  end
```

## 6.Data model(if applicable)
### 6.1 Data model definition
```mermaid
erDiagram
  PHOTOGRAPHER_PROFILE ||--o{ GALLERY : owns
  GALLERY ||--o{ ASSET : contains
  GALLERY ||--o{ GALLERY_CLIENT : invites
  CLIENT_PROFILE ||--o{ GALLERY_CLIENT : joins
  ASSET ||--o{ PROOF_MARK : proofed
  ASSET ||--o{ COMMENT : discussed
  CLIENT_PROFILE ||--o{ PROOF_MARK : creates
  CLIENT_PROFILE ||--o{ COMMENT : creates
  GALLERY ||--o{ ORDER : sells
  CLIENT_PROFILE ||--o{ ORDER : buys

  PHOTOGRAPHER_PROFILE {
    uuid user_id
    string display_name
  }
  CLIENT_PROFILE {
    uuid user_id
    string display_name
  }
  GALLERY {
    uuid id
    uuid photographer_user_id
    string title
    string status
    int favorite_limit
    boolean downloads_locked
    int price_cents
    string currency
    timestamptz published_at
  }
  ASSET {
    uuid id
    uuid gallery_id
    string storage_path_original
    string storage_path_thumb
    int sort_order
  }
  GALLERY_CLIENT {
    uuid id
    uuid gallery_id
    uuid client_user_id
  }
  PROOF_MARK {
    uuid id
    uuid asset_id
    uuid client_user_id
    boolean is_favorite
    int rating
  }
  COMMENT {
    uuid id
    uuid asset_id
    uuid author_user_id
    string body
    timestamptz created_at
  }
  ORDER {
    uuid id
    uuid gallery_id
    uuid client_user_id
    string stripe_session_id
    string status
    timestamptz paid_at
  }
```

### 6.2 Data Definition Language
```sql
CREATE TABLE photographer_profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT
);

CREATE TABLE client_profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT
);

CREATE TABLE galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_user_id UUID NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  favorite_limit INT DEFAULT 0,
  downloads_locked BOOLEAN NOT NULL DEFAULT true,
  price_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL,
  storage_path_original TEXT NOT NULL,
  storage_path_thumb TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE gallery_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL,
  client_user_id UUID NOT NULL
);

CREATE TABLE proof_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  client_user_id UUID NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  rating INT
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  author_user_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL,
  client_user_id UUID NOT NULL,
  stripe_session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  paid_at TIMESTAMPTZ
);

-- Permissions baseline (fine-tune with RLS policies)
GRANT SELECT ON galleries, assets TO anon;
GRANT ALL PRIVILEGES ON galleries, assets, gallery_clients, proof_marks, comments, orders TO authenticated;
```
