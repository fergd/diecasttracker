"""
reference_import.py

Builds the local ground-truth table (reference_castings) by parsing
South Texas Diecast's per-year Hot Wheels mainline guide pages:

    https://southtexasdiecast.com/hwguide/{year}.html

This site is a long-running, community-maintained checklist/price guide
(28,000+ cars, updated weekly) - not an official Mattel API, but the best
available structured source. Values here reflect their editorial estimate,
based on eBay/TTP/show averages, for Near Mint / Brand New condition.

Run this ONCE to seed your reference DB, then periodically (e.g. monthly)
to pick up newly-catalogued years. Cache raw HTML locally so re-runs don't
hammer their server - they're a small donation-funded site, not a company API.

NOTE: this must run on a machine with normal internet access (e.g. your
backupbox), not in a sandboxed environment with restricted egress.

Usage:
    python reference_import.py --years 2013 2014 2015 2016
    python reference_import.py --years all          # 1968-current, slow, be polite
"""

import argparse
import re
import sqlite3
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://southtexasdiecast.com/hwguide/{year}.html"
CACHE_DIR = Path("./html_cache")
DB_PATH = "reference.db"
REQUEST_DELAY_SECONDS = 2.0  # be polite - this is a small volunteer-run site
USER_AGENT = "Mozilla/5.0 (personal hobby inventory tool; contact: your-email@example.com)"


def fetch_year_page(year: int) -> str:
    """Fetch (with local caching) the raw HTML for a given year's mainline guide."""
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / f"{year}.html"

    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8", errors="ignore")

    url = BASE_URL.format(year=year)
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    cache_file.write_text(resp.text, encoding="utf-8")
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def parse_year_page(html: str, year: int) -> list[dict]:
    """
    Parse a South Texas Diecast year-guide page into structured rows.

    Confirmed against the real live HTML (old-school table markup, uppercase
    tags): each data row is a <TR> with exactly 7 <TD> cells:
        [0] SKU (e.g. "DHP37")
        [1] collector number (e.g. "001")
        [2] casting name, as a link's text (e.g. "Corvette C7.R")
        [3] series - two lines separated by <br>: "{year} Hot Wheels" / series name
        [4] color/deco description (not stored - not needed for matching)
        [5] loose value (e.g. "$0.50")
        [6] carded/new value (e.g. "$1.00")

    Rows that don't match this shape (headers, ads, other page furniture)
    are skipped rather than erroring - this is a validation reference, not
    the source of truth for every field, so missing a handful of odd rows
    is an acceptable tradeoff for not being fragile against page furniture.
    """
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    sku_pattern = re.compile(r"^[A-Z0-9]{4,8}$")

    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) != 7:
            continue

        sku = tds[0].get_text(strip=True)
        collector_num = tds[1].get_text(strip=True)
        if not sku_pattern.match(sku) or not collector_num.isdigit():
            continue

        name_link = tds[2].find("a")
        casting_name = (name_link.get_text(strip=True) if name_link
                         else tds[2].get_text(strip=True))
        if not casting_name:
            continue

        # Series cell is two lines split by <br> - "{year} Hot Wheels" then
        # the actual series name (e.g. "HW Race Team"). Take the text after
        # the <br>; fall back to the whole cell if that's not there.
        series_cell = tds[3]
        br = series_cell.find("br")
        if br and br.next_sibling:
            series_name = str(br.next_sibling).strip()
        else:
            series_name = series_cell.get_text(" ", strip=True)

        def _parse_price(cell):
            text = cell.get_text(strip=True).replace("$", "").replace(",", "")
            try:
                return float(text)
            except ValueError:
                return None

        loose_price = _parse_price(tds[5])
        carded_price = _parse_price(tds[6])

        rows.append({
            "brand": "Hot Wheels",
            "sku": sku,
            "collector_number": collector_num,
            "casting_name": casting_name,
            "series_name": series_name or None,
            "release_year": year,
            "is_treasure_hunt": None,   # not distinguished by this table shape - a
                                          # future pass could inspect row bgcolor/flags
            "is_exclusive": None,
            "loose_value_usd": loose_price,
            "carded_value_usd": carded_price,
            "source": f"southtexasdiecast:{year}.html",
            "source_url": BASE_URL.format(year=year),
        })

    return rows


def upsert_rows(conn: sqlite3.Connection, rows: list[dict]) -> int:
    cur = conn.cursor()
    count = 0
    for r in rows:
        cur.execute("""
            INSERT INTO reference_castings
                (brand, sku, collector_number, casting_name, series_name,
                 release_year, is_treasure_hunt, is_exclusive,
                 loose_value_usd, carded_value_usd, source, source_url)
            VALUES (:brand, :sku, :collector_number, :casting_name, :series_name,
                    :release_year, :is_treasure_hunt, :is_exclusive,
                    :loose_value_usd, :carded_value_usd, :source, :source_url)
        """, r)
        count += 1
    conn.commit()
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", nargs="+", required=True,
                         help="e.g. --years 2014 2015 2016, or --years all")
    args = parser.parse_args()

    if args.years == ["all"]:
        years = list(range(1968, 2027))
    else:
        years = [int(y) for y in args.years]

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(Path("schema.sql").read_text())

    total = 0
    for year in years:
        try:
            html = fetch_year_page(year)
            rows = parse_year_page(html, year)
            n = upsert_rows(conn, rows)
            print(f"{year}: imported {n} castings")
            total += n
        except requests.HTTPError as e:
            print(f"{year}: skipped (HTTP error: {e})")
        except Exception as e:
            print(f"{year}: skipped (parse error: {e})")

    print(f"\nDone. {total} reference rows imported into {DB_PATH}")
    conn.close()


if __name__ == "__main__":
    main()
