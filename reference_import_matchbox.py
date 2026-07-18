"""
reference_import_matchbox.py

Builds Matchbox reference data (ground truth for match.py to validate
against) by parsing NCHWA.com's Lesney Matchbox price guide:

    https://www.nchwa.com/reg{N}to{N+9}.html        (Regular Wheels, 1953-1969)
    https://www.nchwa.com/superfast{N}to{N+9}.html   (SuperFast, 1969-1982)

This is a long-running, hobbyist-maintained guide (NCHWA = North Carolina
Hot Wheels Association) - not an official Mattel/Lesney source, but the best
available structured reference for exactly the vintage "Regular Wheels" era
(1953-1969) that covers pre-Hot-Wheels loose Matchbox pieces.

Unlike South Texas Diecast's per-year Hot Wheels pages, this guide is
organized by model NUMBER range (1-10, 11-20, ... 71-75), each page covering
all the different castings/years that occupied that number slot over time
(e.g. "1-A" 1953 Diesel Roller, "1-B" 1955 Road Roller, ... "1-E" 1968
Mercedes Benz Lorry are five DIFFERENT castings that each held the #1 slot
at different points). There are 8 pages per era, 16 total - a small, fixed
list, not a per-year loop.

Pricing here uses NCHWA's own "Star Value" rarity scale (1-18) rather than
direct dollar amounts, with a decode table printed at the bottom of each
page. Values quoted are explicitly for LOOSE, near-mint examples (no box) -
which lines up with what this import is actually for. Star values are
converted to an approximate dollar midpoint; a model with multiple color/
wheel variants gets averaged across its variants' star values into one
reference row, which is a simplification worth knowing about rather than a
precise multi-variant price.

Run this ONCE to seed Matchbox reference data, re-run occasionally if NCHWA
updates the guide. Caches raw HTML locally, same politeness rationale as
reference_import.py - this is a small, personally-run hobbyist site.

Usage:
    python reference_import_matchbox.py --era regular      # 1953-1969 only
    python reference_import_matchbox.py --era superfast     # 1969-1982 only
    python reference_import_matchbox.py --era all           # both (default)
"""

import argparse
import os
import re
import sqlite3
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

CACHE_DIR = Path("./html_cache_matchbox")
DB_PATH = os.environ.get("REFERENCE_DB_PATH", "reference.db")
REQUEST_DELAY_SECONDS = 2.0
USER_AGENT = "Mozilla/5.0 (personal hobby inventory tool; contact: your-email@example.com)"

# Star Value -> approximate USD range, as printed at the bottom of each
# NCHWA guide page. A '+' nudges toward the top of the band, '-' toward the
# bottom; no modifier uses the midpoint.
STAR_VALUE_USD = {
    1: (1, 5), 2: (6, 15), 3: (16, 25), 4: (26, 35), 5: (36, 50), 6: (51, 70),
    7: (71, 90), 8: (91, 110), 9: (111, 130), 10: (131, 160), 11: (161, 180),
    12: (181, 200), 13: (201, 220), 14: (221, 240), 15: (241, 270),
    16: (271, 300), 17: (301, 330), 18: (331, 350),
}

PAGE_RANGES = [(1, 10), (11, 20), (21, 30), (31, 40), (41, 50), (51, 60), (61, 70), (71, 75)]

ERAS = {
    "regular": {"prefix": "reg", "label": "Regular Wheels", "years": "1953-1969"},
    "superfast": {"prefix": "superfast", "label": "SuperFast", "years": "1969-1982"},
}


def decode_star_value(number: int, modifier: str) -> float:
    lo, hi = STAR_VALUE_USD.get(number, (number, number))
    mid = (lo + hi) / 2
    if modifier == "+":
        return round(mid + (hi - mid) * 0.4, 2)
    if modifier == "-":
        return round(mid - (mid - lo) * 0.4, 2)
    return round(mid, 2)


