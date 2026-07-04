"""
app.py

FastAPI backend for the carded-car inventory pipeline:

    photo -> vision_extract.py -> match.py -> inventory table

Run with:
    uvicorn app:app --host 0.0.0.0 --port 8420

Then serve it over Tailscale (tailscale serve / funnel, or just hit it
directly at http://<your-tailnet-hostname>:8420) so your phone can reach it
without exposing anything to the public internet.
"""

import json
import logging
import os
import shutil
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from match import validate_extraction, reference_coverage
from vision_extract import extract_card_details
from live_pricing import get_live_price

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("diecast-inventory")

DB_PATH = "inventory.db"
PHOTO_DIR = Path("./photos")
PHOTO_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Diecast Tracker")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/photos", StaticFiles(directory="photos"), name="photos")

# Canonical column set for the inventory table, kept in sync with schema.sql.
# CREATE TABLE IF NOT EXISTS (in schema.sql) is a no-op on a table that
# already exists - it does NOT add new columns from later schema revisions.
# Since inventory.db persists across deployments (gitignored, never
# recreated), every schema change that adds a column needs this migration
# step, or existing installs crash with "no such column" the moment a
# feature that touches the new column runs.
INVENTORY_COLUMNS = {
    "photo_path": "TEXT",
    "base_photo_path": "TEXT",
    "packaging_type": "TEXT DEFAULT 'carded'",
    "extracted_brand": "TEXT",
    "car_make": "TEXT",
    "extracted_casting_name": "TEXT",
    "extracted_collector_num": "TEXT",
    "extracted_sku": "TEXT",
    "extracted_series": "TEXT",
    "extracted_year": "TEXT",
    "extracted_color": "TEXT",
    "extracted_raw_json": "TEXT",
    "match_reference_id": "INTEGER",
    "match_confidence": "REAL",
    "match_status": "TEXT",
    "match_notes": "TEXT",
    "canonical_brand": "TEXT",
    "canonical_casting_name": "TEXT",
    "canonical_series": "TEXT",
    "canonical_year": "INTEGER",
    "guide_price_usd": "REAL",
    "live_price_low_usd": "REAL",
    "live_price_high_usd": "REAL",
    "live_recommended_price_usd": "REAL",
    "live_price_summary": "TEXT",
    "live_price_fetched_at": "TEXT",
    "condition": "TEXT",
    "acquired_date": "TEXT",
    "cost_basis_usd": "REAL",
    "status": "TEXT DEFAULT 'in_collection'",
    "listing_price_usd": "REAL",
    "sold_price_usd": "REAL",
    "quantity": "INTEGER DEFAULT 1",
}


# Same problem as INVENTORY_COLUMNS above, for live_price_cache - it also
# persists across deployments and also gets schema additions over time
# (e.g. recommended_listing_price_usd was added after some installs already
# had the table created).
LIVE_PRICE_CACHE_COLUMNS = {
    "recommended_listing_price_usd": "REAL",
}


def _migrate_table(conn: sqlite3.Connection, table_name: str, columns: dict):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()}
    if not existing:
        return  # table doesn't exist yet - executescript above already created it fully
    for col, coltype in columns.items():
        if col not in existing:
            try:
                conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {col} {coltype}")
                logger.info(f"Migrated {table_name} table: added missing column '{col}'")
            except sqlite3.OperationalError as e:
                logger.warning(f"Could not add column '{col}' to {table_name}: {e}")
    conn.commit()


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(Path("schema.sql").read_text())
    _migrate_table(conn, "inventory", INVENTORY_COLUMNS)
    _migrate_table(conn, "live_price_cache", LIVE_PRICE_CACHE_COLUMNS)
    return conn


