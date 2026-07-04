"""
live_pricing.py

Augments the static guide-book price (from South Texas Diecast, refreshed
only when reference_import.py reruns) with a real eBay price check via
eBay's own Browse API.

WHY NOT CLAUDE'S web_search TOOL (what this used to do): confirmed by
inspecting the raw API response directly - a web_search_tool_result block
only ever contains `title`, `url`, `page_age`, and an opaque
`encrypted_content` blob. There is no page-content/snippet field, so the
model has no way to see a listing's actual price unless it happens to
appear in the search-result title text. It would reliably find the exact
right listing and still have to report "price not visible in search
results" - not a bug, just a hard capability limit of that tool.

WHY NOT SCRAPE EBAY DIRECTLY (the other alternative considered): confirmed
eBay returns a 403 bot-detection error page for a plain HTTP fetch of an
item page, from two different networks. Not something to build around -
eBay does not want to be scraped and actively blocks it.

So: eBay's own Browse API, with a registered developer application
(developer.ebay.com -> My Account -> Application Keys -> Production
keyset). Requires two environment variables:
    EBAY_CLIENT_ID
    EBAY_CLIENT_SECRET

Only the Browse API is used (item_summary/search) - available to any
registered developer, no special approval needed. This returns ACTIVE
listing prices only, not sold/completed transaction history - that lives
behind eBay's separate Marketplace Insights API, which requires an
approved business-use application. "Recommended price" here is honestly
an asking-price estimate, not a sold-comps estimate, and is labeled as
such in the summary text - never claim otherwise.

COST CONTROL - same principle as before, just a different meter:
  1. Cached by casting identity (name + series + year + packaging_type),
     NOT by individual scan - see live_price_cache in schema.sql.
  2. Cache entries are reused for CACHE_MAX_AGE_DAYS before a refresh is
     even considered.
  3. The Browse API's free tier has a daily call quota (check your
     developer.ebay.com dashboard for the current limit) - caching is what
     keeps this well under it for a personal collection's scan volume.
"""

import base64
import os
import sqlite3
import time
from datetime import datetime, timedelta

import requests

CACHE_MAX_AGE_DAYS = 30                # how long a cached live price stays valid
_REQUEST_TIMEOUT = 15

_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope"

# Module-level token cache - a client-credentials token is valid for ~2
# hours and there's no per-user state involved, so one process-wide token
# reused across requests is correct, not a shortcut.
_cached_token: str | None = None
_cached_token_expiry: float = 0.0


