# Diecast Inventory

Photo -> vision extraction -> validated against real reference data -> priced
(guide + live) -> your own inventory DB.

Supports both **carded** (packaged) and **loose** (unpackaged) cars as
first-class, distinct paths, and layers a live web-search-backed price check
on top of a static guide-book price, with cost deliberately bounded by
casting identity rather than by scan count.

## Carded vs. loose

- **Carded**: identification comes from reading printed card text - reliable,
  one photo is enough.
- **Loose**: identification comes from a base/underside photo (casting name +
  copyright year, stamped into the metal). Without a base photo, identification
  falls back to a visual guess from body shape/color, which the validation
  layer refuses to auto-confirm even if it fuzzy-matches a real casting name -
  it lands in `needs_review` instead.

## Pricing: guide price + live price

- **Guide price** (`guide_price_usd`) comes from `reference_castings`, seeded
  from South Texas Diecast's checklist/price guide. Static, refreshed only
  when you rerun `reference_import.py`.
- **Live price** (`live_price_low_usd` / `live_price_high_usd`) comes from a
  real web search, using Claude's server-side `web_search` tool, run only when
  a scan actually matched a real casting (`confirmed` or `needs_review` - never
  for `no_match`, since there's nothing meaningful to price-check).

### Cost control - this is the part that actually matters

Web search is billed per search ($10/1,000, plus token cost for the results
themselves) - meaningfully more expensive than the extraction step. Three
things keep this bounded:

1. **Cached by casting identity, not by scan.** `live_price_cache` is keyed on
   (casting name, series, year, packaging type). Scanning five copies of the
   same casting triggers ONE live search total, not five.
2. **30-day cache lifetime.** A cached price is reused until it's over a month
   old, then refreshed on the next scan that needs it. Collectible prices don't
   move fast enough to justify a fresh search every time.
3. **`max_uses` cap per lookup.** Each live-price search is capped at 3 web
   searches max (`MAX_SEARCHES_PER_LOOKUP` in `live_pricing.py`), usually only
   needs 1-2 in practice.

Net effect: cost scales with the number of *distinct castings* you own, not
the number of cars you scan. A collection of a few hundred unique castings,
even scanned multiple times each, stays in the range of a few dollars total
for live pricing - not a few dollars *per scan*.

## Material Design frontend

`static/index.html` is built entirely on Google's `@material/web` component
library (Material 3), loaded buildlessly via CDN import map - no custom CSS
layout system, no hand-rolled color palette. Segmented buttons for the
Carded/Loose toggle, filled/outlined buttons for actions, `md-list`/
`md-list-item` for results, `md-dialog` for errors, all styled through
Material's own design tokens (`--md-sys-color-*`), which also means it follows
your phone's system light/dark mode automatically.

**Worth double-checking after deploying this update**: an earlier version of
this file was handed over as a zip right before the git migration happened,
and it's not fully confirmed that version ever actually made it onto
backupbox before the repo was initialized from whatever was on disk at the
time. Load the app fresh in a browser after pulling this update and confirm
you're seeing the segmented button toggle and Material-styled list, not the
older plain-CSS layout - if you see the old look, this file didn't actually
get replaced and is worth a second look.

## How it fits together

```
static/index.html   ->  phone camera capture: Carded/Loose toggle, base photo
                         prompt appears only in Loose mode
       |
app.py               ->  FastAPI backend, receives photo(s) + packaging_type
       |
vision_extract.py    ->  routes to CARDED_PROMPT or LOOSE_PROMPT, sends to Claude
       |
match.py              ->  fuzzy-matches against reference_castings, applies the
                          visual-only safeguard for loose cars, picks the right
                          guide price column
       |
live_pricing.py        ->  (confirmed/needs_review only) cached live price
                          check via Claude's web_search tool
       |
inventory.db             ->  stores extraction + validation + packaging_type +
                          guide price + live price + your own tracking fields
```

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Seed the reference DB - start with a few years you actually own cards from
python reference_import.py --years 2013 2014 2015 2016 2017 2018

export ANTHROPIC_API_KEY=sk-ant-...

uvicorn app:app --host 0.0.0.0 --port 8420
```

Running as a systemd service (`diecast-inventory.service`) is the deployed
setup on backupbox - see prior notes for the unit file, or ask for it again if
it's been lost.

## What's NOT built yet

- **Matchbox reference data.** South Texas Diecast's guide is Hot Wheels-only.
- **`/inventory/needs_review` UI.** API-only right now (`curl
  http://localhost:8420/inventory/needs_review`).
- **Auth.** Wide open on your tailnet, fine as long as Tailscale stays the
  access boundary.
