# Zamak Ledger — Project Handoff

**Point in time:** 2026-07-04, mid-session. This supersedes any earlier
handoff doc (an older `HANDOFF.md` may exist in `~/Downloads` — that one is
stale, from before this session's work).

**Repo:** `git@github.com:fergd/zamak-ledger.git` (renamed from
`fergd/diecasttracker` — GitHub auto-redirects the old URL, but update any
saved remotes/bookmarks when convenient)
**Branch:** `07-2026-app-rebuild` (full rebuild of an old Meteor app, preserved
on `main` — no decision yet on whether to keep `main` around long-term or
promote this branch over it)
**Deployment host:** `backupbox` (Debian, personal home server), reachable
only over Tailscale
**Service:** `zamak-ledger.service` (systemd), port `8420` — renamed from
`diecast-inventory.service` on 2026-07-04 (directory moved, venv rebuilt
from scratch since venv scripts bake in absolute paths, old unit disabled
and removed after the new one was confirmed working)
**Working directory on host:** `/home/christan/Projects/zamak-ledger`
(renamed from `/home/christan/Projects/carded_inventory`)

## What this is

A personal, single-user tool (no auth) for cataloging a Hot Wheels / Matchbox
diecast collection by photo — carded and loose, 1950s vintage through current
releases. Snap a photo, Claude vision reads it, it's validated against a real
reference database, priced against both a static guide and live eBay data,
and saved. Built to help decide what to sell and at what price. Functional
and data-dense by design, not a consumer app.

**App name is "Zamak Ledger"** (previously "Diecast Tracker", previously
"Diecast Inventory" — check for stray old references if anything looks off).
Named after zamak, the zinc alloy both Mattel and Matchbox have used for
diecast castings since the 1960s.

## Architecture

```
Phone (Tailscale) -> browser -> backupbox:8420
                                    |
                              static/index.html   (buildless, Material Web
                                                     via CDN import map,
                                                     custom dark theme)
                                    |
                                  app.py            (FastAPI backend)
                                    |
                    +---------------+----------------+
                    |               |                |
            vision_extract.py  match.py        live_pricing.py
            (Claude vision:    (exact SKU match  (eBay Browse API,
             reads card/base   first, else fuzzy  OAuth client-
             photos -> JSON)   name+series        credentials, cached
                                scoring against    by casting identity)
                                reference_
                                castings)
                    |               |                |
                    +---------------+----------------+
                                    |
                        inventory.db / reference.db  (SQLite)
```

## Tech stack

- **Backend:** FastAPI + Uvicorn, Python 3.12, SQLite (`inventory.db` for the
  collection, `reference.db` for ground-truth casting data — gitignored,
  never committed; each environment builds its own via the importers)
- **Vision/AI:** Anthropic API — `claude-haiku-4-5-20251001` for extraction
  and live pricing
- **Frontend:** Single `static/index.html`, no build step, `@material/web`
  (Material 3) via CDN import map, vanilla JS. Fully custom dark theme per a
  Figma Make design handoff (see "Frontend redesign" below) — this is NOT
  Material 3 baseline styling anymore, it's heavily retokened.
- **Deployment:** systemd on a home Debian box, Tailscale-only, no public
  exposure

## File inventory

| File | Purpose |
|---|---|
| `app.py` | FastAPI app — all routes, DB connection + auto-migration logic |
| `schema.sql` | Canonical schema for `inventory`, `reference_castings`, `live_price_cache` |
| `vision_extract.py` | Claude vision calls — separate prompts for carded vs. loose |
| `match.py` | Exact-SKU match first, else per-candidate name+series scoring against `reference_castings` |
| `live_pricing.py` | Live eBay pricing via eBay's own Browse API (active listings only), cached by casting identity - requires `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` env vars |
| `reference_import.py` | Hot Wheels importer — South Texas Diecast, 2013-2018 |
| `reference_import_hallsguide.py` | Hot Wheels importer — Hallsguide, 2000-2026 (superseded in practice by the wiki importer below, but still valid) |
| `reference_import_hotwheels_wiki.py` | Hot Wheels importer — Fandom wiki via MediaWiki API (bypasses Cloudflare), 2000-2026, includes photo refs |
| `reference_import_matchbox.py` | Matchbox importer — NCHWA.com, Regular Wheels (1953-1969) + SuperFast (1969-1982) |
| `reference_import_realpriceguides.py` | Matchbox importer — realpriceguides.com, fills 1980s-90s gap NCHWA doesn't cover |
| `static/index.html` | Full frontend — capture flow, list, detail page, multi-select, sort, filters, sheets |
| `requirements.txt` | Python deps |
| `HANDOFF.md` | This file |

Current local `reference.db`: 10,170 Hot Wheels rows + 1,029 Matchbox rows.
Both `photo_path` and `base_photo_path` on inventory rows point into
`./photos/`, served at `/photos/<filename>`.

## API surface (`app.py`)

| Method | Route | Purpose |
|---|---|---|
| POST | `/scan` | Core pipeline: photo(s) → extraction → validation → pricing → save (always saves; frontend confirm/reject decides whether it stays) |
| GET | `/inventory` | List all items |
| GET | `/inventory/needs_review` | Items flagged for manual check (API-only, no dedicated UI) |
| POST | `/inventory/{id}/confirm` | Manual override: force-confirm a needs_review/no_match item |
| PUT | `/inventory/{id}` | Edit any tracked field (brand, casting name, sku, status, quantity, prices, etc.) |
| POST | `/inventory/{id}/photo` | Attach/replace a photo (`slot=main` or `slot=secondary` form field, defaults to secondary) |
| DELETE | `/inventory/{id}/photo` | Clear a single photo (`?slot=main\|secondary`) without deleting the item |
| DELETE | `/inventory/{id}` | Remove item + its photo files |
| GET | `/status` | Diagnostics: reference DB coverage, cache stats, API key check, inventory summary |
| GET | `/status/test_live_search` | Spends one real search to verify live-pricing end-to-end |
| GET | `/export` | Full JSON backup of inventory |

## Data model (`inventory` table, key fields)

Identification: `photo_path`, `base_photo_path`, `packaging_type`
(carded/loose), `extracted_brand`, `car_make` (real-world manufacturer, e.g.
"Chevrolet" — distinct from brand), `extracted_casting_name`,
`extracted_collector_num`, `extracted_sku`, `extracted_series`,
`extracted_year`, `extracted_color`.

Match result: `match_reference_id`, `match_confidence`, `match_status`
(confirmed/needs_review/no_match), `match_notes`, `canonical_brand`,
`canonical_casting_name`, `canonical_series`, `canonical_year`.

Pricing: `guide_price_usd` (static), `live_price_low_usd`,
`live_price_high_usd`, `live_recommended_price_usd`, `live_price_summary`,
`live_price_fetched_at` (real ISO timestamp now — was buggy, see below).

Your tracking: `condition`, `cost_basis_usd`, `status` (in_collection/
listed/sold), `listing_price_usd`, `sold_price_usd`, `quantity` (new —
how many physical copies of this exact casting+colorway+packaging).

## Frontend redesign (this session)

Went through several iterations based on a Figma Make design handoff with
screenshots:
1. Initial M3-purple redesign (filled cards, detail page, multi-select, sort)
2. Full Figma Make dark theme reskin (Zamak Ledger colors: `#0B0B0F`
   background, `#FF4500` primary red, Rajdhani/Inter/DM Mono fonts)
3. Corrections after real-device testing caught real misses: FAB moved to a
   true fixed bottom-right position (was inline at top), list rows became
   plain divided rows (not individually-bordered cards), hand-built bottom
   sheets replaced every `md-dialog` (Material Web has no sheet component)
4. Batch scanning mode was built, tested, and **removed** — the long-press-
   to-stop gesture didn't work well in practice. If revisited, needs a
   different interaction (a native camera capture can't be scripted/looped,
   so "auto-scan every N seconds" isn't literally achievable — batch mode
   only ever meant "skip the confirm sheet between manual taps")
5. Added: swipe left on a list row → delete confirm; swipe right → cycles
   collection status; long-press on a detail-page photo → replace/delete;
   lightbox with pinch-zoom on detail photos; duplicate detection (see below)

**Known hand-rolled pieces** (none of these exist in `@material/web`, all
built from pointer events / plain CSS):
- Bottom sheets (scrim + slide-up transition)
- Swipe-to-delete / swipe-to-cycle-status on list rows (direction-locked:
  doesn't classify as swipe-vs-scroll until movement in one axis clearly
  dominates — an earlier version only checked horizontal movement and
  broke normal scrolling)
- Lightbox pinch-to-zoom (two-pointer distance tracking, clamped 1-4x)
- Fixed FAB position (`right: max(20px, calc(50vw - 240px + 20px))` — stays
  aligned with the centered 480px column even on wide viewports)

## Key bugs fixed this session (worth knowing about if something looks off)

1. **Photos weren't servable at all** until `/photos` static mount was added
   — they were being saved but had no route.
2. **`live_price_fetched_at` stored the literal string `"now"`**, not a real
   timestamp — broke any "updated N days ago" freshness display. Fixed to a
   real `datetime.utcnow().isoformat()`.
3. **Live price JSON parsing** broke whenever Claude added a sentence of
   narration before the ` ```json ` fence (common in real responses) — was
   only stripping a fence at the very start of the text. Now extracts the
   fenced block (or outermost `{...}`) from anywhere in the text.
4. **Live pricing search omitted brand and sku** — was searching with just
   casting name + series + year, missing the two strongest search terms
   sellers actually put in listing titles.
5. **`match.py` silently collapsed same-named reference rows.** Building a
   `casting_name -> row` dict before fuzzy-scoring means any casting reissued
   across multiple years/series under an identical name (common — e.g. one
   casting had 8 reference rows) collapsed down to whichever the SQL query
   happened to return last, discarding the rest *before scoring ran at all*.
   Series was only a post-hoc penalty, not part of picking the candidate.
   Now every candidate row is scored individually and series breaks ties.
6. **Scroll-vs-tap on list rows**: only horizontal movement was checked to
   decide "was this a tap" — a vertical scroll (near-zero horizontal
   movement) always misread as a tap and opened the detail page. Fixed with
   proper direction-locking.
7. **Loose-car scanning could hang indefinitely with no error.** The base-
   photo button was shown before the front photo was taken (loose-only quirk
   — carded's button was already correctly gated). Tapping it first silently
   no-op'd (the submit function bails without a front photo) while the
   button's own label had already optimistically flipped to "scanning...".
   Fixed by gating the button the same way for both packaging types.
8. **`vision_extract.py`'s sku-location hint said "usually near the
   barcode"** — misleading on cards where it's elsewhere (confirmed: one
   card had it near the hang-tab notch, nowhere near the barcode), causing
   the sku to go unread entirely. Broadened the guidance.
9. **`_sku_match`'s exact-equality check silently failed whenever
   extraction merged the short code + dash-suffix into one string** (e.g.
   "DHX47-D9B0F" instead of just "DHX47") — confirmed 3 of 7 real scans in
   one session hit this, despite the extraction prompt asking for them to
   be split into separate fields. Falls through to fuzzy name matching on
   every miss, which can land on a wrong or even mislabeled reference row.
   Now also tries the portion before the first dash.
10. **Live pricing replaced entirely - Claude's `web_search` tool turned
    out to be structurally incapable of this.** Confirmed by inspecting the
    raw API response: a `web_search_tool_result` block only ever contains
    `title`/`url`/`page_age`/an opaque `encrypted_content` blob - no page
    content or price field exists to read, so the model could find the
    exact right listing and still never know its price. Direct HTML
    scraping of eBay listing pages was tried and rejected - confirmed 403
    bot-detection block from two different networks, and deliberately
    evading that wasn't something to build around. Replaced with eBay's
    own Browse API (OAuth client-credentials, no scraping) - requires
    `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` env vars from a Production
    keyset at developer.ebay.com. Only returns active-listing prices, not
    sold/completed data (that needs eBay's separately-gated Marketplace
    Insights API) - summaries say so explicitly, never claim sold-comps
    data that isn't there.

## Outstanding / next steps

- [ ] **eBay API credentials not yet set on backupbox** — `EBAY_CLIENT_ID`/
      `EBAY_CLIENT_SECRET` need to be added to the systemd service
      environment (same place `ANTHROPIC_API_KEY` lives) before live
      pricing will work at all. Check `/status` for `ebay_api_configured`.
- [ ] **Verify the latest commits' fixes on-device** — sku-suffix fix and
      the eBay pricing switchover both need real confirmation once
      credentials are in place.
- [ ] No UI for `/inventory/needs_review` yet — API-only.
- [ ] No auth — fine while Tailscale is the boundary.
- [ ] Matchbox reference coverage still thinner than Hot Wheels (1,029 vs.
      10,170 rows) — no sku data for Matchbox at all yet, so Matchbox items
      always go through fuzzy name matching, never exact-sku.
- [ ] "Add to total" duplicate merge has no undo — bumping quantity and
      deleting the duplicate scan is immediate and final.
- [ ] Open question, unresolved: keep `main` (old Meteor app) as permanent
      history, or eventually promote this branch over it.

## Deploying a change (the loop that works)

**No hot-reload** — `static/index.html` is served fresh from disk on every
request (so pure frontend edits are live immediately after `git pull`, no
restart needed), but any `app.py`/`.py` change requires a restart or the old
code keeps running silently.

```bash
# local machine
git add <files>
git commit -m "..."
git push

# on backupbox (or via ssh christan@backupbox "...")
cd ~/Projects/zamak-ledger
git pull
sudo systemctl restart zamak-ledger        # only strictly needed for .py changes
curl -s http://localhost:8420/status       # confirm the new code is actually live
```

Verify a restart actually landed by checking
`systemctl show zamak-ledger -p ActiveEnterTimestamp` against the
commit time — this session hit more than one case where a requested restart
silently didn't happen and stale code kept running.

## Cost model (approximate)

- Extraction (Haiku, per scan): ~$0.002-0.003
- Live pricing (eBay Browse API, per **distinct casting**, not per scan): no
  per-call dollar cost, counts against eBay's free-tier daily call quota
  instead (check developer.ebay.com dashboard for the current limit) - $0/
  no quota use for repeat scans of an already-cached casting within 30 days
