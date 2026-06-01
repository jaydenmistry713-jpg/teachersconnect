# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Teachers Connect is a website for a London-based educator social community. It is deployed on Netlify at `teachersconnect.com` (currently at `teachersconnectv2.netlify.app` during transition). The frontend is static HTML with no build system or framework. The backend runs as Netlify Functions (Node.js serverless) backed by Supabase (PostgreSQL) for data and Stripe for payments.

## Development

To preview the site locally, open any `.html` file directly in a browser, or use a simple static server:

```bash
npx serve .
# or
python -m http.server 8080
```

To test functions locally:
```bash
npm install
npx netlify dev
```

Deployment is automatic on push to `main` via Netlify CI. No build step for the HTML — Netlify Functions are bundled by esbuild automatically.

## Architecture

### Frontend
**No shared files.** Each HTML page (`index.html`, `about.html`, `gallery.html`, `faq.html`, `contact.html`, `events.html`) is fully self-contained: CSS lives in a `<style>` block in `<head>`, JavaScript lives in a `<script>` block before `</body>`. Navigation, footer, and the entire CSS variable set are duplicated in every file.

**Consequence**: any change to the nav, footer, or shared styles must be applied to all six HTML files manually.

**CSS custom properties** are defined in `:root` at the top of each page's `<style>` block. The primary color scale is slightly inconsistent between pages — `index.html`, `about.html`, `gallery.html`, and `events.html` use a teal-based primary palette (`--primary-500: #008A96`), while `contact.html` and `faq.html` define a purple-based scale (`--primary-500: #8B5CF6`) but override `--primary-600` back to the teal `#008A96`. When touching colors, check which palette the target page uses.

**Accent / brand color**: `#008A96` (teal) is the primary accent used for highlighted text, buttons, and decorative elements across all pages. The `--rainbow` CSS variable is defined but no longer used for visible text — all gradient text was replaced with solid `#008A96`.

**Brand colors** (consistent across all pages):
- Red `#B33127`, Orange `#D17219`, Green `#689832`, Teal `#008A96`, Purple `#451E5B`

**Fonts** (loaded from Google Fonts on all pages):
- `Inter` — body text and headings
- `Playfair Display` — italic accent text (`var(--font-accent)`)
- `Syne` — display headings on `index.html`, `about.html`, `gallery.html`, `events.html` (not used on `contact.html`/`faq.html`)

**Footer credit**: all pages include "Website Created by [Mistuzzo](https://mistuzzo.com)" in the footer bottom bar.

### Backend — Netlify Functions (`netlify/functions/`)

All functions use CommonJS (`require`/`module.exports`) and are bundled with esbuild. Dependencies are declared in `package.json`.

| Function | Method | Auth | Purpose |
|---|---|---|---|
| `get-events` | GET | Public | Fetch active events; `?featured=true` returns only featured events |
| `create-payment-intent` | POST | Public | Create Stripe PaymentIntent, save pending ticket |
| `stripe-webhook` | POST | Stripe signature | Mark ticket paid, send confirmation emails (buyer + owner) |
| `admin-get-events` | GET | Admin password | All events (with ticket_types) for admin panel |
| `admin-create-event` | POST | Admin password | Create event + ticket types |
| `admin-update-event` | PUT | Admin password | Update event + sync ticket types (update existing, insert new, delete removed) |
| `admin-delete-event` | DELETE | Admin password | Delete event |
| `admin-get-tickets` | GET | Admin password | All ticket purchases, filterable by event |
| `admin-upload-image` | POST | Admin password | Upload event image to Supabase Storage, return public URL |

Admin functions are protected by checking `event.headers['x-admin-password'] === process.env.ADMIN_PASSWORD`.

### Database — Supabase (PostgreSQL)

Three tables (see `supabase-schema.sql`):
- `events` — id, name, date, location, description, price (pence), capacity, tickets_sold, image_url, show_availability, active, featured, created_at
- `tickets` — id, event_id, ticket_type_id (nullable), ticket_type_name (nullable), buyer_name, buyer_email, buyer_phone, quantity, stripe_payment_intent_id, amount_paid (pence), status (pending/paid/refunded), created_at
- `ticket_types` — id, event_id, name, price (pence), capacity, tickets_sold, active, sort_order, created_at

**Prices are always stored in pence (integers).** Divide by 100 for display; multiply by 100 when writing. The admin panel converts automatically.

**`image_url`** (TEXT, nullable) — public URL of the event's uploaded image, stored in Supabase Storage bucket `event-images`. If null, event cards show a teal gradient placeholder.

