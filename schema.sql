-- ============================================================
-- REFERENCE DATA — ground truth pulled from South Texas Diecast
-- (or Fandom/other sources). This is "what actually exists,"
-- independent of anything a vision model extracted.
-- ============================================================
CREATE TABLE IF NOT EXISTS reference_castings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    brand           TEXT NOT NULL DEFAULT 'Hot Wheels',   -- Hot Wheels / Matchbox
    sku             TEXT,                                  -- e.g. DHP17 (Mattel item code)
    collector_number TEXT,                                 -- e.g. "148" (position within that year's mainline run)
    casting_name    TEXT NOT NULL,                          -- e.g. "Custom '72 Chevy Luv"
    series_name     TEXT,                                   -- e.g. "HW Hot Trucks"
    release_year    INTEGER,                                -- e.g. 2016
    variant_desc    TEXT,                                   -- color/deco description, used as a tiebreaker
    is_treasure_hunt TEXT,                                  -- NULL / 'TH' / 'Super TH'
    is_exclusive    TEXT,                                   -- NULL / 'Kmart' / 'Walmart' / 'Target' / etc.
    loose_value_usd REAL,
    carded_value_usd REAL,
    source          TEXT,                                   -- where this row came from, e.g. 'southtexasdiecast:2016.html'
    source_url      TEXT,
    fetched_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ref_casting_name ON reference_castings(casting_name);
CREATE INDEX IF NOT EXISTS idx_ref_year_brand ON reference_castings(release_year, brand);

-- ============================================================
-- YOUR INVENTORY — what the vision model extracted from a photo,
-- plus the validation result against reference_castings.
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_path          TEXT,          -- primary photo: card front (carded) or car body (loose)
    base_photo_path      TEXT,          -- optional second photo: underside/base stamp for loose cars
                                          -- (casting name + copyright year, stamped in the metal), or
                                          -- back-of-card for carded cars (usually has the sku/Toy # code)

    packaging_type       TEXT DEFAULT 'carded',  -- 'carded' or 'loose' - drives both extraction prompt
                                                    -- and which reference price column to use

    -- raw extraction, exactly as the vision model returned it
    extracted_brand         TEXT,
    extracted_casting_name  TEXT,
    extracted_collector_num TEXT,
    extracted_sku            TEXT,      -- manufacturer item/Toy # code, e.g. "CFH06" - exact identifier,
                                          -- much more reliable than fuzzy-matching the casting name
    extracted_series        TEXT,
    extracted_year           TEXT,
    extracted_color          TEXT,
    extracted_raw_json       TEXT,       -- full JSON blob, for debugging/reprocessing

    -- validation result
    match_reference_id   INTEGER,        -- FK into reference_castings, if matched
    match_confidence     REAL,           -- 0.0-1.0 fuzzy score
    match_status         TEXT,           -- 'confirmed' / 'needs_review' / 'no_match'
    match_notes          TEXT,

    -- canonical fields, filled in once matched (copied from reference, not the raw extraction)
    canonical_brand         TEXT,    -- from the matched reference row - more authoritative than
                                        -- extracted_brand, which is just the model's read/guess
    canonical_casting_name TEXT,
    canonical_series        TEXT,
    canonical_year           INTEGER,
    guide_price_usd           REAL,     -- pulled from reference_castings.loose_value_usd or
                                          -- .carded_value_usd depending on packaging_type - a static
                                          -- guide-book anchor, refreshed only when reference_import.py reruns

    -- live pricing, pulled from live_price_cache (see below) - a real-time-ish
    -- signal on top of the static guide price, refreshed periodically rather
    -- than looked up from scratch on every single scan
    live_price_low_usd    REAL,
    live_price_high_usd    REAL,
    live_recommended_price_usd REAL,   -- the "list it here to actually sell" price
    live_price_summary      TEXT,        -- brief note on what was found, e.g. "3 recent eBay sold listings, $6-11"
    live_price_fetched_at    TEXT,

    -- your own tracking fields
    condition           TEXT,            -- carded: card/bubble condition e.g. 'Mint card, no crease'
                                            -- loose: paint/wear condition e.g. 'Near mint, light wheel wear'
    acquired_date        TEXT,
    cost_basis_usd        REAL,
    status               TEXT DEFAULT 'in_collection',  -- in_collection / listed / sold
    listing_price_usd     REAL,
    sold_price_usd         REAL,
    created_at            TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (match_reference_id) REFERENCES reference_castings(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inv_match_status ON inventory(match_status);

-- ============================================================
-- LIVE PRICE CACHE — keyed by casting identity, not by individual scan.
-- This is what keeps the web-search cost bounded: scanning five copies of
-- the same casting triggers ONE live search, not five. A lookup is reused
-- until it's older than CACHE_MAX_AGE_DAYS (see live_pricing.py), then
-- refreshed on the next scan that needs it.
-- ============================================================
CREATE TABLE IF NOT EXISTS live_price_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    casting_name    TEXT NOT NULL,
    series_name     TEXT,
    release_year    INTEGER,
    packaging_type  TEXT NOT NULL,        -- 'carded' or 'loose' - priced separately, prices differ a lot
    price_low_usd   REAL,
    price_high_usd  REAL,
    recommended_listing_price_usd REAL,   -- a realistic "list it here to actually sell"
                                            -- price point, not just the range ceiling/floor
    summary         TEXT,                  -- short model-written note on what it found and where
    search_count    INTEGER,               -- how many web searches this lookup actually used (cost visibility)
    fetched_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_price_lookup
    ON live_price_cache(casting_name, series_name, release_year, packaging_type);
