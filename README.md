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
- **Deployment:** self-hosted (backupbox), reachable only over Tailscale,
  served over HTTPS via `tailscale serve` (required for in-browser camera
  access)

Nothing here is committed to git — no photos, no databases, no `.env`. See
`HANDOFF.md` for full architecture, data model, API surface, storage
locations, and current project status.