**`show_availability`** (BOOLEAN, default true) — controls whether the "X left" / "Sold out" badge is shown on the public event card **and** whether the per-ticket-type remaining count is shown in the checkout modal's type selector. When false, availability counts are hidden in both places; "Sold out" still appears on disabled ticket type options so users know why they can't select them.

**`featured`** (BOOLEAN, default false) — controls whether the event appears on the homepage. Non-featured events are only shown on `events.html`. Toggled per-event in the admin panel.

**Ticket types**: events can have zero or more ticket types (e.g. General Admission, VIP). If an event has ticket types, the checkout modal shows a type selector and uses the selected type's price and capacity. If no ticket types exist, the event's single price/capacity is used (backwards compatible).

**Ticket type update strategy** (`admin-update-event`): ticket types are synced, not replaced. Existing rows are updated in place (preserving `tickets_sold`), new rows are inserted, and removed rows are deleted — but only after first nullifying `tickets.ticket_type_id` references to avoid a FK constraint violation. The admin UI tracks each ticket type's DB `id` via a `data-id` attribute on the row element so the backend can distinguish updates from new inserts. **Do not revert to delete-all + insert-all** — that pattern silently fails the DELETE when purchased tickets reference a ticket type, causing duplicates on every save.

**RPC functions**:
- `increment_tickets_sold(event_id_param, qty_param)` — atomically increments `events.tickets_sold`
- `increment_ticket_type_sold(ticket_type_id_param, qty_param)` — atomically increments `ticket_types.tickets_sold`

### Supabase Storage

Bucket name: **`event-images`** (public). Images are uploaded via `admin-upload-image` function using the service key. The function converts a base64-encoded image sent from the admin browser into a Buffer and uploads it with a timestamped random filename. The public URL is then stored in `events.image_url`.

### Ticket purchase flow

1. Homepage fetches `get-events?featured=true` → renders featured event cards only
2. `events.html` fetches `get-events` (no filter) → renders all active events
3. User clicks "Buy Tickets" → checkout modal opens
4. If event has ticket types: step 0 shows type selector (auto-selects first available)
5. Step 1: name, email, phone, quantity → POST to `create-payment-intent` (with optional `ticket_type_id`) → returns Stripe `client_secret`
6. Step 2: Stripe Payment Element mounts → user pays
7. `stripe.confirmPayment()` called with `redirect: 'if_required'`
8. Stripe fires `payment_intent.succeeded` webhook → `stripe-webhook` marks ticket paid, increments both `events.tickets_sold` and `ticket_types.tickets_sold` (if applicable), sends two emails via Resend
9. Step 3: success screen shown to user

### Admin panel — `/admin/index.html`

Single-page admin app. Password stored in `sessionStorage` after login and sent as `x-admin-password` header on every API call. Two tabs:
- **Events** — stats row, create/edit/delete events via modal form. Event form fields: name, date/time, image upload, location, description, price, capacity, active toggle, show-availability toggle, featured toggle, ticket types section (add/remove rows with name/price/capacity). Each event row has a **Guest List** button that downloads a CSV of paid tickets for that event.
- **Tickets** — filterable by event, full CSV export of all tickets

**Image upload flow in admin**: selecting a file shows an instant preview. On form submit, the file is read as base64 and POSTed to `admin-upload-image` before the event is saved.

**Mobile layout**: on screens ≤768px the sidebar is hidden and replaced by a fixed bottom tab bar (Events | Tickets). Both tables collapse into stacked cards.

### Events grid

Event cards are rendered dynamically by JS into `#events-grid-container` on both `index.html` and `events.html`. The grid uses `.events-grid` CSS class:
- `grid-template-columns: repeat(auto-fit, minmax(300px, 380px))` with `justify-content: center`
- Cards show "From £X.XX" when an event has multiple ticket types at different prices

### Netlify Forms

Two forms are registered with Netlify:
- **`newsletter`** — mailing list signup on `index.html`
- **`contact`** — inquiry form on `contact.html`

Both use `data-netlify="true"`, a `name` attribute, and a `<input type="hidden" name="form-name">` field. Submissions are POSTed to `/` via `fetch` with `Content-Type: application/x-www-form-urlencoded`.

### Email — Resend

Domain `theteachersconnect.com` is verified in Resend. Two emails sent from `stripe-webhook` on every successful payment:
1. **Buyer confirmation** — sent to the ticket purchaser with event name, date, location, ticket type (if applicable), quantity, amount paid, and booking ref.
2. **Owner notification** — sent to `edwin@theteachersconnect.com` with full buyer info including ticket type.

