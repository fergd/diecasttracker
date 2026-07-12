import {
  generateLotTitle,
  generateLotDescription,
  resolveListingDescription,
  resolveOverride,
  COMBINE_LISTING_LINE,
} from './listingText';
import { API_BASE } from './inventory';
import type { InventoryItem } from './inventory';

// eBay's own cap on pipe-separated photo URLs in one row.
const MAX_PHOTOS = 24;

const EBAY_TITLE_MAX = 80;

/** Title for the eBay CSV specifically - a hand-edited customListingTitle
 * wins (the user typed exactly what they want used), otherwise falls back
 * to a simpler auto-generated title than the in-app "Listing Text" card's
 * (which adds series/collector-number/color for a human reviewing it before
 * copying elsewhere): "{year} {brand} {casting name} {SKU}", collector
 * number omitted, per eBay's own template conventions. */
function ebayListingTitle(item: InventoryItem): string {
  const generated = [item.year, item.brand ?? 'Hot Wheels', item.castingName ?? 'Diecast Car', item.sku]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const title = resolveOverride(item.customListingTitle, generated);
  return title.length > EBAY_TITLE_MAX ? title.slice(0, EBAY_TITLE_MAX).trim() : title;
}

// Column structure and info-header rows copied verbatim from a real eBay
// "draft listing" template (Seller Hub Reports tab -> Upload -> Download
// template -> source: Listings), downloaded 2026-07-08. This creates DRAFT
// listings, not live ones - you review/complete each draft in eBay's own UI
// (item specifics, shipping, photos) before it goes live. Only Action and
// Category ID are actually required per eBay's own info row; the rest we
// populate from what we already track.
const INFO_ROWS = [
  '#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,',
  "#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,",
  '"#INFO After you\'ve successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,',
  '#INFO,,,,,,,,,,',
];

// Trailing C:<name> columns are eBay's "item specifics" convention for bulk
// upload templates - anything not covered by the fixed columns above. Fields
// we don't actually track (Vehicle Year of the real-world car, Theme,
// Character Family, Prop 65, etc.) are deliberately omitted rather than
// guessed; eBay's own draft-completion UI still lets you fill those in by
// hand per listing.
const HEADER_ROW =
  'Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format,' +
  'C:Brand,C:Vehicle Make,C:Scale,C:Series,C:Year of Manufacture,C:Vehicle Type,C:Material,C:Color,C:Model,C:Features,C:Vintage,C:MPN,C:Country of Origin,C:Recommended Age Range';

// Toys & Hobbies > Diecast & Toy Vehicles > Cars, Trucks & Vans, split by
// manufacture era - eBay treats these as genuinely different leaf categories,
// not a shared one with a "vintage" filter.
const CATEGORY_CONTEMPORARY = '180506';
const CATEGORY_VINTAGE = '180507';

function categoryFor(item: InventoryItem): string {
  // Redline wheels are an unambiguous 1968-77 signal - everything else
  // defaults to contemporary, which covers the vast majority of scans.
  return item.wheelType === 'Redline' ? CATEGORY_VINTAGE : CATEGORY_CONTEMPORARY;
}

function conditionFor(item: InventoryItem): string {
  return item.packagingType === 'carded' ? 'NEW' : 'USED';
}

function featuresFor(item: InventoryItem): string {
  return item.packagingType === 'carded' ? 'Unopened Box' : '';
}

function vintageFor(item: InventoryItem): string {
  return item.wheelType === 'Redline' ? 'Yes' : 'No';
}

function seriesFor(item: InventoryItem): string {
  return [item.series, item.specialSeries].filter(Boolean).join(': ');
}

/** eBay's servers fetch this URL directly, so only Cloudinary-hosted photos
 * (public CDN) qualify - the legacy `${API_BASE}/photos/...` paths from
 * before the Cloudinary migration are Tailscale-only and unreachable from
 * outside our network, so those are skipped rather than sent as a dead link.
 * Multiple URLs are pipe-separated per eBay's own multi-photo convention,
 * capped at eBay's own MAX_PHOTOS limit (relevant for lots: several cars'
 * worth of photos combined into one row can easily exceed it).
 *
 * Takes photos round-robin (each item's first photo, then each item's
 * second, ...) rather than flattening item-by-item - a lot large enough to
 * hit the cap would otherwise let the first few cars claim every slot and
 * leave later cars with zero photos in the listing. */
function photoUrlsFor(items: InventoryItem[]): string {
  const perItem = items.map((item) =>
    [item.photoUrl, item.basePhotoUrl].filter((url): url is string => !!url && !url.startsWith(API_BASE)),
  );
  const urls: string[] = [];
  for (let round = 0; urls.length < MAX_PHOTOS; round++) {
    const before = urls.length;
    for (const itemUrls of perItem) {
      if (round < itemUrls.length) urls.push(itemUrls[round]);
      if (urls.length >= MAX_PHOTOS) break;
    }
    if (urls.length === before) break; // every item exhausted
  }
  return urls.join('|');
}

/** If every item shares the same value for `select`, returns it - otherwise
 * null. Used to decide whether a lot-level field (brand, year, country...)
 * can still be filled in, or has to stay blank because the lot is mixed. */
