# Zamak Ledger — Project Handoff

**Point in time:** 2026-07-05, after a session covering the duplicate-scan
fix, brand dropdown, full in-app camera rebuild, and enabling HTTPS via
`tailscale serve`. This supersedes any earlier handoff doc (an older
`HANDOFF.md` may exist in `~/Downloads` — that one is stale, from before this
work).

**Repo:** `git@github.com:fergd/zamak-ledger.git` (renamed from
`fergd/diecasttracker` — GitHub auto-redirects the old URL, but update any
saved remotes/bookmarks when convenient)
**Branch:** `07-2026-app-rebuild` (full rebuild of an old Meteor app, preserved
on `main` — no decision yet on whether to keep `main` around long-term or
promote this branch over it)
**Deployment host:** `backupbox` (Debian, personal home server), reachable
only over Tailscale. As of 2026-07-05, served over HTTPS via
`tailscale serve --bg 8420` at `https://backupbox.tailfb9f14.ts.net/` —
**use this URL, not `http://backupbox:8420`**. The in-app camera (getUserMedia)
requires a secure context and silently falls back to a clunkier native-camera
flow over plain HTTP (see "In-app camera" below). `tailscale serve status`
on backupbox confirms the current proxy config.
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
Phone (Tailscale) -> https://backupbox.tailfb9f14.ts.net/ (tailscale serve)
                                    -> proxies to -> localhost:8420
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

## Storage locations (everything lives on backupbox, nothing in git)

- **`inventory.db`** — your collection: one row per scanned item, all the
  `extracted_*`/`canonical_*`/pricing/tracking fields. At
  `~/Projects/zamak-ledger/inventory.db` on backupbox.
- **`reference.db`** — ground-truth casting data (`reference_castings`,
  `live_price_cache`), rebuilt from the `reference_import_*.py` scripts, not
  your personal data. Same directory.
- **`photos/`** — every photo ever taken through the app, saved as a plain
  file named `<random-uuid>.<ext>` (no subfolders, no per-item structure).
  `inventory.db` rows just store the relative path string
  (`photo_path`/`base_photo_path`) and the app serves them back at
  `/photos/<filename>`. As of 2026-07-05: 143 files, ~246MB. **No backup
  beyond whatever backupbox itself has** — single point of failure, worth
  addressing if this collection data matters long-term.
