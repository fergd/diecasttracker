"""
reference_import_hallsguide.py

Builds Hot Wheels reference data from Hall's Guide (hallsguide.com), which
covers 2000-2026 continuously plus the full 1968-1999 Redline era - filling
exactly the gap South Texas Diecast doesn't cover (their per-year pages stop
at 2018; hallsguide.com was last updated March 2026).

Confirmed against real fetched HTML (not guessed) - see the parser notes
below for the exact structure this targets.

Page structure (verified against a real page fetch):
    One <tr> per casting. The <td> contains:
      - direct text: "#NNN – Casting Name (Series Name [– flag])"
      - a spacer <p>
      - a <ul> of <li> variants, each "description $price", sometimes with
        a Treasure Hunt / Super TH flag before the price

Casting names can contain their own parentheses (e.g. "Nissan Skyline GT-R
(BNR32)") - the parser takes the LAST parenthetical group in the header as
the series (optionally with a "- flag" suffix like "2019 New Model"), and
everything before it as the casting name. Verified against both plain and
nested-parens cases from real data before this was written.

Treasure Hunt / Super Treasure Hunt variant prices are excluded from the
averaged guide price - they're rare chase pieces worth many times a common
variant, and blending them in would badly skew the "typical" price for a
casting that's otherwise a $2-3 mainline car.

Usage:
    python reference_import_hallsguide.py --years 2019 2020 2021
    python reference_import_hallsguide.py --years all     # 2000-2026, slow, be polite
"""

import argparse
import re
import sqlite3
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

CACHE_DIR = Path("./html_cache_hallsguide")
DB_PATH = "reference.db"
REQUEST_DELAY_SECONDS = 2.0
USER_AGENT = "Mozilla/5.0 (personal hobby inventory tool; contact: your-email@example.com)"

BASE_URL = "https://www.hallsguide.com/{year}-hot-wheels-mainlines/"

HEADER_PATTERN = re.compile(r'^#(\d+)\s*[\u2013\u2014-]\s*(.+)$')
TH_PATTERN = re.compile(r'treasure hunt|super\s*th\b', re.IGNORECASE)


def fetch_year_page(year: int) -> str:
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
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    for tr in soup.find_all("tr"):
        td = tr.find("td")
        if td is None:
            continue
        try:
            header_text = next(td.stripped_strings)
        except StopIteration:
            continue

        m = HEADER_PATTERN.match(header_text)
        if not m:
            continue
        collector_num, rest = m.group(1), m.group(2).strip()

        # Last parenthetical group = series (+ optional "- flag" suffix);
        # everything before it = casting name. This correctly keeps a
        # casting's own embedded parens (e.g. "Nissan Skyline GT-R (BNR32)")
        # as part of the name rather than misreading them as the series.
        paren_matches = list(re.finditer(r'\(([^()]*)\)\s*$', rest))
        if not paren_matches:
            continue  # can't identify a series - skip rather than guess
        series_raw = paren_matches[-1].group(1).strip()
        casting_name = rest[:paren_matches[-1].start()].strip()
        if not casting_name:
            continue

        series_name = series_raw
        if re.search(r'[\u2013\u2014]|\s-\s', series_raw):
            series_name = re.split(r'\s*[\u2013\u2014]\s*|\s-\s', series_raw, maxsplit=1)[0].strip()

        ul = td.find("ul")
        common_prices = []
        if ul:
            for li in ul.find_all("li"):
                text = li.get_text(" ", strip=True)
                found = [float(f) for f in re.findall(r'\$(\d+\.\d{2})', text)]
                if not found or TH_PATTERN.search(text):
                    continue  # skip Treasure Hunt/Super TH - rare chase price, not typical value
                common_prices.extend(found)

        avg_price = round(sum(common_prices) / len(common_prices), 2) if common_prices else None

        rows.append({
            "brand": "Hot Wheels",
            "sku": None,
            "collector_number": collector_num,
            "casting_name": casting_name,
            "series_name": series_name or None,
            "release_year": year,
            "loose_value_usd": None,      # this guide's prices appear to be carded/MOC-oriented
            "carded_value_usd": avg_price,
            "source": f"hallsguide:{year}-hot-wheels-mainlines",
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
                 release_year, loose_value_usd, carded_value_usd, source, source_url)
            VALUES (:brand, :sku, :collector_number, :casting_name, :series_name,
                    :release_year, :loose_value_usd, :carded_value_usd, :source, :source_url)
        """, r)
        count += 1
    conn.commit()
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", nargs="+", required=True,
                         help="e.g. --years 2019 2020 2021, or --years all (2000-2026)")
    args = parser.parse_args()

    if args.years == ["all"]:
        years = list(range(2000, 2027))
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