function sameForAll<T>(items: InventoryItem[], select: (item: InventoryItem) => T | null): T | null {
  const first = select(items[0]);
  if (first == null) return null;
  return items.every((item) => select(item) === first) ? first : null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Turns our plain-text description (blank-line-separated paragraphs) into
 * simple HTML, matching the formatting eBay's own listing descriptions use.
 * Escapes first, then inserts <br> tags - comments and condition notes are
 * free text a user could type anything into, and a stray "<" or "&" would
 * otherwise corrupt the surrounding HTML structure. The combine-listings
 * line is bolded - it's a fixed constant (never user-typed), so matching it
 * verbatim before escaping is safe. Plain-text views (the in-app Listing
 * Text card, the CSV's own C:Description-less columns) show it as regular
 * text same as everywhere else - bold only renders in this HTML output. */
function descriptionHtml(text: string): string {
  const paragraphs = text
    .split('\n\n')
    .map((p) => {
      const escaped = escapeHtml(p).replace(/\n/g, '<br>');
      return p === COMBINE_LISTING_LINE ? `<strong>${escaped}</strong>` : escaped;
    })
    .filter(Boolean);
  return paragraphs.map((p) => `<p>${p}</p>`).join('');
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(',');
}

/** Row for one item selling on its own - the real template's 11 fixed
 * columns (Action, Custom label (SKU), Category ID, Title, UPC, Price,
 * Quantity, Item photo URL, Condition ID, Description, Format), followed by
 * the C:<name> item specifics from HEADER_ROW. Item photo URL is populated
 * for Cloudinary-hosted photos (public); pre-migration local photos are
 * still Tailscale-only and get added manually during the draft-review step
 * instead. */
function singleItemRow(item: InventoryItem): string[] {
  return [
    'Draft',
    item.sku ?? '',
    categoryFor(item),
    ebayListingTitle(item),
    'Does Not Apply', // UPC - diecast collectibles don't have one
    item.price != null ? item.price.toFixed(2) : '',
    String(item.quantity),
    photoUrlsFor([item]),
    conditionFor(item),
    descriptionHtml(resolveListingDescription(item)),
    'FixedPrice',
    item.brand ?? 'Hot Wheels',
    item.carMake ?? '',
    '1:64',
    seriesFor(item),
    item.year ?? '',
    'Car',
    'Diecast',
    item.color ?? '',
    item.castingName ?? '',
    featuresFor(item),
    vintageFor(item),
    item.sku ?? '',
    item.baseCountry ?? '',
    '3+',
  ];
}

/** Row for several items combined into one lot listing (same lot_id). Same
 * column shape as a single item, but every field that would vary car-to-car
 * (Vehicle Make, Series, Year, Color, Model, MPN, Country of Origin) is left
 * blank rather than guessed from just one of the cars in the lot - only
 * fields that genuinely apply to the whole lot (Scale, Material, Vehicle
 * Type, Age Range) stay filled. Price is deliberately left blank: a lot's
 * asking price isn't the sum of individual guide prices, so that's set by
 * hand in the draft. Quantity is always 1 - it's one listing. */
function lotRow(lotId: string, items: InventoryItem[]): string[] {
  const brand = sameForAll(items, (i) => i.brand ?? 'Hot Wheels') ?? '';
  const allCarded = items.every((i) => i.packagingType === 'carded');
  const category = sameForAll(items, categoryFor) ?? CATEGORY_CONTEMPORARY;

  return [
    'Draft',
    lotId,
    category,
    generateLotTitle(items),
    'Does Not Apply',
    '', // Price - see note above, set by hand
    '1',
    photoUrlsFor(items),
    allCarded ? 'NEW' : 'USED',
    descriptionHtml(generateLotDescription(items)),
    'FixedPrice',
    brand,
    '',
    '1:64',
    '',
    sameForAll(items, (i) => i.year) ?? '',
    'Car',
    'Diecast',
    '',
    '',
    '',
    items.some((i) => i.wheelType === 'Redline') ? 'Yes' : 'No',
    '',
    sameForAll(items, (i) => i.baseCountry) ?? '',
    '3+',
  ];
}

/** One row per staged item, except items sharing a lot_id (combined into one
 * listing via "Combine into eBay listing") collapse into a single lotRow. */
export function generateEbayCsv(items: InventoryItem[]): string {
  const lots = new Map<string, InventoryItem[]>();
  const singles: InventoryItem[] = [];
  for (const item of items) {
    if (item.lotId) {
      const group = lots.get(item.lotId) ?? [];
      group.push(item);
      lots.set(item.lotId, group);
    } else {
      singles.push(item);
    }
  }

  const rows = [
    ...singles.map(singleItemRow),
    ...[...lots.entries()].map(([lotId, lotItems]) =>
      lotItems.length > 1 ? lotRow(lotId, lotItems) : singleItemRow(lotItems[0]),
    ),
  ].map(csvRow);

  return [...INFO_ROWS, HEADER_ROW, ...rows].join('\r\n');
}

export function downloadEbayCsv(items: InventoryItem[]) {
  const csv = generateEbayCsv(items);
  // UTF-8 BOM so Excel (a common destination for "download a CSV") doesn't
  // mis-render non-ASCII characters (accented names, curly quotes, etc).
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ebay-draft-listings-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
