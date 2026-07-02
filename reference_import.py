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

    The page is a flat list of entries, each roughly:
        SKU  Collector#  [Casting Name](link)  Series Name  [flags: New Casting / Treasure Hunt / Super TH / Exclusive]
        description text
        Loose price   Carded price

    The HTML is old-school and not cleanly semantic, so this parser works off
    text patterns rather than strict tag structure. It's intentionally
    forgiving - a few malformed rows are expected and acceptable, since this
    is a *validation reference*, not the source of truth for every field.
    """
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    # Each entry starts with a bolded SKU-like code (e.g. DHP37) followed by
    # a collector number, then the casting name (often a link), then series
    # name, then a description, then two dollar-amount fields.
    # We walk the list items / bold-tag sequence rather than assuming <table>.
    text_blocks = soup.get_text("\n").split("\n")

    sku_pattern = re.compile(r"^[A-Z]{2,4}\d{2,3}$")
    price_pattern = re.compile(r"^\$\d+\.\d{2}$")

    i = 0
    while i < len(text_blocks):
        line = text_blocks[i].strip()
        if sku_pattern.match(line):
            sku = line
            j = i + 1
            collector_num = None
            if j < len(text_blocks) and re.match(r"^\d{2,4}$", text_blocks[j].strip()):
                collector_num = text_blocks[j].strip()
                j += 1
            casting_name = text_blocks[j].strip() if j < len(text_blocks) else None
            j += 1

            # scan forward a few lines for series name / flags / prices
            series_name = None
            flags = []
            prices = []
            lookahead_limit = j + 8
            while j < min(lookahead_limit, len(text_blocks)):
                t = text_blocks[j].strip()
                if price_pattern.match(t):
                    prices.append(float(t.replace("$", "")))
                elif t in ("New Casting", "Treasure Hunt", "Super Treasure Hunt", "ZAMAC"):
                    flags.append(t)
                elif "Exclusive" in t:
                    flags.append(t)
                elif t and series_name is None and not sku_pattern.match(t):
                    series_name = t
                if len(prices) >= 2:
                    break
                j += 1

            if casting_name:
                rows.append({
                    "brand": "Hot Wheels",
                    "sku": sku,
                    "collector_number": collector_num,
                    "casting_name": casting_name,
                    "series_name": series_name,
                    "release_year": year,
                    "is_treasure_hunt": "Super TH" if "Super Treasure Hunt" in flags
                                         else ("TH" if "Treasure Hunt" in flags else None),
                    "is_exclusive": next((f for f in flags if "Exclusive" in f), None),
                    "loose_value_usd": prices[0] if len(prices) > 0 else None,
                    "carded_value_usd": prices[1] if len(prices) > 1 else None,
                    "source": f"southtexasdiecast:{year}.html",
                    "source_url": BASE_URL.format(year=year),
                })
            i = j
        i += 1

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