def _get_ebay_token() -> str:
    global _cached_token, _cached_token_expiry
    if _cached_token and time.time() < _cached_token_expiry - 60:
        return _cached_token

    client_id = os.environ.get("EBAY_CLIENT_ID")
    client_secret = os.environ.get("EBAY_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError(
            "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not configured - get a Production "
            "keyset from developer.ebay.com and set both as environment variables."
        )

    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    resp = requests.post(
        _TOKEN_URL,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials", "scope": _OAUTH_SCOPE},
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    _cached_token = data["access_token"]
    _cached_token_expiry = time.time() + data.get("expires_in", 7200)
    return _cached_token


def _search_ebay(query: str, limit: int = 25) -> list[dict]:
    token = _get_ebay_token()
    resp = requests.get(
        _SEARCH_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        params={"q": query, "limit": limit},
        timeout=_REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("itemSummaries", [])


def _extract_prices(items: list[dict]) -> list[float]:
    prices = []
    for item in items:
        price_info = item.get("price") or {}
        if price_info.get("currency", "USD") != "USD":
            continue
        try:
            prices.append(float(price_info["value"]))
        except (KeyError, TypeError, ValueError):
            continue
    return prices


def _search_live_price(casting_name: str, series: str | None, year: int | None,
                        packaging_type: str, brand: str | None = None,
                        sku: str | None = None, treasure_hunt: str | None = None) -> dict:
    # Combine everything we know rather than picking just one term - sellers
    # often don't include the Toy # in their listing title at all, so a
    # sku-only query (the previous behavior whenever a sku was available)
    # silently missed real listings that only mention the casting name/year.
    # More keywords just means eBay's own relevance ranking has more to work
    # with, not a stricter match requirement.
    #
    # Treasure Hunts sell for meaningfully more than the same casting's
    # regular release - a query that doesn't say so would mix in ordinary
    # asking prices for the wrong variant entirely, not just noisy data.
    th_term = {"TH": "Treasure Hunt", "Super TH": "Super Treasure Hunt"}.get(treasure_hunt)
    query_parts = [brand, casting_name, str(year) if year else None, sku, th_term]
    query = " ".join(p for p in query_parts if p).strip()

    items = _search_ebay(query)
    prices = sorted(_extract_prices(items))

    if not prices:
        return {
            "price_low_usd": None, "price_high_usd": None,
            "recommended_listing_price_usd": None,
            "summary": f"No active eBay listings found for '{query}'.",
            "search_count": 0,
            "cached": False,
        }

    low, high = prices[0], prices[-1]
    recommended = prices[len(prices) // 2]  # median - less skewed by an outlier
                                              # listing than a mean would be
    n = len(prices)
    return {
        "price_low_usd": round(low, 2),
        "price_high_usd": round(high, 2),
        "recommended_listing_price_usd": round(recommended, 2),
        "summary": (
            f"{n} active eBay listing{'s' if n != 1 else ''} found, asking "
            f"${low:.2f}-${high:.2f} (asking prices, not sold/completed data - "
            f"eBay's sold-listings API requires separate business approval)."
        ),
        "search_count": n,  # repurposed from "how many searches" (the old
                              # Claude-web_search cost meter) to "how many
                              # listings this price is based on" - eBay's API
                              # isn't metered per-search the same way
        "cached": False,
    }


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


def get_live_price(casting_name: str, series: str | None, year: int | None,
                    packaging_type: str, brand: str | None = None, sku: str | None = None,
                    treasure_hunt: str | None = None,
                    db_path: str = "inventory.db", force_refresh: bool = False) -> dict:
    """
    brand/sku are search-quality inputs only, not part of the cache key -
    they're just extra context that helps eBay's search find the right
    listings for the same casting identity (casting_name/series/year/
    packaging_type already uniquely identifies it for caching purposes).

    treasure_hunt IS folded into the cache key (as a suffix on the cached
    casting_name, e.g. "Toyota Supra [Super TH]") rather than left out like
    brand/sku - a Treasure Hunt sells for meaningfully more than the same
    casting's regular release, so without this a TH scan could reuse (or
    overwrite) the regular release's cached price. live_price_cache already
    has a UNIQUE INDEX on (casting_name, series_name, release_year,
    packaging_type) deployed on real databases - adding a real column and
    migrating that index safely wasn't worth the risk for what a string
    suffix already solves cleanly.

    force_refresh=True skips the cache check entirely (still writes the
    fresh result back into it afterward) - for an explicit user-triggered
    "recheck price" action, not something to do automatically, since it
    counts against eBay's API quota same as any other live lookup.

    Returns a dict with price_low_usd, price_high_usd,
    recommended_listing_price_usd, summary, cached (bool). Never raises - a
    failed lookup returns a dict with an 'error' note instead, so a
    live-pricing hiccup never takes down the rest of a scan.
    """
    if not casting_name:
        return {"price_low_usd": None, "price_high_usd": None,
                "recommended_listing_price_usd": None,
                "summary": None, "cached": False, "skipped": True}

    cache_casting_name = f"{casting_name} [{treasure_hunt}]" if treasure_hunt else casting_name

    conn = sqlite3.connect(db_path)
    conn.executescript(open("schema.sql").read())

    if not force_refresh:
        cached = _fetch_cached(conn, cache_casting_name, series, year, packaging_type)
        if cached:
            conn.close()
            return cached

    try:
        result = _search_live_price(casting_name, series, year, packaging_type, brand, sku, treasure_hunt)
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
