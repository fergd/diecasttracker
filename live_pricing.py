"""
live_pricing.py

Augments the static guide-book price (from South Texas Diecast, refreshed
only when reference_import.py reruns) with a live web-search-backed price
check, using Claude's server-side web_search tool.

COST CONTROL - this is the part that actually matters:

  1. Cached by casting identity (name + series + year + packaging_type), NOT
     by individual scan. Scanning five copies of the same casting triggers
     ONE live search total, not five - see live_price_cache in schema.sql.
  2. Cache entries are reused for CACHE_MAX_AGE_DAYS before a refresh is
     even considered. Collectible prices don't move hour to hour; a
     30-day-old price check is still meaningfully more current than a
     guide book that gets updated far less often than that.
  3. max_uses caps the number of searches Claude can run for a single
     lookup (web search is billed per search, $10/1,000, on top of the
     token cost of the search results themselves - see Anthropic's
     pricing page). A capped, narrow query rarely needs more than 1-2
     searches to answer "what does this sell for."
  4. Only called for scans that already CONFIRMED or NEED_REVIEW against
     the reference database (see app.py) - there's nothing meaningful to
     price-check for a no_match item, so those never trigger a search.

Net effect: cost scales with the number of DISTINCT castings you own, not
the number of cars you scan or how many times you rescan the same one.
"""

import json
import sqlite3
from datetime import datetime, timedelta

import anthropic

MODEL = "claude-haiku-4-5-20251001"  # same cost-efficient choice as extraction
MAX_SEARCHES_PER_LOOKUP = 3           # hard ceiling on web_search calls per lookup
CACHE_MAX_AGE_DAYS = 30                # how long a cached live price stays valid

PRICE_LOOKUP_PROMPT = """Search eBay for what this specific diecast car actually \
sells for:

Casting: {casting_name}
Series: {series}
Year: {year}
Packaging: {packaging_type} (carded/packaged vs. loose/unpackaged - price for THIS \
packaging specifically; the two differ a lot for the same casting)

Prioritize SOLD/completed listings over active asking prices - an asking price tells \
you what a seller hopes for, a sold price tells you what a buyer actually paid. If you \
can't find sold listings, active listings are a fallback but say so in the summary. \
Ignore results for unrelated castings or the wrong packaging type.

Respond with ONLY a JSON object, no preamble, no markdown fences:
{{
  "price_low_usd": lowest reasonable price in USD you found for this exact casting +
                     packaging, or null if nothing relevant turned up,
  "price_high_usd": highest reasonable price in USD you found, or null,
  "recommended_listing_price_usd": the single price point most likely to actually
                     result in a sale within a reasonable time - not the ceiling, not
                     the floor, but a realistic competitive listing price based on
                     what similar items actually sold for. null if you couldn't find
                     enough data to recommend one,
  "summary": one brief sentence on what you found (e.g. "4 eBay sold listings from
              the past month, $6-11, most clustered around $8"), or a short note that
              nothing specific was found
}}"""


def _fetch_cached(conn: sqlite3.Connection, casting_name: str, series: str | None,
                   year: int | None, packaging_type: str) -> dict | None:
    conn.row_factory = sqlite3.Row
    cutoff = (datetime.utcnow() - timedelta(days=CACHE_MAX_AGE_DAYS)).isoformat()
    row = conn.execute("""
        SELECT * FROM live_price_cache
        WHERE casting_name = ?
          AND COALESCE(series_name, '') = COALESCE(?, '')
          AND COALESCE(release_year, 0) = COALESCE(?, 0)
          AND packaging_type = ?
          AND fetched_at >= ?
    """, (casting_name, series, year, packaging_type, cutoff)).fetchone()
    if row is None:
        return None
    return {
        "price_low_usd": row["price_low_usd"],
        "price_high_usd": row["price_high_usd"],
        "recommended_listing_price_usd": row["recommended_listing_price_usd"] if "recommended_listing_price_usd" in row.keys() else None,
        "summary": row["summary"],
        "cached": True,
        "fetched_at": row["fetched_at"],
    }


