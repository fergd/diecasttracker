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
import shutil
import sqlite3
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional

from match import validate_extraction
from vision_extract import extract_card_details

DB_PATH = "inventory.db"
PHOTO_DIR = Path("./photos")
PHOTO_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Diecast Inventory")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory="static"), name="static")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(Path("schema.sql").read_text())
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
    base_photo: Optional[UploadFile] = File(None),   # loose cars only - underside/base shot
):
    """
    Core endpoint: accepts a photo (plus an optional base photo for loose
    cars), runs vision extraction, validates against the reference DB,
    stores the result, and returns everything so the frontend can show what
    happened (including when it needs manual review).
    """
    if packaging_type not in ("carded", "loose"):
        packaging_type = "carded"

    saved_path = _save_upload(photo)
    base_saved_path = _save_upload(base_photo) if (packaging_type == "loose" and base_photo) else None

    extracted = extract_card_details(saved_path, packaging_type=packaging_type,
                                      base_image_path=base_saved_path)
    match_result = validate_extraction(extracted, packaging_type=packaging_type)

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO inventory (
            photo_path, base_photo_path, packaging_type,
            extracted_brand, extracted_casting_name,
            extracted_collector_num, extracted_series, extracted_year,
            extracted_color, extracted_raw_json,
            match_reference_id, match_confidence, match_status, match_notes,
            canonical_casting_name, canonical_series, canonical_year,
            suggested_price_usd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        saved_path, base_saved_path, packaging_type,
        extracted.get("brand"), extracted.get("casting_name"),
        extracted.get("collector_number"), extracted.get("series"),
        str(extracted.get("release_year") or extracted.get("copyright_year_on_base") or "") or None,
        extracted.get("color"), json.dumps(extracted),
        match_result.reference_id, match_result.confidence, match_result.status,
        match_result.notes, match_result.canonical_casting_name,
        match_result.canonical_series, match_result.canonical_year,
        match_result.suggested_price_usd,
    ))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()

    return {
        "inventory_id": new_id,
        "packaging_type": packaging_type,
        "extracted": extracted,
        "validation": {
            "status": match_result.status,
            "confidence": match_result.confidence,
            "canonical_casting_name": match_result.canonical_casting_name,
            "canonical_series": match_result.canonical_series,
            "canonical_year": match_result.canonical_year,
            "suggested_price_usd": match_result.suggested_price_usd,
            "notes": match_result.notes,
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