- **`.env`** — `ANTHROPIC_API_KEY`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`.
  Same directory, gitignored.
- All four of the above are excluded from git (`.gitignore`: `*.db`,
  `photos/`, `.env`) and confirmed never committed in this repo's history on
  any branch, even though the repo itself is **public** on GitHub.

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
| `reference_import_hallsguide_matchbox.py` | Matchbox importer — Hall's Guide, 2009-2012 + 2016-2023 (fills the *modern* gap the two importers above don't touch at all — see bug #11 below) |
| `static/index.html` | Full frontend — capture flow, list, detail page, multi-select, sort, filters, sheets, toolbar summary |
| `requirements.txt` | Python deps |
| `HANDOFF.md` | This file |

Current backupbox `reference.db` (authoritative — check live, this number
moves): 13,475 Hot Wheels rows + 2,157 Matchbox rows. Both `photo_path` and
`base_photo_path` on inventory rows point into `./photos/`, served at
`/photos/<filename>`.

## API surface (`app.py`)

| Method | Route | Purpose |
|---|---|---|
| POST | `/scan` | Core pipeline: photo(s) → extraction → validation → pricing → save (always saves; frontend confirm/reject decides whether it stays) |
| GET | `/inventory` | List all items |
| GET | `/inventory/needs_review` | Items flagged for manual check (API-only, no dedicated UI) |
| POST | `/inventory/{id}/confirm` | Manual override: force-confirm a needs_review/no_match item |
| PUT | `/inventory/{id}` | Edit any tracked field (brand, casting name, sku, status, quantity, treasure_hunt, prices, etc.) |
| POST | `/inventory/{id}/photo` | Attach/replace a photo (`slot=main` or `slot=secondary` form field, defaults to secondary) |
| DELETE | `/inventory/{id}/photo` | Clear a single photo (`?slot=main\|secondary`) without deleting the item |
| POST | `/inventory/{id}/refresh_price` | Force a fresh eBay lookup for an already-saved item, bypassing the 30-day cache — user-triggered "recheck price" button on the detail page |
| POST | `/inventory/{id}/rematch` | Re-run `validate_extraction()` from the item's already-stored `extracted_*` fields (no new photo) — for no_match items stuck only because reference data has since improved. Detail-page button next to Match. Deployed and confirmed working 2026-07-05, including a `canonical_sku` refresh fix. |
| DELETE | `/inventory/{id}` | Remove item + its photo files |
| GET | `/status` | Diagnostics: reference DB coverage, cache stats, `anthropic_api_key_configured`, `ebay_api_configured`, inventory summary |
| GET | `/status/test_live_search` | Calls eBay's Browse API for real to verify the live-pricing pipeline end-to-end (counts against eBay's quota, not free) |
| GET | `/export` | Full JSON backup of inventory |

## Data model (`inventory` table, key fields)

Identification: `photo_path`, `base_photo_path`, `packaging_type`
(carded/loose), `extracted_brand`, `car_make` (real-world manufacturer, e.g.
"Chevrolet" — distinct from brand), `extracted_casting_name`,
`extracted_collector_num`, `extracted_sku`, `extracted_series`,
`extracted_year`, `extracted_color`, `treasure_hunt` (NULL / `'TH'` /
`'Super TH'` — same convention as `reference_castings.is_treasure_hunt`,
which exists but has never actually been populated by any importer).
Extraction looks for the actual TH logo, not just the printed words "Treasure
Hunt" (some cards only show the logo), plus the physical tells for Super TH
specifically (real rubber tires + Spectraflame paint) when there's no card
to read at all.

Match result: `match_reference_id`, `match_confidence`, `match_status`
(confirmed/needs_review/no_match), `match_notes`, `canonical_brand`,
`canonical_sku` (added 2026-07-05 — the resolved sku from the matched
reference row, used for duplicate-scan detection instead of the raw OCR'd
`extracted_sku`, which varies enough between rescans of the same physical
card to miss real duplicates), `canonical_casting_name`, `canonical_series`,
`canonical_year`.

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
6. Added: Treasure Hunt flame badge on list cards (amber for TH, pink for
   Super TH) and an editable 3-way toggle in the detail page's
   Identification section; a "recheck price" and a "recheck match" icon
   button in the Pricing/Match section headers respectively; a car count +
   estimated total value subtitle in the top toolbar (list mode only,
   reflects whatever's currently filtered, not a fixed grand total — sums
   `quantity`, uses the same per-item price priority as the list card, skips
   items with no price data at all rather than treating unknown as $0)

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
    data that isn't there. **Confirmed working end-to-end** with real
    OAuth tokens and real listing prices after credentials were set.
11. **eBay search query dropped casting name/year whenever a sku was
    available** - `[brand, sku or casting_name]` picked ONE term instead of
    combining them, backwards since sellers frequently don't include the
    Toy # in listing titles at all. Now combines brand + casting name +
    year + sku (+ "Treasure Hunt"/"Super Treasure Hunt" when applicable)
    into one query - more keywords for eBay's own relevance ranking, not a
    stricter match requirement.
12. **`showList()` never called `renderList()`** - it only toggled view
    visibility, so returning from the detail view after a price recheck or
    a saved edit left the list's actual DOM untouched even though `allItems`
    in memory was correctly updated. The list only refreshed by accident,
    whenever something else happened to trigger a re-render (sort, filter).
13. **Treasure Hunt price caching collided with the regular release's cache
    entry.** `get_live_price` computed a TH-suffixed cache key for the
    `_fetch_cached` read but the `INSERT...ON CONFLICT` write afterward
    still bound the plain casting name - so a Super TH lookup silently
    overwrote the regular release's cached price (caught by testing
    directly against the deployed DB: a $7 recommended price got replaced
    by $42). Fixed to use the suffixed key for both read and write.
14. **Matchbox items never matched anything modern - a real data gap, not
    a matching or vision bug.** Confirmed extraction correctly identifies
    `brand: "Matchbox"` every time; the reference DB's only Matchbox
    coverage was vintage (1953-1998), zero rows for anything 2000+. Fixed
    via `reference_import_hallsguide_matchbox.py` (see file inventory) -
    covers 2009-2012 and 2016-2023 (2013-2015 confirmed absent from the
    source entirely, 2018 deliberately excluded - see the importer's own
    docstring for why). Existing no_match items with correct extraction
    data just need `POST /inventory/{id}/rematch` once this is deployed,
    not a fresh scan.

## Session: 2026-07-05 — dedup fix, brand dropdown, camera rebuild, HTTPS

1. **Duplicate-scan detection was silently broken** - `findDuplicate()`
   (static/index.html) compared raw OCR'd fields with strict `===`, and
   never used `canonical_sku` (computed by `match.py` but never persisted or
   returned by `/scan`). Two scans of the identical physical card could OCR
   with different casing/whitespace and fail to match, adding a duplicate
   row instead of prompting to bump quantity. Fixed: added `canonical_sku`
   column (see Data model above), wired it through `/scan`'s response and
   the `/inventory/{id}/rematch` update, and normalized the dedup comparison
   (case/whitespace-insensitive, year cast to string).
2. **Brand field on the detail page is now a dropdown** (Hot Wheels,
   Matchbox, Tomica, Majorette, Greenlight, Johnny Lightning, M2 Machines,
   Maisto, Other) instead of free text. An existing out-of-list value gets
   injected as a temporary extra option rather than silently dropped.
3. **In-app camera capture, replacing the old native-camera handoff.**
   Full-screen `getUserMedia` live preview: FAB opens straight into it,
   front shot auto-advances directly into the back/base shot (no
   interstitial "add a second photo?" screen), Skip button lives inside the
   camera view itself. Controls (close, flash, flip camera) use inline
   Hugeicons SVGs pulled from `@hugeicons/core-free-icons` (MIT-licensed,
   matches the icon set the Figma layers were already named after - e.g.
   `car-05-stroke-rounded`). Scanning state is now a bottom sheet (matches
   existing sheet/scrim pattern) instead of a banner.
   - **This requires a secure context.** Confirmed the hard way: backupbox
     was plain HTTP (`tailscale serve status` -> "No serve config"), which
     silently disables `getUserMedia` on mobile browsers - the FAB looked
     unchanged and scanning just dead-ended with no way to proceed.
     `cameraSupported()` now gates on `window.isSecureContext` +
     `navigator.mediaDevices` and falls back to the native-camera flow
     (below) when unmet, rather than showing a dead-end error.
   - **HTTPS enabled 2026-07-05** via `tailscale serve --bg 8420` (see
     Deployment host note above) - the in-app camera is now live for real,
     not just as a fallback-gated code path.
4. **Native-camera fallback** (active whenever accessed without HTTPS): a
   real platform constraint, not a bug to code around - mobile browsers
   silently block auto-opening a second native-camera dialog from within
   the first one's `change` handler (confirmed via device testing: front
   photo captured, second dialog never opened, scan never submitted, no
   error). One tap between shots is unavoidable here. Landed on the
   lightest version of that: a small pill-shaped bar (`Skip` / `+ Back
   photo`), not a modal sheet.
5. **FAB was still Material's *extended* FAB** (`label="Scan a car"` forces
   a pill shape with visible text) even after the icon changed - fixed to a
   plain 48px icon-only circle, `#2c4666` per the Figma spec
   (node-id=10-199, icon annotated there as `CameraAdd01Icon`).