def _search_live_price(casting_name: str, series: str | None, year: int | None,
                        packaging_type: str) -> dict:
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

    prompt = PRICE_LOOKUP_PROMPT.format(
        casting_name=casting_name,
        series=series or "unknown",
        year=year or "unknown",
        packaging_type=packaging_type,
    )

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=700,
            messages=[{"role": "user", "content": prompt}],
            tools=[{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": MAX_SEARCHES_PER_LOOKUP,
                "allowed_domains": ["ebay.com"],   # search eBay specifically, not
                                                     # a generic web search - this is
                                                     # what was actually asked for
            }],
        )
    except anthropic.APIStatusError as e:
        detail = e.message
        try:
            detail = e.body.get("error", {}).get("message", e.message)
        except (AttributeError, TypeError):
            pass
        raise RuntimeError(f"Live price search failed ({e.status_code}): {detail}") from e

    # How many searches did this actually use? Prefer the usage field if
    # present, fall back to counting server_tool_use blocks.
    search_count = 0
    usage = getattr(response, "usage", None)
    server_tool_use = getattr(usage, "server_tool_use", None) if usage else None
    if server_tool_use is not None:
        search_count = getattr(server_tool_use, "web_search_requests", 0) or 0
    if not search_count:
        search_count = sum(
            1 for block in response.content
            if getattr(block, "type", None) == "server_tool_use"
            and getattr(block, "name", None) == "web_search"
        )

    # Pull the final text block - that's where the JSON answer should be.
    text_blocks = [b.text for b in response.content if getattr(b, "type", None) == "text"]
    raw_text = (text_blocks[-1] if text_blocks else "").strip()
    raw_text = raw_text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        parsed = {"price_low_usd": None, "price_high_usd": None,
                   "recommended_listing_price_usd": None,
                   "summary": "Search completed but response wasn't parseable."}

    return {
        "price_low_usd": parsed.get("price_low_usd"),
        "price_high_usd": parsed.get("price_high_usd"),
        "recommended_listing_price_usd": parsed.get("recommended_listing_price_usd"),
        "summary": parsed.get("summary"),
        "search_count": search_count,
        "cached": False,
    }


def get_live_price(casting_name: str, series: str | None, year: int | None,
                    packaging_type: str, db_path: str = "inventory.db") -> dict:
    """
    Returns a dict with price_low_usd, price_high_usd,
    recommended_listing_price_usd, summary, cached (bool). Never raises - a
    failed lookup returns a dict with an 'error' note instead, so a
    live-pricing hiccup never takes down the rest of a scan.
    """
    if not casting_name:
        return {"price_low_usd": None, "price_high_usd": None,
                "recommended_listing_price_usd": None,
                "summary": None, "cached": False, "skipped": True}

    conn = sqlite3.connect(db_path)
    conn.executescript(open("schema.sql").read())

    cached = _fetch_cached(conn, casting_name, series, year, packaging_type)
    if cached:
        conn.close()
        return cached

    try:
        result = _search_live_price(casting_name, series, year, packaging_type)
    except Exception as e:
        conn.close()
        return {
            "price_low_usd": None, "price_high_usd": None,
            "recommended_listing_price_usd": None,
            "summary": f"Live price lookup failed: {e}",
            "cached": False, "error": True,
        }

    conn.execute("""
        INSERT INTO live_price_cache
            (casting_name, series_name, release_year, packaging_type,
             price_low_usd, price_high_usd, recommended_listing_price_usd,
             summary, search_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(casting_name, series_name, release_year, packaging_type)
        DO UPDATE SET
            price_low_usd = excluded.price_low_usd,
            price_high_usd = excluded.price_high_usd,
            recommended_listing_price_usd = excluded.recommended_listing_price_usd,
            summary = excluded.summary,
            search_count = excluded.search_count,
            fetched_at = CURRENT_TIMESTAMP
    """, (casting_name, series, year, packaging_type,
          result["price_low_usd"], result["price_high_usd"],
          result["recommended_listing_price_usd"],
          result["summary"], result["search_count"]))
    conn.commit()
    conn.close()

    return result