def _save_upload(upload: UploadFile) -> str:
    ext = Path(upload.filename).suffix or ".jpg"
    saved_path = PHOTO_DIR / f"{uuid.uuid4().hex}{ext}"
    with saved_path.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return str(saved_path)


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.post("/scan")
async def scan_card(
    photo: UploadFile = File(...),
    packaging_type: str = Form("carded"),          # 'carded' or 'loose'
    base_photo: Optional[UploadFile] = File(None),   # underside/base shot (loose) or
                                                        # back-of-card shot (carded) - optional
                                                        # second photo either way
):
    """
    Core endpoint: accepts a photo (plus an optional second photo - base/
    underside for loose, back-of-card for carded), runs vision extraction,
    validates against the reference DB, stores the result, and returns
    everything so the frontend can show what happened (including when it
    needs manual review).
    """
    if packaging_type not in ("carded", "loose"):
        packaging_type = "carded"

    saved_path = _save_upload(photo)
    base_saved_path = _save_upload(base_photo) if base_photo else None

    try:
        extracted = extract_card_details(saved_path, packaging_type=packaging_type,
                                          base_image_path=base_saved_path)
    except RuntimeError as e:
        # Clean, expected failure (bad API key, no credits, connection issue) -
        # vision_extract.py already turned this into a readable message.
        logger.error(f"Extraction failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        # Anything unexpected - log the full detail server-side (check with
        # `journalctl -u diecast-inventory -f`), but keep the client-facing
        # message generic rather than leaking a stack trace into the response body.
        logger.exception("Unexpected error during extraction")
        raise HTTPException(status_code=500, detail=f"Unexpected extraction error: {e}")

    try:
        match_result = validate_extraction(extracted, packaging_type=packaging_type)
    except Exception as e:
        logger.exception("Unexpected error during validation")
        raise HTTPException(status_code=500, detail=f"Unexpected validation error: {e}")

    # Live pricing only runs for items that actually matched something real -
    # a no_match item has no confirmed identity to price-check, and running a
    # web search against a guessed/garbled name would just waste the search
    # budget on a query unlikely to return anything useful. Cached by casting
    # identity in live_pricing.py, so repeat scans of the same casting are free.
    live_price = {"price_low_usd": None, "price_high_usd": None, "recommended_listing_price_usd": None,
                  "summary": None, "cached": False, "skipped": True}
    if match_result.status in ("confirmed", "needs_review"):
        try:
            live_price = get_live_price(
                casting_name=match_result.canonical_casting_name,
                series=match_result.canonical_series,
                year=match_result.canonical_year,
                packaging_type=packaging_type,
                brand=match_result.canonical_brand,
                sku=match_result.canonical_sku,
                db_path=DB_PATH,
            )
        except Exception as e:
            # Live pricing is a bonus signal, not core functionality - a
            # failure here should never take down an otherwise-successful
            # extraction + validation. Log it and move on with nulls.
            logger.warning(f"Live price lookup failed (non-fatal): {e}")
            live_price = {"price_low_usd": None, "price_high_usd": None, "recommended_listing_price_usd": None,
                          "summary": f"Live price lookup failed: {e}", "cached": False, "error": True}

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO inventory (
                photo_path, base_photo_path, packaging_type,
                extracted_brand, car_make, extracted_casting_name,
                extracted_collector_num, extracted_sku, extracted_series, extracted_year,
                extracted_color, extracted_raw_json,
                match_reference_id, match_confidence, match_status, match_notes,
                canonical_brand, canonical_casting_name, canonical_series, canonical_year,
                guide_price_usd,
                live_price_low_usd, live_price_high_usd, live_recommended_price_usd,
                live_price_summary, live_price_fetched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            saved_path, base_saved_path, packaging_type,
            extracted.get("brand"), extracted.get("car_make"), extracted.get("casting_name"),
            extracted.get("collector_number"), extracted.get("sku"), extracted.get("series"),
            str(extracted.get("release_year") or extracted.get("copyright_year_on_base") or "") or None,
            extracted.get("color"), json.dumps(extracted),
            match_result.reference_id, match_result.confidence, match_result.status,
            match_result.notes, match_result.canonical_brand, match_result.canonical_casting_name,
            match_result.canonical_series, match_result.canonical_year,
            match_result.suggested_price_usd,
            live_price.get("price_low_usd"), live_price.get("price_high_usd"),
            live_price.get("recommended_listing_price_usd"),
            live_price.get("summary"),
            None if live_price.get("skipped") else datetime.utcnow().isoformat(),
        ))
        conn.commit()
        new_id = cur.lastrowid
        conn.close()
    except sqlite3.Error as e:
        logger.exception("Database error while saving scan")
        raise HTTPException(status_code=500, detail=f"Database error while saving scan: {e}")

    return {
        "inventory_id": new_id,
        "packaging_type": packaging_type,
        "photo_path": saved_path,
        "base_photo_path": base_saved_path,
        "extracted": extracted,
        "validation": {
            "status": match_result.status,
            "confidence": match_result.confidence,
            "canonical_brand": match_result.canonical_brand,
            "canonical_casting_name": match_result.canonical_casting_name,
            "canonical_series": match_result.canonical_series,
            "canonical_year": match_result.canonical_year,
            "guide_price_usd": match_result.suggested_price_usd,
            "notes": match_result.notes,
        },
        "live_price": {
            "price_low_usd": live_price.get("price_low_usd"),
            "price_high_usd": live_price.get("price_high_usd"),
            "recommended_listing_price_usd": live_price.get("recommended_listing_price_usd"),
            "summary": live_price.get("summary"),
            "cached": live_price.get("cached", False),
            "skipped": live_price.get("skipped", False),
        },
    }


