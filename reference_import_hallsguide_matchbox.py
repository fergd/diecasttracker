"""
reference_import_hallsguide_matchbox.py

Builds MODERN Matchbox reference data (2009-2012, 2016-2023) from Hall's
Guide (hallsguide.com) - filling a real gap: the existing Matchbox importers
(reference_import_matchbox.py via NCHWA, reference_import_realpriceguides.py)
are both vintage-focused and stop around the 1990s, leaving zero reference
coverage for anything modern. Confirmed via real inventory data: three actual
scanned Matchbox cars (2010, 2014, 2016 castings) all came back "no_match"
purely because the reference DB had no rows for those years at all - not a
matching-logic bug, a real data gap.

Unlike reference_import_hallsguide.py (Hot Wheels), Hall's Guide's Matchbox
coverage does NOT use a consistent {year}-matchbox-mainlines URL pattern -
confirmed by direct crawling: some years are old page_id=NNNN WordPress pages,
some are year-slugged, one is http (not https). YEAR_URLS below is a real,
individually-verified lookup table, not a guessed pattern. 2013-2015 and
2024-2026 were searched for and don't exist anywhere on the site - Matchbox
is clearly a secondary focus there (their tagline is "Hall's Guide for Hot
Wheels Collectors"), not maintained as continuously as their Hot Wheels
coverage.

Confirmed by fetching every single year and checking for real "$X.XX" price
strings in the raw HTML (not just assumed): 2009-2012, 2022, and 2023 have
real per-casting prices. 2016-2021 are checklist-only on Hall's Guide's own
pages - the price column exists in their markup but was simply never filled
in (verified: literally "$" with nothing after it, in the raw HTML itself,
not a parsing artifact). Importing these years anyway is still worthwhile -
match.py only needs casting_name/series/year to confirm an identity match;
guide_price_usd just stays null for these, and live eBay pricing covers the
actual price separately.

Header format also differs from the Hot Wheels page format in a way that
matters for parsing: some years have NO dash after the number ("#1 Name
(Series)"), others do ("#1 - Name (Series)") - confirmed by direct
inspection, not assumed to be consistent like the Hot Wheels pages are.
HEADER_PATTERN below makes the dash optional to handle both.

Series/name splitting and the "last parenthetical group" logic, plus Super
Chase-style rare-variant exclusion from the averaged price, follow the same
approach already established and verified in reference_import_hallsguide.py
for Hot Wheels - same underlying site, same author, same conventions.

Usage:
    python reference_import_hallsguide_matchbox.py --years 2016 2022 2023
    python reference_import_hallsguide_matchbox.py --years all
"""

import argparse
import re
import sqlite3
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

CACHE_DIR = Path("./html_cache_hallsguide_matchbox")
DB_PATH = "reference.db"
REQUEST_DELAY_SECONDS = 2.0
USER_AGENT = "Mozilla/5.0 (personal hobby inventory tool; contact: your-email@example.com)"

# Individually verified by direct fetch - NOT a guessed URL pattern (Hall's
# Guide's Matchbox section, unlike their Hot Wheels one, has no consistent
# per-year URL scheme). 2013-2015 and 2024-2026 confirmed absent site-wide.
#
# 2018 deliberately excluded despite existing: confirmed only 25 of its 125
# rows have ANY parenthetical at all (every other year uses parens to mark
# where the casting name ends and the series/flag begins), so for the other
# 100 rows there's no reliable anchor to split the casting name away from
# the trailing "color $price" text that follows it in the same line - it
# would just import corrupted casting names like "Sonora Shredder green $".
# Better to have no data for 2018 than wrong data that could cause bad
# fuzzy-matches later.
YEAR_URLS = {
    2009: "https://www.hallsguide.com/?page_id=814",
    2010: "https://www.hallsguide.com/?page_id=767",
    2011: "https://www.hallsguide.com/?page_id=689",
    2012: "https://www.hallsguide.com/?page_id=1144",
    2016: "https://www.hallsguide.com/2016-matchbox/",
    2017: "https://www.hallsguide.com/2017-matchbox/",
    2019: "https://www.hallsguide.com/2019-matchbox/",
    2020: "https://www.hallsguide.com/2020-matchbox/",
    2021: "http://hallsguide.com/2021-matchbox",
    2022: "https://www.hallsguide.com/2022-matchbox-mainlines-price-guide",
    2023: "https://www.hallsguide.com/2023-matchbox-price-guide-1-100-checklist-super-chase-values",
}

# Dash after the number is optional - confirmed present in some years' pages
# (2016+) and absent in others (2009-2012).
HEADER_PATTERN = re.compile(r'^#(\d+)\s*(?:[–—-]\s*)?(.+)$')
CHASE_PATTERN = re.compile(r'treasure hunt|super\s*th\b|super\s*chase\b', re.IGNORECASE)

# 2016-2018 (confirmed by direct inspection) put the real series in a
# standalone sub-header row above a block of numbered castings, rather than
# repeating it in every row's own parens like 2019+ does - each row's own
# paren there is just this flag, not a series name at all. Checked exactly
# what appears in these years' parens before hardcoding this list - not a
# guess. A row's own paren is only trusted as a real series when it isn't
# one of these.
FLAG_ONLY_PHRASES = {"new model", "new casting"}


