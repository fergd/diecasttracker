"""
reference_import_hotwheels_wiki.py

Builds Hot Wheels reference data from the Hot Wheels Wiki (hotwheels.fandom.com),
covering 2000-2026 mainline releases. This is a second, independent source for
the same year range Hall's Guide covers - useful for cross-checking casting
names/series against reference_import_hallsguide.py, and it carries something
neither South Texas Diecast nor Hall's Guide has: a photo per casting variant
(File: filename, resolvable via Special:FilePath). No price data - this wiki
is a checklist/identification source, not a price guide.

Fandom's page HTML is behind a Cloudflare bot challenge and returns a "Just a
moment..." interstitial to plain requests - confirmed by testing directly.
The MediaWiki API (api.php) bypasses this entirely and returns raw wikitext,
which is also much easier to parse than the rendered HTML would be. This
importer uses:

    https://hotwheels.fandom.com/api.php?action=parse&page=<page>&format=json&prop=wikitext

Page structure (verified against real fetches for 2000, 2001, 2002, 2005,
2010, 2026 - the transition to this format holds for the whole 2000-2026
range; 1999 and earlier use an incompatible {{List0000White|...}} template
macro instead of a plain wikitable, and are out of scope here):

    One or more `{| class="...wikitable" ... |}` blocks per page (a year with
    multiple sub-series, e.g. 2005, has one sub-table per series heading).
    Within each table, `|-` marks a row boundary; the first four data cells
    per row, in fixed order, are Toy # (SKU), Col.# (collector number), Model
    Name (casting name, as a wikilink), Series (wikilink, often wrapped in
    bgcolor/font/bold markup plus a "New for <year>!" flag). Most years then
    have Series # and Photo as a 5th/6th column; a few years (confirmed: 2013,
    2015) drop the Series # column and go straight from Series to Photo -
    neither trailing column is stored (no schema column for either), so the
    parser accepts 5+ cells and only reads the first four by position.

    A row is only accepted if its SKU cell looks like a Mattel item code, its
    collector-number cell is purely digits, and its Model Name cell contains
    a wikilink - anything else is skipped rather than guessed at, same
    philosophy as reference_import_hallsguide.py.

Usage:
    python reference_import_hotwheels_wiki.py --years 2019 2020 2021
    python reference_import_hotwheels_wiki.py --years all     # 2000-2026, slow, be polite
"""

import argparse
import json
import os
import re
import sqlite3
import time
from pathlib import Path

import requests

CACHE_DIR = Path("./html_cache_hotwheels_wiki")
DB_PATH = os.environ.get("REFERENCE_DB_PATH", "reference.db")
REQUEST_DELAY_SECONDS = 1.5
USER_AGENT = "Mozilla/5.0 (personal hobby inventory tool; contact: your-email@example.com)"

API_URL = "https://hotwheels.fandom.com/api.php"
PAGE_TITLE = "List_of_{year}_Hot_Wheels"
PAGE_URL = "https://hotwheels.fandom.com/wiki/List_of_{year}_Hot_Wheels"

SKU_PATTERN = re.compile(r'^[A-Za-z0-9]{3,10}$')
COLNUM_PATTERN = re.compile(r'^\d{1,4}$')
WIKILINK_PATTERN = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')
# Attribute prefix before a cell's real content, e.g. `bgcolor="gray"|text`.
# Some rows also wedge a stray <font ...> tag between the attribute and the
# pipe (`bgcolor="gray" <font color="white">|text`, a wiki-editing quirk,
# confirmed against real 2013 rows) - the (?:<[^>]+>\s*)* tolerates that.
ATTR_PREFIX_PATTERN = re.compile(r'^\s*\w+\s*=\s*(?:"[^"]*"|[^\s|<]+)\s*(?:<[^>]+>\s*)*\|')
ZERO_WIDTH_PATTERN = re.compile(r'[​‌‍﻿]')