@app.get("/inventory")
def list_inventory(status_filter: str | None = None):
    conn = get_conn()
    if status_filter:
        rows = conn.execute(
            "SELECT * FROM inventory WHERE match_status = ? ORDER BY created_at DESC",
            (status_filter,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM inventory ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/inventory/needs_review")
def needs_review():
    """Everything flagged for a human to glance at before it's trusted."""
    return list_inventory(status_filter="needs_review")


@app.post("/inventory/{item_id}/confirm")
def manual_confirm(item_id: int, canonical_casting_name: str, canonical_series: str = None,
                    canonical_year: int = None):
    """Human override: manually confirm/correct a needs_review or no_match item."""
    conn = get_conn()
    conn.execute("""
        UPDATE inventory
        SET match_status = 'confirmed',
            canonical_casting_name = ?,
            canonical_series = ?,
            canonical_year = ?,
            match_notes = 'Manually confirmed by user'
        WHERE id = ?
    """, (canonical_casting_name, canonical_series, canonical_year, item_id))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/status")
def status():
    """
    Diagnostics: what's actually going on under the hood, separate from any
    single scan's result. This is the tool for answering "is the pipeline
    broken, or does the reference DB just not cover this casting/year yet."

    Deliberately does NOT make a live eBay API call by default - hit
    /status/test_live_search to actually verify that connection end-to-end.
    """
    result: dict = {"checked_at": datetime.utcnow().isoformat() + "Z"}

    result["anthropic_api_key_configured"] = bool(os.environ.get("ANTHROPIC_API_KEY"))
    result["ebay_api_configured"] = bool(
        os.environ.get("EBAY_CLIENT_ID") and os.environ.get("EBAY_CLIENT_SECRET")
    )

    # Reference database coverage - the most common real explanation for a
    # pile of no_match results is "this year/brand was never imported,"
    # not "the pipeline is broken."
    try:
        result["reference_db"] = reference_coverage()
    except Exception as e:
        result["reference_db"] = {"error": str(e)}

    # Live price cache stats - how many distinct castings have been priced,
    # and how recently, without spending anything new to check.
    try:
        conn = get_conn()
        cache_count = conn.execute("SELECT COUNT(*) AS n FROM live_price_cache").fetchone()["n"]
        cache_recent = conn.execute("""
            SELECT casting_name, packaging_type, price_low_usd, price_high_usd, fetched_at, search_count
            FROM live_price_cache ORDER BY fetched_at DESC LIMIT 5
        """).fetchall()
        result["live_price_cache"] = {
            "total_cached_castings": cache_count,
            "most_recent": [dict(r) for r in cache_recent],
        }
        conn.close()
    except Exception as e:
        result["live_price_cache"] = {"error": str(e)}

    # Inventory summary - quick health check on your actual scanned data
    try:
        conn = get_conn()
        by_status = conn.execute("""
            SELECT match_status, COUNT(*) AS n FROM inventory GROUP BY match_status
        """).fetchall()
        total = conn.execute("SELECT COUNT(*) AS n FROM inventory").fetchone()["n"]
        result["inventory"] = {
            "total_items": total,
            "by_match_status": {r["match_status"]: r["n"] for r in by_status},
        }
        conn.close()
    except Exception as e:
        result["inventory"] = {"error": str(e)}

    return result


@app.get("/status/test_live_search")
def test_live_search():
    """
    Actually calls eBay's Browse API to verify the live-pricing pipeline
    end-to-end (OAuth token fetch, search, response parsing) - separate
    from the free /status check above since this counts against eBay's
    API quota. Call this deliberately, not automatically.
    """
    try:
        result = get_live_price(
            casting_name="Custom '72 Chevy Luv",   # a real, well-documented casting
            series="HW Hot Trucks", year=2016, packaging_type="carded",
            brand="Hot Wheels", sku=None,
            db_path=DB_PATH,
        )
        return {"ok": not result.get("error", False), "result": result}
    except Exception as e:
        logger.exception("Live search connectivity test failed")
        return {"ok": False, "error": str(e)}


@app.get("/export")
def export_inventory():
    """Full JSON dump of your inventory - a portable backup independent of
    the SQLite file, easy to inspect, diff, or restore from by hand."""
    conn = get_conn()
    rows = conn.execute("SELECT * FROM inventory ORDER BY id").fetchall()
    conn.close()
    payload = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "item_count": len(rows),
        "items": [dict(r) for r in rows],
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f"attachment; filename=diecast_inventory_export_{datetime.utcnow().strftime('%Y%m%d')}.json"},
    )


