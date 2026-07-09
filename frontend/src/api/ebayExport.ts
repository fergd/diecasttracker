import { generateListingDescription } from './listingText';
import type { InventoryItem } from './inventory';

const EBAY_TITLE_MAX = 80;

/** Title for the eBay CSV specifically - simpler than the in-app "Listing
 * Text" card's title (which adds series/collector-number/color for a human
 * reviewing it before copying elsewhere): "{year} {brand} {casting name}
 * {SKU}", collector number omitted, per eBay's own template conventions. */
function ebayListingTitle(item: InventoryItem): string {
  const title = [item.year, item.brand ?? 'Hot Wheels', item.castingName ?? 'Diecast Car', item.sku]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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

const HEADER_ROW =
  'Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format';

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Turns our plain-text description (blank-line-separated paragraphs) into
 * simple HTML, matching the formatting eBay's own listing descriptions use.
 * Escapes first, then inserts <br> tags - comments and condition notes are
 * free text a user could type anything into, and a stray "<" or "&" would
 * otherwise corrupt the surrounding HTML structure. */
function descriptionHtml(item: InventoryItem): string {
  const paragraphs = generateListingDescription(item)
    .split('\n\n')
    .map((p) => escapeHtml(p).replace(/\n/g, '<br>'))
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

/** One row per staged item, matching the real template's 11 columns exactly:
 * Action, Custom label (SKU), Category ID, Title, UPC, Price, Quantity,
 * Item photo URL, Condition ID, Description, Format. Photo URL is
 * deliberately left blank - our photos are only reachable over Tailscale,
 * not the public internet eBay's servers need, so photos get added manually
 * during the draft-review step instead. */
export function generateEbayCsv(items: InventoryItem[]): string {
  const rows = items.map((item) =>
    csvRow([
      'Draft',
      item.sku ?? '',
      categoryFor(item),
      ebayListingTitle(item),
      '', // UPC - diecast collectibles don't have one
      item.price != null ? item.price.toFixed(2) : '',
      String(item.quantity),
      '', // Item photo URL - see note above
      conditionFor(item),
      descriptionHtml(item),
      'FixedPrice',
    ]),
  );
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
