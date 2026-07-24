# Zamak Ledger

A self-hosted inventory, research, and pricing tool for Hot Wheels and Matchbox
collectors — built to catalog a diecast collection using computer vision and
structured pricing data, with an eye toward prepping cars for resale.

Named after Zamak, the zinc alloy both Mattel and Matchbox have used for
diecast castings since the 1960s — the one material both brands share.

## What it does

- Catalogs individual diecast cars (casting, year, color/deco, condition)
  using Claude's vision API for identification and detail extraction
- Tracks inventory across a SQLite database
- Surfaces pricing/research data (static guide + live eBay listings) to
  support resale decisions
- Custom in-app camera capture (front + back/base shots, auto-advancing
  between them), with a native-camera fallback when accessed without HTTPS
- Flags likely duplicate scans and offers to bump quantity instead of adding
  a second row

## Stack

- **Backend:** FastAPI
- **Vision/AI:** Claude API
- **Pricing:** eBay Browse API (live active-listing prices)
- **Storage:** SQLite (one database for your collection, a separate one for
  a ground-truth reference catalog); photos stored as plain files on disk
- **Deployment:** self-hosted — see "Running your own instance" below. (The
  original reference deployment sits behind Tailscale and is served over
  HTTPS via `tailscale serve`, since in-browser camera access requires
  HTTPS.)

Nothing here is committed to git — no photos, no databases, no `.env`. See
`HANDOFF.md` for full architecture, data model, API surface, storage
locations, and current project status.

## Running your own instance

This app is meant to be self-hosted — everyone runs their own copy with
their own API keys and their own data. There's no shared server and no
accounts system.

1. **Get your own keys:**
   - `ANTHROPIC_API_KEY` (required) — powers photo scanning. Get one at
     [console.anthropic.com](https://console.anthropic.com/).
   - `CLOUDINARY_URL` (required) — photo storage. Get it from your
     [Cloudinary](https://cloudinary.com/) dashboard.
   - `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` (optional) — enables live eBay
     pricing lookups. Get production credentials at
     [developer.ebay.com](https://developer.ebay.com/my/keys). Without
     these, live pricing is just skipped — everything else still works.
2. Copy `.env.example` to `.env` and fill in the values above.
3. `docker compose up --build`
4. Open `http://localhost:8420`.

Your collection (`inventory.db`), the ground-truth casting catalog
(`reference.db`), and any legacy local photos all live under `./data/` on
the host, so they survive container rebuilds.

`reference.db` starts out empty — matching/validation against known
castings just won't find anything until you populate it. Build it by
running the importer scripts (they scrape a handful of reference sites
once, then cache the results locally so re-runs don't hit the network
again) — see `HANDOFF.md` for the full list. Run them against the same
data directory the app uses, e.g.:

```
docker compose exec zamak-ledger env REFERENCE_DB_PATH=/data/reference.db python reference_import_hotwheels_wiki.py
```

**A note on scanning from your phone:** browsers only allow in-page camera
access on a "secure context" — `https://`, or `http://localhost` from the
same machine. `http://localhost:8420` on the machine running Docker works
fine, but reaching it from your phone over plain `http://<lan-ip>:8420`
will fall back to the native camera picker instead of the in-app live
capture. Put the app behind HTTPS (a reverse proxy, Tailscale + `tailscale
serve`, Caddy, etc.) if you want the full in-app camera flow from a phone.
