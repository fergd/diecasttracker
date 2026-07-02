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
    canonical_casting_name: str | None
    canonical_series: str | None
    canonical_year: int | None
    suggested_price_usd: float | None
    notes: str


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


def validate_extraction(extracted: dict, packaging_type: str = "carded") -> MatchResult:
    """
    extracted is the raw JSON dict from vision_extract.py. For carded cars the
    casting_name typically came from reading printed card text (reliable); for
    loose cars it may have come from a base stamp (reliable, similar to card
    text) OR from pure visual guessing when no base photo was provided
    (unreliable - see the downgrade rule below).
    """
    conn = sqlite3.connect(DB_PATH)
    candidates = _candidate_rows(conn, extracted.get("brand"), extracted.get("release_year"))
    conn.close()

    if not candidates:
        return MatchResult(
            status="no_match", confidence=0.0, reference_id=None,
            canonical_casting_name=None, canonical_series=None, canonical_year=None,
            suggested_price_usd=None,
            notes="No reference rows found for this brand/year window - "
                  "reference DB may not be seeded for this era yet."
        )

    casting_name = (extracted.get("casting_name") or "").strip()
    if not casting_name:
        return MatchResult(
            status="no_match", confidence=0.0, reference_id=None,
            canonical_casting_name=None, canonical_series=None, canonical_year=None,
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
            canonical_casting_name=None, canonical_series=None, canonical_year=None,
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
        canonical_casting_name=row["casting_name"] if status != "no_match" else None,
        canonical_series=row["series_name"] if status != "no_match" else None,
        canonical_year=row["release_year"] if status != "no_match" else None,
        suggested_price_usd=suggested_price(row, packaging_type) if status != "no_match" else None,
        notes="; ".join(notes) if notes else "Strong match.",
    )
