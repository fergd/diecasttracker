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

- **`/inventory/needs_review` UI.** API-only right now (`curl
  http://localhost:8420/inventory/needs_review`).
- **Auth.** Wide open on your tailnet, fine as long as Tailscale stays the
  access boundary.

## Hot Wheels 2019+ reference data (Hallsguide)

South Texas Diecast's per-year pages stop at 2018 (their site pivoted to a
different content model after that). For 2019 onward, use Hall's Guide
instead - actively maintained, covers 2000-2026 continuously plus the full
1968-1999 Redline era:

```bash
python reference_import_hallsguide.py --years 2019 2020 2021 2022 2023 2024 2025 2026
```

Verified against real fetched HTML before being handed over (not just
guessed from rendered text) - including the trickiest case: casting names
that contain their own parentheses (e.g. "Nissan Skyline GT-R (BNR32)"),
which could easily be misparsed as the series name if you grab the wrong
parenthetical group. Treasure Hunt / Super TH variant prices are
deliberately excluded from the averaged guide price, since blending a rare
$35 chase price into a $2-3 mainline casting's "typical value" would be
misleading.

## Matchbox reference data (vintage 1953-1982)

Since Hot Wheels didn't exist until 1968, anything older in your collection
is almost certainly Matchbox (Lesney's original line launched in 1953). This
is a separate importer from `reference_import.py`, since the source site is
organized differently:

```bash
python reference_import_matchbox.py --era regular      # 1953-1969, pre-Hot-Wheels vintage
python reference_import_matchbox.py --era superfast     # 1969-1982
python reference_import_matchbox.py --era all           # both (default)
```

Source is NCHWA.com's Lesney Matchbox price guide - a hobbyist-maintained
site (not official Mattel/Lesney data), organized by model number range
(1-10, 11-20, etc.) rather than by year, since Matchbox's "1-75" numbering
scheme had multiple different castings occupy the same number slot over the
years (e.g. "1-A" 1953 Diesel Roller and "1-E" 1968 Mercedes Benz Lorry both
held slot #1, at different times). Pricing uses NCHWA's own "Star Value"
rarity scale rather than direct dollar figures - the importer decodes this
into an approximate USD midpoint. Values are explicitly loose/near-mint
only (no box/card values in this guide), which matches what vintage
Matchbox from this era actually needs.

Worth a first-run sanity check: this parser was built from the site's known
page structure but not executed against the live site from this dev
environment (the domain isn't reachable from here) - after running it for
real, spot-check a couple of models you actually own against what gets
imported before fully trusting the price estimates.