6. **Rematch button appeared to do nothing** - two real issues: (a) it
   never refreshed `canonical_sku` (missed when that column was added this
   session - confirmed via a direct endpoint test showing `match_status`
   correctly flipping `no_match` -> `confirmed` while `canonical_sku` stayed
   null), now fixed; (b) a rematch that legitimately finds no better match
   (the reference DB just doesn't cover that casting yet - common and not a
   bug) left the UI looking identical to before the click, indistinguishable
   from broken. Added a brief checkmark confirmation so the button always
   gives feedback that it ran.
7. **Repo is public on GitHub** (`fergd/zamak-ledger`) - confirmed via
   `gh repo view` and a full history scan (`git log --all --diff-filter=A`)
   that no `.env`, `.db`, or `photos/` file has ever been committed on any
   branch, and no hardcoded secrets exist in tracked source. Safe as-is;
   worth re-checking this if the deploy/db-copy workflow ever changes.

## Outstanding / next steps

- [x] ~~`/inventory/{id}/rematch` not deployed~~ — deployed and confirmed
      working 2026-07-05 (verified `no_match` -> `confirmed` end-to-end,
      including the `canonical_sku` refresh fix).
- [x] ~~Not served over HTTPS~~ — `tailscale serve` enabled 2026-07-05.
- [ ] **6 inventory items were sitting at `no_match`** as of the previous
      session (checked directly on backupbox) - worth a rematch pass now
      that both the importer coverage and the rematch endpoint are live; at
      least one (a 2014 Matchbox casting) has no reference coverage from
      *any* source yet and will stay `no_match` regardless.
- [ ] No UI for `/inventory/needs_review` yet — API-only.
- [ ] No auth — fine while Tailscale is the boundary.
- [ ] Photos have no backup beyond backupbox itself (see Storage locations
      above) — single point of failure if the collection data matters
      long-term.
- [ ] Matchbox reference coverage improved a lot (2,157 rows, up from 1,029)
      but is still gappier than Hot Wheels: no sku data at all (so always
      fuzzy name matching, never exact-sku), no data for 2013-2015 or 2018,
      and several imported years are checklist-only with no guide price
      (2016-2017, 2019-2021) - live eBay pricing still works independently
      for those, only the static guide price is absent.
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

The `curl` above hits `localhost` directly, bypassing `tailscale serve` — fine
for confirming the process itself restarted, but always do a final check from
the phone against `https://backupbox.tailfb9f14.ts.net/`, since that's the
actual path real usage takes (and the only one where the in-app camera works
at all).

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
