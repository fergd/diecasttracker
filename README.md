# Diecast Inventory

Photo → vision extraction → validated against real reference data → your own inventory DB.

Supports both **carded** (packaged) and **loose** (unpackaged) cars as first-class,
distinct paths — not an afterthought bolted onto the carded flow.

## Carded vs. loose — why they're handled differently

- **Carded**: identification comes from reading printed card text (casting name,
  collector number, series). This is essentially OCR, so it's reliable and a
  single photo is enough.
- **Loose**: there's no card to read. Identification instead comes from a base/
  underside photo, where the casting name and a copyright year are usually
  stamped into the metal - also reliable, but requires a second photo.
  *Without* a base photo, identification falls back to guessing from the car's
  body shape/color alone, which is meaningfully weaker evidence (a visual guess
  among 28,000+ possible castings vs. a transcription). The app tracks *how*
  a loose car was identified (`identification_method`) and the validation layer
  refuses to auto-confirm a visual-only guess, even if it happens to fuzzy-match
  a real casting name well - it lands in `needs_review` instead, so you still
  see the likely candidate but know to double-check it yourself.
- **Pricing** also splits by packaging: `reference_castings` carries both
  `loose_value_usd` and `carded_value_usd` from South Texas Diecast's guide,
  and the app picks the right one based on how the item you scanned is
  actually packaged.

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
                          price column
       |
inventory.db           ->  stores extraction + validation + packaging_type +
                          suggested_price_usd + your own tracking fields
```

`reference_castings` is ground truth, imported once (and refreshed periodically)
from South Texas Diecast's community-maintained checklist/price guide. This is
what extraction gets checked against - it's the difference between "the model
said so" and "this is confirmed to be a real, cataloged casting."

## Setup (on your backupbox, not this sandbox)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Seed the reference DB - start with a few years you actually own cards from,
# expand later. Each year is one polite, cached HTTP request.
python reference_import.py --years 2013 2014 2015 2016 2017 2018

# Set your API key (get one at console.anthropic.com)
export ANTHROPIC_API_KEY=sk-ant-...

# Run it
uvicorn app:app --host 0.0.0.0 --port 8420
```

Then reach it from your phone over Tailscale at `http://<backupbox-tailnet-name>:8420` -
no port forwarding, no public exposure.

## What's NOT built yet (next steps once this is validated)

- **Matchbox reference data.** South Texas Diecast's guide above is Hot Wheels-only.
  Matchbox will need a different source (Fandom wiki scrape, or manual seeding of
  the castings you actually own) - the `reference_castings` table already has a
  `brand` column ready for this.
- **eBay sold-comp pricing.** `suggested_price_usd` comes from South Texas
  Diecast's own guide estimates, which is a reasonable starting anchor - but per
  our earlier conversation, the real pre-listing check should still be live eBay
  sold listings, since guide prices lag the market.
- **`/inventory/needs_review` UI.** The endpoint exists and returns flagged
  items (including all the visual-only loose-car guesses), but there's no
  review screen yet - right now you'd hit it via curl/Postman or a quick admin
  page. Worth building once you see how often things actually land in that
  bucket.
- **Auth.** Currently wide open on your tailnet, which is fine since Tailscale
  is already the access boundary - but worth knowing if you ever add anyone else
  to your tailnet who shouldn't touch this.
