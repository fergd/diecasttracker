"""
reference_import_realpriceguides.py

Builds Matchbox reference data from realpriceguides.com's "Matchbox 1-75
Variations" guide. This is a second, independent Matchbox source alongside
reference_import_matchbox.py (NCHWA), and it fills the gap NCHWA doesn't
cover: NCHWA's SuperFast pages stop at 1982, while this site's per-slot
pages run from 1953 all the way into the 1990s (reissues, 1980s-90s
mainline Matchbox), all on ONE page per number slot rather than split by
era. Values here are explicit loose/played-with prices (no box/card
distinction is made anywhere on the source site).

    https://www.realpriceguides.com/matchbox/match{N}a.htm

Discovered by fetching the site's index page (matchbox.asp) and extracting
links matching match<N>a.htm - there are 11 of these (confirmed: 1,2,3,4,5,
7,8,9,10,11,12; there is no match6a.htm - slot 6 is folded into match5a.htm
alongside slot 5, and the file-number-to-slot-number mapping is NOT 1:1
generally, e.g. match3a.htm covers slots 3 AND 4). Rather than assume any
filename<->slot mapping, this importer trusts whatever slot numbers actually
appear in the "#" column of each page's data table - the safer approach
given the site's own numbering is inconsistent.

Page structure (verified against real fetches for pages 1a, 7a, 11a, 12a -
deliberately sampled the first, a middle, and the last two, since the site
turned out to have real inconsistencies between pages):

    One data table with 5 columns: #, Name, Description, <Year-or-Date>,
    Value. The 4th column header is "Year" on some pages and "Date" on
    others (confirmed on match7a/11a/12a vs match1a) - detection must accept
    either.

    Two row kinds, identified by the "#" cell:
      - A "slot row" (e.g. "7-A", "7B", "7 F" - hyphenation/spacing is
        inconsistent across and even within pages) carries Name, Description,
        Year in its own cells. If it ALSO has a Value, it's priced directly
        (no variants follow, e.g. "7C Ford Refuse Truck ... 1966 | 8-10").
        If Value is blank, one or more variant rows follow.
      - A "variant row" ("v1", "v2", ... - confirmed one genuine typo in the
        wild, "v.l" for "v1") has an empty Name/Year; its own Description is
        the color/deco variant, and its own Value is that variant's price.
        A variant row occasionally carries its own Year (a later reissue),
        which overrides the parent slot row's year for that one entry.

    Values are either a range ("30-35") or a single flat number ("40") -
    both forms appear, sometimes on the same page. Ranges are averaged.

Usage:
    python reference_import_realpriceguides.py
"""

import os
import re
import sqlite3
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

CACHE_DIR = Path("./html_cache_realpriceguides")
DB_PATH = os.environ.get("REFERENCE_DB_PATH", "reference.db")
REQUEST_DELAY_SECONDS = 2.0
USER_AGENT = "Mozilla/5.0 (personal hobby inventory tool; contact: your-email@example.com)"

BASE = "https://www.realpriceguides.com/matchbox/"
INDEX_URL = BASE + "matchbox.asp"
PAGE_LINK_PATTERN = re.compile(r'^match\d+a\.htm$', re.IGNORECASE)

SLOT_ROW_PATTERN = re.compile(r'^(\d+)\s*-?\s*([A-Za-z]+)$')
VARIANT_ROW_PATTERN = re.compile(r'^v\.?[A-Za-z0-9]+$', re.IGNORECASE)
VALUE_PATTERN = re.compile(r'(\d+)\s*(?:-\s*(\d+))?')


def fetch(url: str, cache_name: str) -> str:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / cache_name
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8", errors="ignore")

    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    cache_file.write_text(resp.text, encoding="utf-8")
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def discover_pages() -> list[str]:
    html = fetch(INDEX_URL, "matchbox_index.htm")
    soup = BeautifulSoup(html, "html.parser")
    pages = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if PAGE_LINK_PATTERN.match(href) and href not in pages:
            pages.append(href)
    return pages


