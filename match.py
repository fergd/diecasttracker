"""
match.py

Takes what the vision model extracted from a photo and checks it against
reference_castings (ground truth scraped from South Texas Diecast).

This is the layer that turns "plausible text" into "confirmed or flagged."

Scoring approach:
  - Fuzzy-match casting_name against all reference rows for the extracted
    brand/year (narrows the search space before scoring, so we're not
    fuzzy-matching against all 28,000 rows every time).
  - Cross-check collector_number and series as corroborating signal, not
    hard requirements (a misread year shouldn't block an otherwise-strong
    casting_name match).
  - Combine into a single confidence score and a status:
        >= 0.90  -> confirmed        (safe to auto-accept)
        0.75-0.90 -> needs_review    (flagged, but a likely candidate shown)
        < 0.75    -> no_match        (flagged, no confident candidate)
"""

import sqlite3
from dataclasses import dataclass

from rapidfuzz import fuzz, process

DB_PATH = "reference.db"

CONFIRM_THRESHOLD = 0.90
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


def _sku_match(conn: sqlite3.Connection, sku: str, brand: str | None) -> sqlite3.Row | None:
    """
    Exact SKU/Toy# lookup - a real Mattel item code (e.g. "CFH06") uniquely
    identifies a casting + colorway, unlike a casting name which needs fuzzy
    matching and can collide across reissues. Trust an exact hit over any
    fuzzy name score. Matchbox reference rows currently have no sku data
    (see reference_import_*.py), so this only ever fires for Hot Wheels.
    """
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM reference_castings
        WHERE sku = ? AND (brand = ? OR ? IS NULL)
        LIMIT 1
    """, (sku.strip(), brand, brand))
    return cur.fetchone()


def validate_extraction(extracted: dict, packaging_type: str = "carded") -> MatchResult:
    """
    extracted is the raw JSON dict from vision_extract.py. For carded cars the
    casting_name typically came from reading printed card text (reliable); for
    loose cars it may have come from a base stamp (reliable, similar to card
    text) OR from pure visual guessing when no base photo was provided
    (unreliable - see the downgrade rule below).
    """
    conn = sqlite3.connect(DB_PATH)

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

    # Build a lookup of casting_name -> row for rapidfuzz
    name_to_row = {row["casting_name"]: row for row in candidates}
    best = process.extractOne(
        casting_name,
        list(name_to_row.keys()),
        scorer=fuzz.token_sort_ratio,
    )

    if best is None:
        return MatchResult(
            status="no_match", confidence=0.0, reference_id=None,
            canonical_brand=None, canonical_casting_name=None, canonical_series=None, canonical_year=None,
            canonical_sku=None,
            suggested_price_usd=None,
            notes="Fuzzy match produced no candidates."
        )

    matched_name, score, _ = best
    row = name_to_row[matched_name]
    confidence = score / 100.0

    # Corroborating signal: does the extracted series roughly agree?
    notes = []
    extracted_series = (extracted.get("series") or "").strip()
    if extracted_series and row["series_name"]:
        series_score = fuzz.token_sort_ratio(extracted_series, row["series_name"]) / 100.0
        if series_score < 0.5:
            confidence -= 0.05  # small penalty, not disqualifying
            notes.append(
                f"Series mismatch: extracted '{extracted_series}' vs "
                f"reference '{row['series_name']}' (soft signal only)."
            )

    # Safeguard for loose cars identified by appearance alone (no base stamp
    # read): flagged further below, after status is computed, so it downgrades
    # the bucket rather than distorting the confidence score itself.

    confidence = max(0.0, min(1.0, confidence))

    if confidence >= CONFIRM_THRESHOLD:
        status = "confirmed"
    elif confidence >= REVIEW_THRESHOLD:
        status = "needs_review"
        notes.append(f"Best candidate: '{row['casting_name']}' ({row['release_year']}, {row['series_name']}).")
    else:
        status = "no_match"
        notes.append(f"Closest candidate was only {confidence:.0%} confident - treat as unmatched.")

    # Safeguard for loose cars identified by appearance alone (no base stamp
    # read): a fuzzy-matching casting_name here just means the model's guess
    # happens to be a real casting name somewhere in the DB - that's much
    # weaker evidence than OCR'd text off a card or base, since it's a guess
    # among 28,000+ possibilities rather than a transcription. Downgrade the
    # STATUS (not the confidence score, which stays honest) so these never
    # auto-confirm, but a real candidate still surfaces for a human to check
    # rather than being discarded as no_match.
    if packaging_type == "loose" and extracted.get("identification_method") == "visual_only" \
            and status == "confirmed":
        status = "needs_review"
        notes.append(
            "Visual-only identification (no base photo/stamp read) - fuzzy "
            "match alone isn't strong enough evidence to auto-confirm a loose "
            "car, even at high similarity. Re-scan with a base/underside photo "
            "for a reliable ID."
        )

    return MatchResult(
        status=status,
        confidence=round(confidence, 3),
        reference_id=row["id"] if status != "no_match" else None,
        canonical_brand=row["brand"] if status != "no_match" else None,
        canonical_casting_name=row["casting_name"] if status != "no_match" else None,
        canonical_series=row["series_name"] if status != "no_match" else None,
        canonical_year=row["release_year"] if status != "no_match" else None,
        canonical_sku=row["sku"] if status != "no_match" else None,
        suggested_price_usd=suggested_price(row, packaging_type) if status != "no_match" else None,
        notes="; ".join(notes) if notes else "Strong match.",
    )
