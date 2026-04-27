# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Teachers Connect is a website for a London-based educator social community. It is deployed on Netlify at `teachersconnect.com`. The frontend is static HTML with no build system or framework. The backend runs as Netlify Functions (Node.js serverless) backed by Supabase (PostgreSQL) for data and Stripe for payments.

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
**No shared files.** Each HTML page (`index.html`, `about.html`, `gallery.html`, `faq.html`, `contact.html`) is fully self-contained: CSS lives in a `<style>` block in `<head>`, JavaScript lives in a `<script>` block before `</body>`. Navigation, footer, and the entire CSS variable set are duplicated in every file.

**Consequence**: any change to the nav, footer, or shared styles must be applied to all five HTML files manually.

**CSS custom properties** are defined in `:root` at the top of each page's `<style>` block. The primary color scale is slightly inconsistent between pages — `index.html`, `about.html`, and `gallery.html` use a teal-based primary palette (`--primary-500: #008A96`), while `contact.html` and `faq.html` define a purple-based scale (`--primary-500: #8B5CF6`) but override `--primary-600` back to the teal `#008A96`. When touching colors, check which palette the target page uses.

**Brand colors** (consistent across all pages via `--rainbow`):
- Red `#B33127`, Orange `#D17219`, Green `#689832`, Teal `#008A96`, Purple `#451E5B`

**Fonts** (loaded from Google Fonts on all pages):
- `Inter` — body text and headings
- `Playfair Display` — italic accent text (`var(--font-accent)`)
- `Syne` — display headings on `index.html`, `about.html`, `gallery.html` (not used on `contact.html`/`faq.html`)

### Backend — Netlify Functions (`netlify/functions/`)

All functions use CommonJS (`require`/`module.exports`) and are bundled with esbuild. Dependencies are declared in `package.json`.

| Function | Method | Auth | Purpose |
|---|---|---|---|
| `get-events` | GET | Public | Fetch active events → homepage |
| `create-payment-intent` | POST | Public | Create Stripe PaymentIntent, save pending ticket |
| `stripe-webhook` | POST | Stripe signature | Mark ticket paid, send confirmation email |
| `admin-get-events` | GET | Admin password | All events for admin panel |
| `admin-create-event` | POST | Admin password | Create event |
| `admin-update-event` | PUT | Admin password | Update event |
| `admin-delete-event` | DELETE | Admin password | Delete event |
| `admin-get-tickets` | GET | Admin password | All ticket purchases, filterable by event |

Admin functions are protected by checking `event.headers['x-admin-password'] === process.env.ADMIN_PASSWORD`.

### Database — Supabase (PostgreSQL)

Two tables (see `supabase-schema.sql`):
- `events` — id, name, date, location, description, price (pence), capacity, tickets_sold, image_emoji, active, created_at
- `tickets` — id, event_id, buyer_name, buyer_email, buyer_phone, quantity, stripe_payment_intent_id, amount_paid (pence), status (pending/paid/refunded), created_at

**Prices are always stored in pence (integers).** Divide by 100 for display; multiply by 100 when writing. The admin panel converts automatically.

A Supabase RPC function `increment_tickets_sold(event_id_param, qty_param)` is used in the webhook to atomically increment `tickets_sold` after a successful payment.

### Ticket purchase flow

1. Homepage fetches `get-events` on load → renders event cards dynamically
2. User clicks "Buy Tickets" → checkout modal opens (3-step)
3. Step 1: name, email, phone, quantity → POST to `create-payment-intent` → returns Stripe `client_secret`
4. Step 2: Stripe Payment Element mounts using `client_secret` → user pays
5. `stripe.confirmPayment()` called with `redirect: 'if_required'` to keep payment on-page
6. Stripe fires `payment_intent.succeeded` webhook → `stripe-webhook` function marks ticket paid, increments `tickets_sold`, sends confirmation email via Resend
7. Step 3: success screen shown to user

### Admin panel — `/admin/index.html`

Single-page admin app. Password stored in `sessionStorage` after login and sent as `x-admin-password` header on every API call. Two tabs:
- **Events** — stats row, create/edit/delete events via modal form
- **Tickets** — filterable by event, CSV export

### Email — Resend

Confirmation emails sent from `stripe-webhook` via Resend API. Currently using `onboarding@resend.dev` (test/development only — only delivers to verified addresses). For production, switch `RESEND_FROM_EMAIL` to `tickets@teachersconnect.com` after verifying the domain in Resend.

## Environment variables

Set in Netlify dashboard — never committed to the repo. See `.env.example` for the full list:
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `ADMIN_PASSWORD`

The Stripe **publishable key** (`pk_test_` / `pk_live_`) is hardcoded in `index.html` — this is intentional as it is designed to be public. Currently set to the test key; swap to `pk_live_` when going to production along with updating `STRIPE_SECRET_KEY`.

## Going to production checklist

- [ ] Swap `pk_test_` → `pk_live_` in `index.html`
- [ ] Update `STRIPE_SECRET_KEY` env var to live key
- [ ] Add a new Stripe webhook endpoint for `teachersconnect.com` and update `STRIPE_WEBHOOK_SECRET`
- [ ] Verify `teachersconnect.com` domain in Resend and update `RESEND_FROM_EMAIL` to `tickets@teachersconnect.com`
- [ ] Connect live Netlify site to GitHub repo

## JavaScript patterns

All frontend JS is vanilla, no libraries (except Stripe.js loaded from CDN). Recurring patterns:

- **Page loader** (`index.html`, `about.html`): dark full-screen overlay hidden on `window.load` via `.hidden` class.
- **Scroll-triggered animations**: elements with `[data-animate]` start at `opacity: 0; transform: translateY(30px)` and get `.animated` added by an `IntersectionObserver` (threshold 0.1). `data-delay` attribute adds a setTimeout offset in seconds.
- **Fixed header scroll state**: `window.scroll` toggles `.scrolled` on `#header` when `pageYOffset > 50`.
- **Mobile menu**: hamburger `#navToggle` toggles `.active` on both itself and `#mobileMenu`; `body.menu-open` disables scroll.

## Images

Event photos are stored as `.webp` files (`edwin01.webp` – `edwin06.webp`) and used in `gallery.html`. Favicons exist in multiple formats (`.ico`, 16×16, 32×32, 192×192, 512×512 PNG, Apple touch icon) and a PWA manifest (`site.webmanifest`) is present.

## SEO / crawl files

- `sitemap.xml` — lists all five pages; `<lastmod>` dates should be updated when pages change.
- `robots.txt` — allows all crawlers, disallows `/admin/` and `/private/`.