class InventoryUpdate(BaseModel):
    """All fields optional - only what's provided gets updated (PATCH-style
    semantics on a PUT route, which is fine for a single-user personal tool)."""
    canonical_brand: Optional[str] = None
    car_make: Optional[str] = None
    canonical_casting_name: Optional[str] = None
    canonical_series: Optional[str] = None
    canonical_year: Optional[int] = None
    extracted_collector_num: Optional[str] = None
    extracted_sku: Optional[str] = None
    extracted_color: Optional[str] = None
    match_status: Optional[str] = None
    condition: Optional[str] = None
    acquired_date: Optional[str] = None
    cost_basis_usd: Optional[float] = None
    status: Optional[str] = None          # in_collection / listed / sold
    listing_price_usd: Optional[float] = None
    sold_price_usd: Optional[float] = None
    quantity: Optional[int] = None


@app.put("/inventory/{item_id}")
def update_item(item_id: int, update: InventoryUpdate):
    """Edit any of your own tracking fields, or correct a canonical field by
    hand (e.g. fixing a brand/casting name the pipeline got wrong)."""
    fields = {k: v for k, v in update.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields provided to update.")

    conn = get_conn()
    existing = conn.execute("SELECT id FROM inventory WHERE id = ?", (item_id,)).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail=f"No inventory item with id {item_id}")

    set_clause = ", ".join(f"{col} = ?" for col in fields)
    try:
        conn.execute(f"UPDATE inventory SET {set_clause} WHERE id = ?", (*fields.values(), item_id))
        conn.commit()
    except sqlite3.Error as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Database error while updating: {e}")

    row = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@app.post("/inventory/{item_id}/refresh_price")
