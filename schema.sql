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
    car_make                 TEXT,      -- real-world vehicle manufacturer (e.g. "Chevrolet", "Ford"),
                                          -- distinct from extracted_brand (Hot Wheels/Matchbox, the
                                          -- collectible line) - no reference-DB verification for this
                                          -- one, so it's directly user-editable too, like condition
    special_series            TEXT,      -- franchise/personality tie-in sub-line, e.g. "Back to the
                                          -- Future", "James Bond 007: The Spy Who Loved Me", "Fast &
                                          -- Furious", "Block" (Ken Block) - distinct from series (e.g.
                                          -- "HW Screen Time", "2011 New Models"). Manual-entry only,
                                          -- like car_make: not vision-extracted, no reference-DB
                                          -- verification.
    extracted_casting_name  TEXT,
    extracted_collector_num TEXT,       -- the yearly MAINLINE number, e.g. "542" out of that year's
                                          -- ~250-ish full lineup - a standalone number, NOT a fraction.
                                          -- Printed cards dropped this in the 2000s, so it's often
                                          -- absent on newer stock. Distinct from series_number below -
                                          -- see that column's comment for how these two differ.
    extracted_series_number  TEXT,       -- position within the NAMED series/segment given by
                                          -- extracted_series/canonical_series, e.g. "2/4" within
                                          -- "Biff! Bam! Boom! Series" - printed as "#X OF Y" or
                                          -- "X OF Y" near the series banner, distinct from the
                                          -- standalone yearly collector number above. A car can have
                                          -- both simultaneously (they're on different parts of the
                                          -- card and count completely different things).
    extracted_sku            TEXT,      -- manufacturer item/Toy # code, e.g. "CFH06" - exact identifier,
                                          -- much more reliable than fuzzy-matching the casting name
    extracted_series        TEXT,
    extracted_year           TEXT,
    extracted_color          TEXT,
    treasure_hunt             TEXT,       -- NULL / 'TH' / 'Super TH' - same convention as
                                            -- reference_castings.is_treasure_hunt above.
                                            -- Detected from the card's TH logo (not just
                                            -- printed text) or, for Super TH, real rubber
                                            -- tires + spectraflame paint - see vision_extract.py
    base_country              TEXT,       -- casting/base-stamp country of manufacture, e.g.
                                            -- 'Malaysia' / 'Thailand' / 'China' / 'Indonesia' -
                                            -- a real collector value driver, usually only legible
                                            -- on loose cars (base stamp visible); manual-entry
                                            -- fallback like car_make since carded photos rarely
                                            -- show the base
    wheel_type                TEXT,       -- 'Redline' / 'Real Riders' / 'Basic Wheels' / 'Chrome' /
                                            -- 'Other' - a major collector value driver, second only
                                            -- to Treasure Hunt status. Redline = 1968-77 red-striped
                                            -- tires (vintage). Real Riders = rubber treaded tires,
                                            -- used on Premium lines and Super TH. Basic Wheels =
                                            -- standard hard plastic, most mainline releases. Chrome =
                                            -- shiny chrome-look wheels (Ultra Hots line etc).
    body_base_construction     TEXT,       -- 'Metal/Metal' / 'Metal/Plastic' / 'All-Plastic' - whether
                                            -- the body AND base/chassis are metal, just the body, or
                                            -- neither. Metal/Metal is rare on modern mainline (most
                                            -- have shifted to Metal/Plastic) and standard on Premium/
                                            -- Car Culture lines - meaningfully affects value.
    special_flags              TEXT,       -- JSON array of strings, any of: 'New Casting', 'Zamac'
                                            -- (unpainted bare-metal finish), 'Chase' (Premium-line
                                            -- Super-TH-equivalent, numbered like '0/5'), 'Store
                                            -- Exclusive'. Stored as JSON since SQLite has no array
                                            -- type; parse/serialize at the app layer.
    comments                  TEXT,       -- general free-text notes on identification (provenance,
                                            -- variant details, anything that doesn't fit a structured
                                            -- field) - distinct from `condition` below, which is
                                            -- specifically about physical wear/condition
    extracted_raw_json       TEXT,       -- full JSON blob, for debugging/reprocessing

    -- validation result
    match_reference_id   INTEGER,        -- FK into reference_castings, if matched
    match_confidence     REAL,           -- 0.0-1.0 fuzzy score
    match_status         TEXT,           -- 'confirmed' / 'needs_review' / 'no_match'
    match_notes          TEXT,

    -- canonical fields, filled in once matched (copied from reference, not the raw extraction)
    canonical_brand         TEXT,    -- from the matched reference row - more authoritative than
                                        -- extracted_brand, which is just the model's read/guess
    canonical_sku            TEXT,    -- from the matched reference row - much more consistent
                                        -- than extracted_sku (raw OCR), which can vary between
                                        -- rescans of the same physical card; used for duplicate
                                        -- detection so a rescan bumps quantity instead of adding
                                        -- a second row
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
    condition           TEXT,            -- free-text notes, e.g. 'small crease bottom-left corner' -
                                            -- supplements the structured grades below, doesn't replace them
    condition_car_grade  TEXT,            -- collector C-scale (C6-C10) for the car's own paint/finish -
                                            -- C10 Mint, C9 Near Mint, C8 Excellent, C7 Very Good, C6 Good
    condition_card_grade TEXT,            -- same C6-C10 scale, for card/bubble packaging condition -
                                            -- carded items only, graded separately from the car itself
    acquired_date        TEXT,
    cost_basis_usd        REAL,
    status               TEXT DEFAULT 'in_collection',  -- in_collection / listed / sold
    staged_for_listing    INTEGER DEFAULT 0,  -- 0/1 - marked to go out in the next eBay CSV
                                                 -- export, independent of status (an item stays
                                                 -- in_collection while staged; the export flips
                                                 -- it to status='listed' and clears this flag)
    listing_price_usd     REAL,
    sold_price_usd         REAL,
    quantity              INTEGER DEFAULT 1,  -- how many physical copies of this exact
                                                 -- casting+colorway+packaging you own -
                                                 -- duplicate scans offer to bump this
                                                 -- instead of creating a second row
    lot_id                TEXT,               -- shared, app-generated ID linking rows that
                                                 -- should sell together as ONE eBay listing
                                                 -- (a "lot of 5 cars" draft), instead of each
                                                 -- getting its own listing - NULL means "sells
                                                 -- on its own", same as always
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
