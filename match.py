"""
match.py

Takes what the vision model extracted from a photo and checks it against
reference_castings (ground truth scraped from South Texas Diecast).

This is the layer that turns "plausible text" into "confirmed or flagged."

Scoring approach:
  - An exact SKU/Toy# hit against reference_castings is the ONLY thing that
    auto-confirms a match and fills in canonical_series/canonical_sku/
    canonical_year - it's a real Mattel item code, not a guess.
  - Without that, casting_name is fuzzy-matched against candidate rows
    (narrowed by brand/year) purely to surface a *possible* candidate for a
    human to check - never to auto-populate canonical_* fields. A casting
    gets reissued across years/series under the exact same name (e.g.
    "Porsche 934 Turbo RSR" 8 times across 2014-2018 in different series),
    so name similarity alone says nothing about which specific release this
    is - confidently attaching a candidate row's series/SKU/year to the
    item would silently be "just because the name matches," which is
    exactly the wrong-data problem this function exists to avoid.
  - Status:
        SKU exact match      -> confirmed    (canonical_* filled from the row)
        fuzzy name >= 0.75    -> needs_review (candidate named in notes only,
                                                canonical_* left null so the
                                                UI shows the model's actual
                                                extracted_* reading instead)
        fuzzy name < 0.75     -> no_match     (nothing worth suggesting)
"""

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from rapidfuzz import fuzz

DB_PATH = os.environ.get("REFERENCE_DB_PATH", "reference.db")

REVIEW_THRESHOLD = 0.75


@dataclass
class MatchResult:
    status: str                 # 'confirmed' / 'needs_review' / 'no_match'
    confidence: float
    reference_id: int | None
    canonical_brand: str | None
    canonical_casting_name: str | None
    canonical_series: str | None
    canonical_year: int | None
    canonical_sku: str | None   # from the matched reference row, when available - a much
                                  # stronger eBay search term than the casting name alone,
                                  # since sellers commonly put the exact Toy # in listing titles
    suggested_price_usd: float | None
    notes: str