def refresh_price(item_id: int):
    """
    Force a fresh eBay lookup for an already-saved item, bypassing the
    30-day cache - for a deliberate user-triggered "recheck this price"
    action, not something that happens automatically. Counts against
    eBay's API quota same as any other live lookup, same reason the
    normal /scan path never does this automatically either.
    """
    conn = get_conn()
    row = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail=f"No inventory item with id {item_id}")

    casting_name = row["canonical_casting_name"] or row["extracted_casting_name"]
    if not casting_name:
        conn.close()
        raise HTTPException(status_code=400, detail="No identified casting name to price-check.")

    try:
        live_price = get_live_price(
            casting_name=casting_name,
            series=row["canonical_series"] or row["extracted_series"],
            year=row["canonical_year"] or row["extracted_year"],
            packaging_type=row["packaging_type"],
            brand=row["canonical_brand"] or row["extracted_brand"],
            sku=row["extracted_sku"],
            db_path=DB_PATH,
            force_refresh=True,
        )
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=502, detail=f"Live price refresh failed: {e}")

    conn.execute("""
        UPDATE inventory SET
            live_price_low_usd = ?, live_price_high_usd = ?,
            live_recommended_price_usd = ?, live_price_summary = ?,
            live_price_fetched_at = ?
        WHERE id = ?
    """, (
        live_price.get("price_low_usd"), live_price.get("price_high_usd"),
        live_price.get("recommended_listing_price_usd"), live_price.get("summary"),
        datetime.utcnow().isoformat(), item_id,
    ))
    conn.commit()
    updated = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(updated)


_PHOTO_SLOT_COLUMNS = {"main": "photo_path", "secondary": "base_photo_path"}


@app.post("/inventory/{item_id}/photo")
async def add_or_replace_photo(item_id: int, photo: UploadFile = File(...), slot: str = Form("secondary")):
    """Attach or replace a photo (main or secondary) on an already-saved
    item - for when the back-of-card/base shot wasn't taken during the
    original scan, or an existing shot needs replacing. Doesn't re-run
    extraction/matching, just stores the file."""
    if slot not in _PHOTO_SLOT_COLUMNS:
        raise HTTPException(status_code=400, detail="slot must be 'main' or 'secondary'")
    column = _PHOTO_SLOT_COLUMNS[slot]

    conn = get_conn()
    existing = conn.execute(f"SELECT {column} FROM inventory WHERE id = ?", (item_id,)).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail=f"No inventory item with id {item_id}")

    old_path = existing[column]
    saved_path = _save_upload(photo)
    conn.execute(f"UPDATE inventory SET {column} = ? WHERE id = ?", (saved_path, item_id))
    conn.commit()
    row = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    conn.close()

    if old_path and old_path != saved_path:
        try:
            Path(old_path).unlink(missing_ok=True)
        except OSError as e:
            logger.warning(f"Could not delete replaced photo file {old_path}: {e}")

    return dict(row)


@app.delete("/inventory/{item_id}/photo")
def delete_photo(item_id: int, slot: str = "secondary"):
    """Remove a single photo (main or secondary) from an item without
    deleting the item itself."""
    if slot not in _PHOTO_SLOT_COLUMNS:
        raise HTTPException(status_code=400, detail="slot must be 'main' or 'secondary'")
    column = _PHOTO_SLOT_COLUMNS[slot]

    conn = get_conn()
    existing = conn.execute(f"SELECT {column} FROM inventory WHERE id = ?", (item_id,)).fetchone()
    if existing is None:
        conn.close()
        raise HTTPException(status_code=404, detail=f"No inventory item with id {item_id}")

    old_path = existing[column]
    conn.execute(f"UPDATE inventory SET {column} = NULL WHERE id = ?", (item_id,))
    conn.commit()
    row = conn.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    conn.close()

    if old_path:
        try:
            Path(old_path).unlink(missing_ok=True)
        except OSError as e:
            logger.warning(f"Could not delete photo file {old_path}: {e}")

    return dict(row)


@app.delete("/inventory/{item_id}")
def delete_item(item_id: int):
    """Remove a scan - for bad extractions, no_match junk, or duplicates."""
    conn = get_conn()
    row = conn.execute("SELECT photo_path, base_photo_path FROM inventory WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail=f"No inventory item with id {item_id}")

    conn.execute("DELETE FROM inventory WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    # Best-effort cleanup of the associated photo files - not fatal if this
    # fails (e.g. already gone), the DB row is what actually matters.
    for path in (row["photo_path"], row["base_photo_path"]):
        if path:
            try:
                Path(path).unlink(missing_ok=True)
            except OSError as e:
                logger.warning(f"Could not delete photo file {path}: {e}")

    return {"ok": True, "deleted_id": item_id}
