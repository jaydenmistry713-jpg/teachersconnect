# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Teachers Connect is a static multi-page website for a London-based educator social community. It is deployed on Netlify at `teachersconnect.com`. There is no build system, package manager, or framework — every page is a self-contained HTML file.

## Development

To preview the site locally, open any `.html` file directly in a browser, or use a simple static server:

```bash
npx serve .
# or
python -m http.server 8080
```

Deployment is handled by Netlify automatically on push; there is no build step.

## Architecture

**No shared files.** Each HTML page (`index.html`, `about.html`, `gallery.html`, `faq.html`, `contact.html`) is fully self-contained: CSS lives in a `<style>` block in `<head>`, JavaScript lives in a `<script>` block before `</body>`. Navigation, footer, and the entire CSS variable set are duplicated in every file.

**Consequence**: any change to the nav, footer, or shared styles must be applied to all five HTML files manually.

**CSS custom properties** are defined in `:root` at the top of each page's `<style>` block. The primary color scale is slightly inconsistent between pages — `index.html`, `about.html`, and `gallery.html` use a teal-based primary palette (`--primary-500: #008A96`), while `contact.html` and `faq.html` define a purple-based scale (`--primary-500: #8B5CF6`) but override `--primary-600` back to the teal `#008A96`. When touching colors, check which palette the target page uses.

**Brand colors** (consistent across all pages via `--rainbow`):
- Red `#B33127`, Orange `#D17219`, Green `#689832`, Teal `#008A96`, Purple `#451E5B`

**Fonts** (loaded from Google Fonts on all pages):
- `Inter` — body text and headings
- `Playfair Display` — italic accent text (`var(--font-accent)`)
- `Syne` — display headings on `index.html`, `about.html`, `gallery.html` (not used on `contact.html`/`faq.html`)

## JavaScript patterns

All JS is vanilla, no libraries. Recurring patterns across pages:

- **Page loader** (`index.html`, `about.html`): dark full-screen overlay hidden on `window.load` via `.hidden` class.
- **Scroll-triggered animations**: elements with `[data-animate]` start at `opacity: 0; transform: translateY(30px)` and get `.animated` added by an `IntersectionObserver` (threshold 0.1). `data-delay` attribute adds a setTimeout offset in seconds.
- **Fixed header scroll state**: `window.scroll` toggles `.scrolled` on `#header` when `pageYOffset > 50`.
- **Mobile menu**: hamburger `#navToggle` toggles `.active` on both itself and `#mobileMenu`; `body.menu-open` disables scroll.
- **Contact form**: submits with `alert()` — no backend or form service is connected.

## Images

Event photos are stored as `.webp` files (`edwin01.webp` – `edwin06.webp`) and used in `gallery.html`. Favicons exist in multiple formats (`.ico`, 16×16, 32×32, 192×192, 512×512 PNG, Apple touch icon) and a PWA manifest (`site.webmanifest`) is present.

## SEO / crawl files

- `sitemap.xml` — lists all five pages; `<lastmod>` dates should be updated when pages change.
- `robots.txt` — allows all crawlers, disallows `/admin/` and `/private/`.