def fetch_year_wikitext(year: int) -> str:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file = CACHE_DIR / f"{year}.wikitext"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8", errors="ignore")

    resp = requests.get(
        API_URL,
        params={
            "action": "parse",
            "page": PAGE_TITLE.format(year=year),
            "format": "json",
            "prop": "wikitext",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise ValueError(data["error"].get("info", "unknown MediaWiki API error"))
    wikitext = data["parse"]["wikitext"]["*"]

    cache_file.write_text(wikitext, encoding="utf-8")
    time.sleep(REQUEST_DELAY_SECONDS)
    return wikitext


def _clean(text: str) -> str:
    return ZERO_WIDTH_PATTERN.sub("", text).strip()


def _strip_cell_attrs(cell: str) -> str:
    """Strip a leading `key="value"|` attribute prefix some cells carry,
    e.g. `bgcolor="green"|<font ...>text</font>` -> `<font ...>text</font>`."""
    m = ATTR_PREFIX_PATTERN.match(cell)
    return cell[m.end():] if m else cell


def _first_wikilink_display(text: str) -> tuple[str | None, str]:
    """Returns (display_text_of_first_wikilink, remainder_after_it)."""
    m = WIKILINK_PATTERN.search(text)
    if not m:
        return None, text
    target, display = m.group(1), m.group(2)
    name = (display or target).strip()
    remainder = text[m.end():]
    return name, remainder


def _strip_markup(text: str) -> str:
    text = re.sub(r'<br\s*/?>', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'</?font[^>]*>', '', text, flags=re.IGNORECASE)
    text = text.replace("'''", "").replace("''", "")
    return _clean(text)


def parse_series_cell(raw: str) -> str | None:
    cell = _strip_cell_attrs(_clean(raw))
    # The primary series is always the FIRST wikilink in the cell; extra
    # flags ("New for <year>!", Treasure Hunt) follow as later <br>-separated
    # links and are ignored by taking only the first match. Do not pre-split
    # on <br> before this - a few rows (confirmed: 2019 FYG05) wedge a stray
    # <br> INSIDE the first link's own display text
    # (`[[Target|<br><font...>Display]]`), which would truncate the link
    # itself if split first. _strip_markup below cleans up any such embedded
    # <br>/<font> junk that survives into the extracted display text.
    name, _ = _first_wikilink_display(cell)
    if name is None:
        # No wikilink at all - cell is plain text/markup with possibly
        # multiple <br>-separated flags; the primary series is the first one.
        first_segment = re.split(r'<br\s*/?>', cell, maxsplit=1, flags=re.IGNORECASE)[0]
        name = _strip_markup(first_segment)
    else:
        name = _strip_markup(name)
    return name or None


def parse_model_name_cell(raw: str) -> tuple[str | None, str | None]:
    """Returns (casting_name, variant_desc). variant_desc captures trailing
    text after the wikilink, e.g. "(2nd Color)", when present."""
    cell = _clean(raw)
    name, remainder = _first_wikilink_display(cell)
    if name is None:
        return None, None
    variant = _strip_markup(remainder)
    return name, (variant or None)


def parse_year_wikitext(wikitext: str, year: int) -> list[dict]:
    rows = []
    lines = wikitext.splitlines()

    block: list[str] = []

    def flush(block_lines: list[str]):
        cells = [l[1:] for l in block_lines if l.startswith("|") and not l.startswith("|-") and not l.startswith("|}")]
        # Column count varies by year: most years have 6 (..., Series #, Photo),
        # a few (e.g. 2013, 2015) drop the Series # column and have only 5.
        # Only the first four columns (SKU, Col#, Model Name, Series) are ever
        # used here, so accept either shape rather than requiring a fixed count.
        if len(cells) < 5:
            return
        sku_raw, col_raw, name_raw, series_raw = cells[:4]
        sku, col = _clean(sku_raw), _clean(col_raw)
        if not SKU_PATTERN.match(sku) or not COLNUM_PATTERN.match(col):
            return
        casting_name, variant_desc = parse_model_name_cell(name_raw)
        if not casting_name:
            return
        series_name = parse_series_cell(series_raw)

        rows.append({
            "brand": "Hot Wheels",
            "sku": sku,
            "collector_number": col,
            "casting_name": casting_name,
            "series_name": series_name,
            "release_year": year,
            "variant_desc": variant_desc,
            "loose_value_usd": None,
            "carded_value_usd": None,
            "source": f"hotwheels_wiki:List_of_{year}_Hot_Wheels",
            "source_url": PAGE_URL.format(year=year),
        })

    for line in lines:
        line = line.rstrip("\n")
        if line == "|-":
            flush(block)
            block = []
            continue
        block.append(line)
    flush(block)  # last row of the final table, if the page doesn't end with |-

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
            wikitext = fetch_year_wikitext(year)
            rows = parse_year_wikitext(wikitext, year)
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