`RESEND_FROM_EMAIL` is set to `edwin@theteachersconnect.com` in Netlify env vars.

**Timezone**: event dates in emails are formatted with `timeZone: 'UTC'`.

## Environment variables

Set in Netlify dashboard — never committed to the repo. See `.env.example` for the full list:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `ADMIN_PASSWORD`

The Stripe **publishable key** (`pk_live_`) is hardcoded in `index.html` and `events.html` — this is intentional as it is designed to be public. Both files use the owner's live Stripe key.

## Going to production checklist

- [x] Swap `pk_test_` → `pk_live_` in `index.html` and `events.html`
- [x] Update `STRIPE_SECRET_KEY` env var to owner's live key
- [x] Add Stripe webhook endpoint and update `STRIPE_WEBHOOK_SECRET`
- [x] Verify `theteachersconnect.com` domain in Resend
- [x] Update `RESEND_FROM_EMAIL` to `edwin@theteachersconnect.com`
- [x] Update owner notification `to` address to `edwin@theteachersconnect.com`
- [ ] Point `theteachersconnect.com` DNS to this Netlify site
- [ ] Run Supabase SQL migrations for `featured`, `ticket_types`, `ticket_type_id`/`ticket_type_name` on tickets

## Work in progress — Trustpilot reviews section

`index-trustpilot.html` is a local-only copy of `index.html` (excluded from git via `.gitignore`) where the Trustpilot reviews section is being developed. It replaces the existing testimonials section with a custom Trustpilot-styled widget: a Trustpilot logo/branding header linking to the real profile, three skeleton review card placeholders, and a "Leave us a review on Trustpilot" CTA button. The skeleton cards are intentionally empty — real reviews will be pasted in manually as they come in on Trustpilot.

**When ready to go live**: copy the CSS block (`/* ==================== TRUSTPILOT SECTION ====================*/` through the closing media queries) and the `<!-- Trustpilot Reviews Section -->` HTML block from `index-trustpilot.html` into `index.html`, replacing the existing `<!-- Testimonials Section -->` block.

## JavaScript patterns

All frontend JS is vanilla, no libraries (except Stripe.js loaded from CDN). Recurring patterns:

- **Page loader** (`index.html`, `about.html`): dark full-screen overlay hidden on `window.load` via `.hidden` class.
- **Scroll-triggered animations**: elements with `[data-animate]` start at `opacity: 0; transform: translateY(30px)` and get `.animated` added by an `IntersectionObserver` (threshold 0.1). `data-delay` attribute adds a setTimeout offset in seconds.
- **Fixed header scroll state**: `window.scroll` toggles `.scrolled` on `#header` when `pageYOffset > 50`.
- **Mobile menu**: hamburger `#navToggle` toggles `.active` on both itself and `#mobileMenu`; `body.menu-open` disables scroll.
- **Checkout state**: `checkoutEvent`, `checkoutQty`, `checkoutTicketType` track the current purchase. `checkoutTicketType` is `null` for single-price events.

## Event date/time — timezone handling

Event times are stored and displayed as **wall-clock UTC**. The rule is: whatever time the admin types in the form is the time every visitor sees, regardless of where either person's browser is located.

**How it works:**
- Admin submit sends `datetime-local` value with `+00:00` appended (e.g. `2026-05-27T14:00:00+00:00`), so JavaScript never applies a local-timezone offset before storing.
- All display code (`formatDate()` in `index.html`/`events.html`, admin list view, confirmation emails) uses `timeZone: 'UTC'` so the stored UTC hours are rendered as-is.

**Do not** use `new Date(value).toISOString()` to serialize the admin form date — that converts through the browser's local timezone and will shift the time for any admin not in UTC. Do not use `toLocaleTimeString` / `toLocaleDateString` without an explicit `timeZone: 'UTC'` option on any event date display.

## Images

Event images are uploaded via the admin panel and stored in Supabase Storage (`event-images` bucket). Gallery photos live in the `gallery/` folder — currently `edwin01.webp` – `edwin06.webp` (original `.webp` files) and `IMG_9746 Edwin.png` / `IMG_9764–IMG_9839 Edwin.jpeg` (11 newer photos). All 17 are referenced in `gallery.html` with paths like `gallery/edwin01.webp`. Favicons stay in the project root (`.ico`, 16×16, 32×32, 192×192, 512×512 PNG, Apple touch icon) and a PWA manifest (`site.webmanifest`) is present.

## SEO / crawl files

- `sitemap.xml` — lists all pages; `<lastmod>` dates should be updated when pages change.
- `robots.txt` — allows all crawlers, disallows `/admin/` and `/private/`.