def fetch_page(url: str, cache_name: str) -> str:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / cache_name
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8", errors="ignore")

    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    cache_file.write_text(resp.text, encoding="utf-8")
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def parse_page(html: str, era_label: str, url: str) -> list[dict]:
    """
    Parse one NCHWA number-range page into structured rows. The page has one
    main data table with columns: #, Year, Name, Description, Wheels, Value,
    (picture link). We locate that table by its header row, then walk each
    subsequent row.

    This is intentionally forgiving - a handful of unparseable rows across
    16 pages is acceptable for a *validation reference*, not a source of
    truth for every field. Verify actual row counts after a real run; this
    was built from the page's rendered structure, not executed against the
    live site from this environment (nchwa.com isn't reachable from here) -
    worth a first-run sanity check on your end before trusting it fully.
    """
    soup = BeautifulSoup(html, "html.parser")

    data_table = None
    for table in soup.find_all("table"):
        header_text = " ".join(c.get_text(strip=True) for c in table.find_all(["td", "th"])[:8])
        if "Year" in header_text and "Name" in header_text:
            data_table = table
            break
    if data_table is None:
        return []

    rows = data_table.find_all("tr")
    entries = []

    for tr in rows[1:]:  # skip header row
        cells = tr.find_all("td")
        if len(cells) < 6:
            continue

        model_num = cells[0].get_text(strip=True)
        year_text = cells[1].get_text(strip=True)
        name = cells[2].get_text(strip=True)
        value_text = cells[5].get_text(strip=True)

        if not model_num or not year_text.isdigit() or not name:
            continue

        star_matches = re.findall(r"(\d{1,2})\s*([+-]?)", value_text)
        prices = [decode_star_value(int(n), mod) for n, mod in star_matches if n]
        avg_price = round(sum(prices) / len(prices), 2) if prices else None

        entries.append({
            "brand": "Matchbox",
            "sku": None,
            "collector_number": model_num,          # e.g. "1-A" - a specific casting, not a slot number
            "casting_name": name,
            "series_name": f"{era_label} 1-75",
            "release_year": int(year_text),
            "loose_value_usd": avg_price,             # this guide is loose/NM values only
            "carded_value_usd": None,                  # not covered - Regular Wheels era predates blister cards
            "source": f"nchwa:{era_label}",
            "source_url": url,
        })

    return entries


def upsert_rows(conn: sqlite3.Connection, rows: list[dict]) -> int:
    cur = conn.cursor()
    count = 0
    for r in rows:
        cur.execute("""
            INSERT INTO reference_castings
                (brand, sku, collector_number, casting_name, series_name,
                 release_year, loose_value_usd, carded_value_usd, source, source_url)
            VALUES (:brand, :sku, :collector_number, :casting_name, :series_name,
                    :release_year, :loose_value_usd, :carded_value_usd, :source, :source_url)
        """, r)
        count += 1
    conn.commit()
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--era", choices=["regular", "superfast", "all"], default="all",
                         help="regular = 1953-1969 (pre-Hot-Wheels vintage), "
                              "superfast = 1969-1982, all = both (default)")
    args = parser.parse_args()

    eras_to_run = ["regular", "superfast"] if args.era == "all" else [args.era]

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(Path("schema.sql").read_text())

    total = 0
    for era_key in eras_to_run:
        era = ERAS[era_key]
        print(f"\n{era['label']} era ({era['years']}):")
        for lo, hi in PAGE_RANGES:
            cache_name = f"{era['prefix']}{lo}to{hi}.html"
            url = f"https://www.nchwa.com/{era['prefix']}{lo}to{hi}.html"
            try:
                html = fetch_page(url, cache_name)
                rows = parse_page(html, era["label"], url)
                n = upsert_rows(conn, rows)
                print(f"  #{lo}-{hi}: imported {n} castings")
                total += n
            except requests.HTTPError as e:
                print(f"  #{lo}-{hi}: skipped (HTTP error: {e})")
            except Exception as e:
                print(f"  #{lo}-{hi}: skipped (parse error: {e})")

    print(f"\nDone. {total} Matchbox reference rows imported into {DB_PATH}")
    print("Worth a spot-check: pick a couple of models you own and confirm the "
          "casting name/year/price look right - this parser hasn't been run "
          "against the live site before, only built from its known structure.")
    conn.close()


if __name__ == "__main__":
    main()
