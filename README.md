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
- Surfaces pricing/research data to support eBay listing decisions

## Stack

- **Backend:** FastAPI
- **Vision/AI:** Claude API
- **Storage:** SQLite
- **Deployment:** self-hosted (backupbox)

See `HANDOFF.md` for full architecture, data model, API surface, and current
project status.
