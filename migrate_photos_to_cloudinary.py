"""
migrate_photos_to_cloudinary.py

One-time backfill: uploads the local photos that predate the Cloudinary
switch (see cloudinary_upload.py) and repoints their inventory.db rows at
the new Cloudinary public_id, so every row - not just new scans - gets a
publicly-reachable photo URL (needed for the eBay CSV export's photo column)
and a copy that isn't a single point of failure on backupbox's disk.

Only touches rows where photo_path/base_photo_path still start with
"photos/" (app.py's _is_legacy_local_path convention) - already-migrated
rows are untouched, so this is safe to re-run. Original local files are
NOT deleted; verify the migrated photos display correctly in the app before
cleaning up photos/ by hand.

Run from the project root (relies on the same relative DB_PATH/PHOTO_DIR
app.py uses):

    python3 migrate_photos_to_cloudinary.py --dry-run   # preview only
    python3 migrate_photos_to_cloudinary.py              # actually migrate
"""

import argparse
import sqlite3
from pathlib import Path

from cloudinary_upload import upload_photo

DB_PATH = "inventory.db"
PHOTO_DIR = Path("./photos")


def _is_legacy_local_path(path: str | None) -> bool:
    return bool(path) and path.startswith("photos/")


def migrate_column(conn: sqlite3.Connection, row_id: int, column: str, path: str, dry_run: bool) -> str:
    """Returns one of: 'migrated', 'missing', 'failed'."""
    local_path = Path(path)
    if not local_path.exists():
        print(f"  [{column}] MISSING on disk: {path}")
        return "missing"

    if dry_run:
        print(f"  [{column}] would upload {path} ({local_path.stat().st_size} bytes)")
        return "migrated"

    try:
        public_id = upload_photo(local_path.read_bytes())
    except Exception as e:
        print(f"  [{column}] FAILED to upload {path}: {e}")
        return "failed"

    conn.execute(f"UPDATE inventory SET {column} = ? WHERE id = ?", (public_id, row_id))
    print(f"  [{column}] {path} -> {public_id}")
    return "migrated"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading or writing to the DB")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT id, photo_path, base_photo_path FROM inventory "
        "WHERE photo_path LIKE 'photos/%' OR base_photo_path LIKE 'photos/%' "
        "ORDER BY id"
    ).fetchall()

    if not rows:
        print("Nothing to migrate - no rows reference a local photos/ path.")
        return

    print(f"{len(rows)} row(s) with at least one legacy local photo"
          f"{' (dry run - no uploads, no DB writes)' if args.dry_run else ''}.\n")

    counts = {"migrated": 0, "missing": 0, "failed": 0}
    for row in rows:
        print(f"Item {row['id']}:")
        for column in ("photo_path", "base_photo_path"):
            path = row[column]
            if not _is_legacy_local_path(path):
                continue
            result = migrate_column(conn, row["id"], column, path, args.dry_run)
            counts[result] += 1
        if not args.dry_run:
            conn.commit()

    print(f"\nDone. migrated={counts['migrated']} missing={counts['missing']} failed={counts['failed']}")
    if not args.dry_run and counts["migrated"] > 0:
        print("Local files in photos/ were left in place - verify photos display "
              "correctly in the app before deleting them by hand.")
    conn.close()


if __name__ == "__main__":
    main()
