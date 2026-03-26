# Page Design Specification (Desktop-first)

## Global Styles (All Pages)
- Layout system: CSS Grid for page scaffolding + Flexbox within components.
- Max content width: 1200px (centered) for marketing/auth; 1440px for admin/gallery.
- Spacing scale: 4/8/12/16/24/32/48.
- Typography: Inter/system; base 16px; H1 32–36, H2 24–28, H3 18–20.
- Colors (light):
  - Background: #0B0D12 (app shell) + #FFFFFF (cards)
  - Text: #0F172A; Muted: #64748B
  - Primary: #2563EB; Success: #16A34A; Danger: #DC2626
  - Borders: #E2E8F0; Focus ring: primary @ 30%.
- Buttons: primary solid, secondary outline; hover darken; disabled 50% opacity.
- Links: underline on hover only.
- Media: thumbnails as 1:1 cropped; originals fit contain in lightbox.
- Breakpoints: >=1200 desktop; 768–1199 tablet; <768 stacked mobile.

---

## 1) Auth / Entry Page
### Meta Information
- Title: “PhotoHost – Private Client Galleries”
- Description: “Deliver private galleries, proofing, and paid downloads.”
- OG: title + short description.

### Page Structure
- Two-column desktop layout (CSS Grid 2fr/1fr):
  - Left: marketing value + feature bullets.
  - Right: auth card with tabs.

### Sections & Components
1. Top bar
   - Left: logo/name.
   - Right: “Photographer Login”, “Client Access” anchor links.
2. Marketing panel
   - Hero headline + 2-line subhead.
   - Bullets: “Proofing”, “Comments”, “Pay-to-unlock”, “Cloud storage”.
3. Auth card
   - Tab switch: Photographer / Client.
   - Photographer tab:
     - Email, password, “Create account”, “Forgot password”.
   - Client tab:
     - Email field + “Send magic link”.
     - State messaging: sent, expired, invalid.
4. Footer
   - Minimal: terms/privacy placeholders.

### Interaction States
- Inline validation (email format, required fields).
- Loading states for auth submit; error banner.

---

## 2) Photographer Admin Dashboard
### Meta Information
- Title: “Dashboard – PhotoHost”
- Description: “Manage galleries, proofing, and delivery.”

### Page Structure
- App shell: left sidebar + main content (CSS Grid: 260px / 1fr).
- Main uses stacked sections with cards.

### Sections & Components
1. Sidebar
   - Nav items: Galleries, Uploads (contextual), Clients/Invites, Payments, Settings.
   - Bottom: user menu (profile, sign out).
2. Header row (main)
   - Breadcrumb: Galleries / {Gallery Name}.
   - Primary CTA: “New gallery” or “Upload photos” (contextual).
3. Gallery List (default view)
   - Table/card list: title, status (draft/published), clients, last activity.
   - Row actions: open, rename, archive.
4. Gallery Detail (when selected)
   - Tabs: Assets, Proofing, Clients, Results, Payments.
   - Assets tab:
     - Upload dropzone (multi-file) with progress.
     - Asset grid with thumbnail, reorder (drag), delete.
   - Proofing tab:
     - Toggles: enable favorites/ratings.
     - Favorite limit input (0 = unlimited).
     - Save settings (sticky action bar).
   - Clients tab:
     - Invite form (email list) + send.
     - Invited clients list + revoke.
   - Results tab:
     - Summary metrics: total favorites, average rating.
     - Filter: favorites only, rating >= N.
     - Export CSV.
   - Payments tab:
     - Toggle: downloads locked until paid.
     - Price + currency.
     - Orders list (status, paid_at).

### Responsive Behavior
- Tablet: sidebar collapses to icon rail.
- Mobile: sidebar becomes drawer; tables become cards.

---

## 3) Client Gallery Viewer
### Meta Information
- Title: “Gallery – {Gallery Title}”
- Description: “Private proofing gallery.”

### Page Structure
- Top navigation + content area.
- Content: thumbnail grid; lightbox overlay.

### Sections & Components
1. Top bar
   - Left: gallery title.
   - Right: proofing status (“3/20 favorites”), “Checkout to download” or “Downloads unlocked”, user menu.
2. Thumbnail Grid
   - CSS Grid responsive: 6 columns desktop, 3 tablet, 2 mobile.
   - Each tile: thumbnail, favorite icon, rating control (compact), comment count badge.
3. Lightbox Viewer
   - Fullscreen overlay with:
     - Large image (progressive: thumb → full).
     - Proofing panel: favorite toggle + rating selector.
     - Comments drawer: thread + input.
     - Download button (disabled/locked until paid).
4. Paywall + Checkout
   - If locked: inline banner explaining download lock + price.
   - “Unlock downloads” button opens Stripe Checkout (new tab/redirect).
   - On return: show success state and enable downloads.

### Interaction States
- Enforce favorite limit:
  - When at limit, additional favorite attempts show modal/toast and do not persist.
- Optimistic UI for favorites/ratings/comments with rollback on error.
- Download states: locked tooltip; unlocked triggers signed URL download.