def reference_coverage(db_path: str = DB_PATH) -> dict:
    """
    Diagnostic summary of what's actually in the reference database - this is
    the tool for answering "is matching broken, or does the reference DB just
    not cover this year/brand yet?" A pile of no_match results usually means
    the latter, not a pipeline failure.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(Path("schema.sql").read_text())
    try:
        total = conn.execute("SELECT COUNT(*) AS n FROM reference_castings").fetchone()["n"]
        by_brand_year = conn.execute("""
            SELECT brand, release_year, COUNT(*) AS n
            FROM reference_castings
            GROUP BY brand, release_year
            ORDER BY brand, release_year
        """).fetchall()
        years_by_brand: dict[str, list[dict]] = {}
        for row in by_brand_year:
            years_by_brand.setdefault(row["brand"], []).append(
                {"year": row["release_year"], "count": row["n"]}
            )
        return {
            "total_reference_rows": total,
            "coverage_by_brand": years_by_brand,
        }
    finally:
        conn.close()


def suggested_price(row, packaging_type: str) -> float | None:
    """Pick the reference price column matching how this specific item is packaged.
    This is a starting anchor from guide data, not a live market price - still
    worth checking eBay sold comps before actually listing, per the earlier
    pricing conversation."""
    if row is None:
        return None
    col = "carded_value_usd" if packaging_type == "carded" else "loose_value_usd"
    return row[col]


def _candidate_rows(conn: sqlite3.Connection, brand: str | None, year: str | None) -> list[sqlite3.Row]:
    """
    Narrow the search space. If we have a year, search that year +/- 1
    (castings sometimes get miscategorized by a year in guides/collector
    docs). If no year, fall back to brand-only, which is slower but still
    bounded (a few thousand rows worst case, not tens of thousands).
    """
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    if year and str(year).isdigit():
        y = int(year)
        cur.execute("""
            SELECT * FROM reference_castings
            WHERE brand = ? AND release_year BETWEEN ? AND ?
        """, (brand or "Hot Wheels", y - 1, y + 1))
    else:
        cur.execute("SELECT * FROM reference_castings WHERE brand = ?", (brand or "Hot Wheels",))

    return cur.fetchall()


def _best_candidate(candidates: list[sqlite3.Row], casting_name: str, extracted_series: str | None):
    """
    Score every candidate row individually and pick the best one - name
    similarity is the primary signal, but series similarity breaks ties
    (rounded to whole percentage points, so near-ties from OCR noise still
    let series decide) rather than being applied as a post-hoc penalty
    after some other row was already arbitrarily selected.

    A casting gets reissued across years/series under the exact same name
    (e.g. "Porsche 934 Turbo RSR" appears 8 times across 2014-2018 in
    different series) - name-only scoring can't tell those apart at all,
    and series is the strongest signal available for which specific
    release this is. Must score every row directly rather than building a
    casting_name -> row dict first: that collapses same-named rows down
    to whichever one the SQL query happened to return last, silently
    discarding the rest before scoring ever runs.

    Returns (best_row, name_score, series_score) or (None, 0.0, 0.0) if
    candidates is empty.
    """
    best_row = None
    best_name_score = 0.0
    best_series_score = 0.0
    best_key = None
    for row in candidates:
        name_score = fuzz.token_sort_ratio(casting_name, row["casting_name"]) / 100.0
        series_score = 0.0
        if extracted_series and row["series_name"]:
            series_score = fuzz.token_sort_ratio(extracted_series, row["series_name"]) / 100.0
        key = (round(name_score, 2), series_score)
        if best_key is None or key > best_key:
            best_key = key
            best_row = row
            best_name_score = name_score
            best_series_score = series_score
    return best_row, best_name_score, best_series_score


def _sku_match(conn: sqlite3.Connection, sku: str, brand: str | None) -> sqlite3.Row | None:
    """
    Exact SKU/Toy# lookup - a real Mattel item code (e.g. "CFH06") uniquely
    identifies a casting + colorway, unlike a casting name which needs fuzzy
    matching and can collide across reissues. Trust an exact hit over any
    fuzzy name score. Matchbox reference rows currently have no sku data
    (see reference_import_*.py), so this only ever fires for Hot Wheels.

    Despite vision_extract.py's prompt asking for the short code and suffix
    to be split into separate fields (sku vs sku_full_code), extraction
    quite often merges them into one string anyway (confirmed: 3 of 7 real
    scans in one session had a value like "DHX47-D9B0F" in the sku field).
    An exact match against the full suffixed string then always misses -
    the reference DB only ever stores the short code - and silently falls
    through to fuzzy name matching, which can land on a wrong or even
    mislabeled row when multiple reissues share a name (confirmed case:
    fell through to a south-texas-diecast row with a mislabeled series for
    the same casting, purely because the extracted series text happened to
    match that source's wrong label). Try the short prefix before giving up.
    """
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    candidates = [sku.strip()]
    if "-" in sku:
        candidates.append(sku.split("-", 1)[0].strip())
    for candidate in candidates:
        if not candidate:
            continue
        cur.execute("""
            SELECT * FROM reference_castings
            WHERE sku = ? AND (brand = ? OR ? IS NULL)
            LIMIT 1
        """, (candidate, brand, brand))
        row = cur.fetchone()
        if row is not None:
            return row
    return None


def validate_extraction(extracted: dict, packaging_type: str = "carded") -> MatchResult:
    """
    extracted is the raw JSON dict from vision_extract.py. For carded cars the
    casting_name typically came from reading printed card text (reliable); for
    loose cars it may have come from a base stamp (reliable, similar to card
    text) OR from pure visual guessing when no base photo was provided
    (unreliable - see the downgrade rule below).
    """
    conn = sqlite3.connect(DB_PATH)
    # A brand-new reference.db (fresh self-hosted install, before any
    # reference_import_*.py script has run) has no tables at all yet - fall
    # through to a real "no reference data" no_match below instead of a bare
    # sqlite3.OperationalError on the SELECT further down.
    conn.executescript(Path("schema.sql").read_text())

    sku = (extracted.get("sku") or "").strip()
    if sku:
        row = _sku_match(conn, sku, extracted.get("brand"))
        if row is not None:
            conn.close()
            return MatchResult(
                status="confirmed", confidence=1.0, reference_id=row["id"],
                canonical_brand=row["brand"], canonical_casting_name=row["casting_name"],
                canonical_series=row["series_name"], canonical_year=row["release_year"],
                canonical_sku=row["sku"],
                suggested_price_usd=suggested_price(row, packaging_type),
                notes=f"Exact SKU match ('{sku}') - the most reliable ID available.",
            )
        # SKU was read but not found in the reference DB - fall through to
        # fuzzy name matching rather than giving up (the DB may just not
        # cover this specific release yet, or the code was misread).

    candidates = _candidate_rows(conn, extracted.get("brand"), extracted.get("release_year"))
    conn.close()

    if not candidates:
        return MatchResult(
            status="no_match", confidence=0.0, reference_id=None,
            canonical_brand=None, canonical_casting_name=None, canonical_series=None, canonical_year=None,
            canonical_sku=None,
            suggested_price_usd=None,
            notes="No reference rows found for this brand/year window - "
                  "reference DB may not be seeded for this era yet."
        )

    casting_name = (extracted.get("casting_name") or "").strip()
    if not casting_name:
        return MatchResult(
            status="no_match", confidence=0.0, reference_id=None,
            canonical_brand=None, canonical_casting_name=None, canonical_series=None, canonical_year=None,
            canonical_sku=None,
            suggested_price_usd=None,
            notes="Extraction returned no casting name to match against."
        )

    extracted_series = (extracted.get("series") or "").strip()
    row, name_score, series_score = _best_candidate(candidates, casting_name, extracted_series)

    if row is None:
        return MatchResult(
            status="no_match", confidence=0.0, reference_id=None,
            canonical_brand=None, canonical_casting_name=None, canonical_series=None, canonical_year=None,
            canonical_sku=None,
            suggested_price_usd=None,
            notes="Fuzzy match produced no candidates."
        )

    confidence = name_score

    # Corroborating signal only, same as before - series didn't determine
    # candidate selection here in isolation (it already fed into which row
    # _best_candidate picked), this just reflects a mismatch in the notes.
    notes = []
    if extracted_series and row["series_name"] and series_score < 0.5:
        confidence -= 0.05
        notes.append(
            f"Series mismatch: extracted '{extracted_series}' vs "
            f"reference '{row['series_name']}' (soft signal only)."
        )

    confidence = max(0.0, min(1.0, confidence))

    # No exact SKU hit means no real ID - a name-similarity score, however
    # high, is never strong enough evidence to assert a specific reference
    # row's series/SKU/year as this item's canonical identity (see the
    # module docstring). The best a fuzzy match can do is name a *possible*
    # candidate for a human to check in notes - canonical_* stays null so
    # the UI falls back to displaying what was actually extracted off the
    # card, not a guess dressed up as a verified match.
    if confidence >= REVIEW_THRESHOLD:
        status = "needs_review"
        notes.append(
            f"No exact SKU match. Possible candidate: '{row['casting_name']}' "
            f"({row['release_year']}, {row['series_name']}) - {confidence:.0%} name "
            f"similarity. Confirm manually if this is it, or correct the fields "
            f"below with what's actually on the card."
        )
    else:
        status = "no_match"
        notes.append(f"No exact SKU match and no confident casting-name candidate ({confidence:.0%}).")

    return MatchResult(
        status=status,
        confidence=round(confidence, 3),
        reference_id=None,
        canonical_brand=None,
        canonical_casting_name=None,
        canonical_series=None,
        canonical_year=None,
        canonical_sku=None,
        suggested_price_usd=None,
        notes="; ".join(notes),
    )