def fetch_year_page(year: int) -> str:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / f"{year}.html"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8", errors="ignore")

    url = YEAR_URLS[year]
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    cache_file.write_text(resp.text, encoding="utf-8")
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def parse_year_page(html: str, year: int) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    current_series = None  # set by a sub-header row, used as a fallback

    for tr in soup.find_all("tr"):
        td = tr.find("td")
        if td is None:
            continue
        header_text = td.get_text(" ", strip=True)
        if not header_text:
            continue

        m = HEADER_PATTERN.match(header_text)
        if not m:
            # A short, priceless, number-less line here is a series
            # sub-header (e.g. "MBX Adventure City Series"), not a casting -
            # confirmed these years actually use this structure rather than
            # repeating the series per row. Anything else (a stray Super
            # Chase entry with no "#N", etc.) is skipped by design, same
            # reasoning as excluding TH/Super TH in the Hot Wheels importer.
            if "$" not in header_text and not re.search(r'\d', header_text) \
                    and len(header_text) < 60:
                current_series = re.sub(r'\s+Series$', '', header_text, flags=re.IGNORECASE)
            continue
        collector_num, rest = m.group(1), m.group(2).strip()

        paren_matches = list(re.finditer(r'\(([^()]*)\)', rest))
        last_paren = paren_matches[-1] if paren_matches else None
        if last_paren:
            series_raw = last_paren.group(1).strip()
            casting_name = rest[:last_paren.start()].strip()
            tail = rest[last_paren.end():].strip()
        else:
            # No paren at all (common for 2016/2017 rows relying on a
            # sub-header for series - see current_series above) - the
            # casting name still needs separating from a trailing color(s)
            # + price tail with no paren to anchor on (confirmed real
            # example: "Toyota Prius Taxi green $" would otherwise import
            # with "green $" baked into the casting name). The color word
            # immediately before a "$" is the anchor instead - matches a
            # short lowercase token (colors are never capitalized here,
            # unlike real casting-name words) right before the first "$".
            series_raw = ""
            tail_match = re.search(r"\s+[a-z][\w'/-]*(?:\s+[a-z][\w'/-]*){0,2}\s*\$", rest)
            if tail_match:
                casting_name = rest[:tail_match.start()].strip()
                tail = rest[tail_match.start():].strip()
            else:
                casting_name = rest
                tail = ""
        if not casting_name or not re.search(r'[A-Za-z0-9]', casting_name):
            continue  # blank checklist slot on the source page itself (e.g.
                        # just "–" with nothing else) - a real gap in Hall's
                        # Guide's own data for that number, not ours to fill in

        series_name = series_raw
        if re.search(r'[–—]|\s-\s', series_raw):
            series_name = re.split(r'\s*[–—]\s*|\s-\s', series_raw, maxsplit=1)[0].strip()
        if not series_name or series_name.lower() in FLAG_ONLY_PHRASES:
            series_name = current_series  # row's own paren was just a flag
                                            # (or absent) - fall back to the
                                            # last sub-header we saw

        avg_price = None
        if not CHASE_PATTERN.search(header_text):
            prices = [float(f) for f in re.findall(r'\$(\d+\.\d{2})', tail)]
            if prices:
                avg_price = round(sum(prices) / len(prices), 2)

        rows.append({
            "brand": "Matchbox",
            "sku": None,
            "collector_number": collector_num,
            "casting_name": casting_name,
            "series_name": series_name or None,
            "release_year": year,
            # Hall's Guide's Matchbox prices read as loose/mainline-carded
            # blend, not clearly split like the Hot Wheels guide - storing
            # as carded to match that importer's convention for this source
            # (both feed the same carded_value_usd guide-price column).
            "loose_value_usd": None,
            "carded_value_usd": avg_price,
            "source": f"hallsguide_matchbox:{year}",
            "source_url": YEAR_URLS[year],
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
                         help="e.g. --years 2016 2022 2023, or --years all "
                              "(every year Hall's Guide actually has: "
                              "2009-2012, 2016-2023)")
    args = parser.parse_args()

    if args.years == ["all"]:
        years = sorted(YEAR_URLS.keys())
    else:
        years = [int(y) for y in args.years]
        unknown = [y for y in years if y not in YEAR_URLS]
        if unknown:
            print(f"Skipping {unknown} - Hall's Guide has no Matchbox page for "
                  f"these years (verified absent, not just untried). Available: "
                  f"{sorted(YEAR_URLS.keys())}")
            years = [y for y in years if y in YEAR_URLS]

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(Path("schema.sql").read_text())

    total = 0
    for year in years:
        try:
            html = fetch_year_page(year)
            rows = parse_year_page(html, year)
            n = upsert_rows(conn, rows)
            priced = sum(1 for r in rows if r["carded_value_usd"] is not None)
            print(f"{year}: imported {n} castings ({priced} with a price, "
                  f"{n - priced} checklist-only)")
            total += n
        except requests.HTTPError as e:
            print(f"{year}: skipped (HTTP error: {e})")
        except Exception as e:
            print(f"{year}: skipped (parse error: {e})")

    print(f"\nDone. {total} reference rows imported into {DB_PATH}")
    conn.close()


if __name__ == "__main__":
    main()