def _find_data_table(soup: BeautifulSoup):
    tables = soup.find_all("table")

    for table in tables:
        cells = table.find_all(["td", "th"], recursive=True)[:6]
        header = " ".join(c.get_text(strip=True) for c in cells)
        if "Name" in header and ("Year" in header or "Date" in header):
            return table

    # Fallback: some pages (confirmed: match9a.htm, match10a.htm) have no
    # header row at all and jump straight into data - detect by shape
    # instead, i.e. a table with a 5-cell row whose first cell is a slot
    # code ("9A", "10B", ...).
    for table in tables:
        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) == 5 and SLOT_ROW_PATTERN.match(cells[0].get_text(strip=True)):
                return table
    return None


def _parse_value(text: str) -> float | None:
    m = VALUE_PATTERN.search(text.replace(",", ""))
    if not m:
        return None
    lo = int(m.group(1))
    hi = int(m.group(2)) if m.group(2) else lo
    return round((lo + hi) / 2, 2)


def parse_page(html: str, page: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    table = _find_data_table(soup)
    if table is None:
        return []

    rows = []
    current_name = None
    current_year = None
    current_collector_number = None

    for tr in table.find_all("tr"):
        # NOT recursive=False: some pages (confirmed: match4a.htm) wrap each
        # row's cells in a stray unclosed <i> tag right after <tr>, which
        # makes BeautifulSoup nest the <td>s as grandchildren rather than
        # direct children - a direct-children-only lookup silently finds
        # nothing on those pages. No nested tables appear inside these
        # cells, so a plain recursive find is safe here.
        cells = tr.find_all("td")
        if len(cells) < 5:
            continue
        num_raw, name_raw, desc_raw, year_raw, value_raw = (
            c.get_text(" ", strip=True) for c in cells[:5]
        )
        if num_raw == "#":
            continue  # header row

        slot_m = SLOT_ROW_PATTERN.match(num_raw)
        is_variant = VARIANT_ROW_PATTERN.match(num_raw) is not None

        if slot_m and not is_variant:
            current_name = name_raw or None
            current_year = int(year_raw) if year_raw.isdigit() else None
            current_collector_number = f"{slot_m.group(1)}-{slot_m.group(2).upper()}"
            variant_desc = desc_raw or None
        elif is_variant:
            variant_desc = desc_raw or None  # identity (name/number) inherited below
        else:
            continue  # unrecognized "#" cell shape - skip rather than guess

        if current_name is None:
            continue  # variant row with no slot row seen yet - malformed, skip

        price = _parse_value(value_raw)
        if price is None:
            continue  # this row is just a slot header with variants below it

        row_year = int(year_raw) if year_raw.isdigit() else current_year

        rows.append({
            "brand": "Matchbox",
            "sku": None,
            "collector_number": current_collector_number,
            "casting_name": current_name,
            "series_name": "Matchbox 1-75",
            "release_year": row_year,
            "variant_desc": variant_desc,
            "loose_value_usd": price,
            "carded_value_usd": None,  # this guide is loose/played-with values only
            "source": f"realpriceguides:{page}",
            "source_url": BASE + page,
        })

    return rows


def upsert_rows(conn: sqlite3.Connection, rows: list[dict]) -> int:
    cur = conn.cursor()
    count = 0
    for r in rows:
        cur.execute("""
            INSERT INTO reference_castings
                (brand, sku, collector_number, casting_name, series_name,
                 release_year, variant_desc, loose_value_usd, carded_value_usd,
                 source, source_url)
            VALUES (:brand, :sku, :collector_number, :casting_name, :series_name,
                    :release_year, :variant_desc, :loose_value_usd, :carded_value_usd,
                    :source, :source_url)
        """, r)
        count += 1
    conn.commit()
    return count


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(Path("schema.sql").read_text())

    pages = discover_pages()
    print(f"Discovered {len(pages)} number-slot pages: {pages}")

    total = 0
    for page in pages:
        url = BASE + page
        try:
            html = fetch(url, page)
            rows = parse_page(html, page)
            n = upsert_rows(conn, rows)
            print(f"{page}: imported {n} rows")
            total += n
        except requests.HTTPError as e:
            print(f"{page}: skipped (HTTP error: {e})")
        except Exception as e:
            print(f"{page}: skipped (parse error: {e})")

    print(f"\nDone. {total} Matchbox reference rows imported into {DB_PATH}")
    conn.close()


if __name__ == "__main__":
    main()
