// API client for the real Zamak Ledger backend (FastAPI on backupbox).
// Mirrors static/index.html's fromDbRow()/fromScanResponse() adapters and
// the exact request/response shapes in app.py - see that file for the
// source of truth on every field below.

export const API_BASE = 'https://backupbox.tailfb9f14.ts.net';

export type MatchStatus = 'confirmed' | 'needs_review' | 'no_match';
export type TrackingStatus = 'in_collection' | 'listed' | 'sold';
export type PackagingType = 'carded' | 'loose';
export type TreasureHunt = 'TH' | 'Super TH' | null;
/** Collector C-scale: C10 Mint, C9 Near Mint, C8 Excellent, C7 Very Good, C6 Good. */
export type ConditionGrade = 'C10' | 'C9' | 'C8' | 'C7' | 'C6' | null;

export const CONDITION_GRADE_LABELS: Record<Exclude<ConditionGrade, null>, string> = {
  C10: 'Mint',
  C9: 'Near Mint',
  C8: 'Excellent',
  C7: 'Very Good',
  C6: 'Good',
};

/** Raw shape returned by GET /inventory and by PUT/rematch/refresh_price/photo endpoints. */
export interface InventoryRow {
  id: number;
  photo_path: string | null;
  base_photo_path: string | null;
  packaging_type: PackagingType;
  extracted_brand: string | null;
  car_make: string | null;
  extracted_casting_name: string | null;
  extracted_collector_num: string | null;
  extracted_series_number: string | null;
  extracted_sku: string | null;
  extracted_series: string | null;
  extracted_year: string | null;
  extracted_color: string | null;
  treasure_hunt: TreasureHunt;
  base_country: string | null;
  wheel_type: string | null;
  body_base_construction: string | null;
  special_flags: string | null;
  special_series: string | null;
  match_status: MatchStatus;
  match_confidence: number | null;
  match_notes: string | null;
  canonical_brand: string | null;
  canonical_sku: string | null;
  canonical_casting_name: string | null;
  canonical_series: string | null;
  canonical_year: number | null;
  guide_price_usd: number | null;
  live_price_low_usd: number | null;
  live_price_high_usd: number | null;
  live_recommended_price_usd: number | null;
  live_price_summary: string | null;
  live_price_fetched_at: string | null;
  condition: string | null;
  condition_car_grade: ConditionGrade;
  condition_card_grade: ConditionGrade;
  status: TrackingStatus;
  acquired_date: string | null;
  cost_basis_usd: number | null;
  listing_price_usd: number | null;
  sold_price_usd: number | null;
  quantity: number;
  created_at: string;
}

/** Normalized shape the UI renders - canonical_* wins over extracted_* everywhere. */
export interface InventoryItem {
  id: number;
  photoUrl: string | null;
  basePhotoUrl: string | null;
  packagingType: PackagingType;
  brand: string | null;
  carMake: string | null;
  castingName: string | null;
  series: string | null;
  specialSeries: string | null;
  year: string | null;
  collectorNumber: string | null;
  seriesNumber: string | null;
  sku: string | null;
  color: string | null;
  treasureHunt: TreasureHunt;
  baseCountry: string | null;
  wheelType: string | null;
  bodyBaseConstruction: string | null;
  specialFlags: string[];
  matchStatus: MatchStatus;
  matchConfidence: number;
  matchNotes: string | null;
  guidePrice: number | null;
  liveLow: number | null;
  liveHigh: number | null;
  liveRecommended: number | null;
  liveSummary: string | null;
  livePriceFetchedAt: string | null;
  condition: string | null;
  conditionCarGrade: ConditionGrade;
  conditionCardGrade: ConditionGrade;
  trackingStatus: TrackingStatus;
  quantity: number;
  price: number | null;
  costBasis: number | null;
  listingPrice: number | null;
  soldPrice: number | null;
  createdAt: string;
}

const MATCH_LABELS: Record<MatchStatus, string> = {
  confirmed: 'Confirmed',
  needs_review: 'Review',
  no_match: 'No Match',
};

const TRACKING_LABELS: Record<TrackingStatus, string> = {
  in_collection: 'In collection',
  listed: 'Listed',
  sold: 'Sold',
};

export function matchLabel(item: Pick<InventoryItem, 'matchStatus' | 'matchConfidence'>): string {
  return `${MATCH_LABELS[item.matchStatus]} ${Math.round(item.matchConfidence * 100)}%`;
}

export function matchBadgeVariant(status: MatchStatus): 'success' | 'warning' | 'error' {
  if (status === 'confirmed') return 'success';
  if (status === 'needs_review') return 'warning';
  return 'error';
}

export function trackingLabel(status: TrackingStatus): string {
  return TRACKING_LABELS[status];
}

function photoUrl(path: string | null): string | null {
  return path ? `${API_BASE}/${path}` : null;
}

export function fromRow(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    photoUrl: photoUrl(row.photo_path),
    basePhotoUrl: photoUrl(row.base_photo_path),
    packagingType: row.packaging_type,
    brand: row.canonical_brand || row.extracted_brand,
    carMake: row.car_make,
    castingName: row.canonical_casting_name || row.extracted_casting_name,
    series: row.canonical_series || row.extracted_series,
    specialSeries: row.special_series,
    year: row.canonical_year != null ? String(row.canonical_year) : row.extracted_year,
    collectorNumber: row.extracted_collector_num,
    seriesNumber: row.extracted_series_number,
    sku: row.canonical_sku || row.extracted_sku,
    color: row.extracted_color,
    treasureHunt: row.treasure_hunt,
    baseCountry: row.base_country,
    wheelType: row.wheel_type,
    bodyBaseConstruction: row.body_base_construction,
    specialFlags: row.special_flags ? JSON.parse(row.special_flags) : [],
    matchStatus: row.match_status,
    matchConfidence: row.match_confidence ?? 0,
    matchNotes: row.match_notes,
    guidePrice: row.guide_price_usd,
    liveLow: row.live_price_low_usd,
    liveHigh: row.live_price_high_usd,
    liveRecommended: row.live_recommended_price_usd,
    liveSummary: row.live_price_summary,
    livePriceFetchedAt: row.live_price_fetched_at,
    condition: row.condition,
    conditionCarGrade: row.condition_car_grade,
    conditionCardGrade: row.condition_card_grade,
    trackingStatus: row.status,
    quantity: row.quantity || 1,
    price: row.live_recommended_price_usd ?? row.live_price_low_usd ?? row.guide_price_usd,
    costBasis: row.cost_basis_usd,
    listingPrice: row.listing_price_usd,
    soldPrice: row.sold_price_usd,
    createdAt: row.created_at,
  };
}

/** Response shape of POST /scan - distinct from InventoryRow, nested by stage. */
export interface ScanResponse {
  inventory_id: number;
  packaging_type: PackagingType;
  photo_path: string;
  base_photo_path: string | null;
  extracted: {
    brand: string | null;
    car_make: string | null;
    casting_name: string | null;
    collector_number: string | null;
    series_number: string | null;
    sku: string | null;
    sku_full_code: string | null;
    series: string | null;
    release_year: number | null;
    color: string | null;
    treasure_hunt: TreasureHunt;
    base_country: string | null;
    wheel_type: string | null;
    body_base_construction?: string | null;
    special_flags?: string[];
    [key: string]: unknown;
  };
  validation: {
    status: MatchStatus;
    confidence: number;
    canonical_brand: string | null;
    canonical_sku: string | null;
    canonical_casting_name: string | null;
    canonical_series: string | null;
    canonical_year: number | null;
    guide_price_usd: number | null;
    notes: string | null;
  };
  live_price: {
    price_low_usd: number | null;
    price_high_usd: number | null;
    recommended_listing_price_usd: number | null;
    summary: string | null;
    cached: boolean;
    skipped?: boolean;
    error?: boolean;
  };
}

export function fromScanResponse(data: ScanResponse): InventoryItem {
  const { extracted: e, validation: v, live_price: lp } = data;
  return {
    id: data.inventory_id,
    photoUrl: photoUrl(data.photo_path),
    basePhotoUrl: photoUrl(data.base_photo_path),
    packagingType: data.packaging_type,
    brand: v.canonical_brand || e.brand,
    carMake: e.car_make,
    castingName: v.canonical_casting_name || e.casting_name,
    series: v.canonical_series || e.series,
    specialSeries: null,
    year: v.canonical_year != null ? String(v.canonical_year) : e.release_year != null ? String(e.release_year) : null,
    collectorNumber: e.collector_number,
    seriesNumber: e.series_number,
    sku: v.canonical_sku || e.sku,
    color: e.color,
    treasureHunt: e.treasure_hunt,
    baseCountry: e.base_country ?? null,
    wheelType: e.wheel_type ?? null,
    bodyBaseConstruction: e.body_base_construction ?? null,
    specialFlags: e.special_flags ?? [],
    matchStatus: v.status,
    matchConfidence: v.confidence ?? 0,
    matchNotes: v.notes,
    guidePrice: v.guide_price_usd,
    liveLow: lp.price_low_usd,
    liveHigh: lp.price_high_usd,
    liveRecommended: lp.recommended_listing_price_usd,
    liveSummary: lp.summary,
    livePriceFetchedAt: null,
    condition: null,
    conditionCarGrade: null,
    conditionCardGrade: null,
    trackingStatus: 'in_collection',
    quantity: 1,
    price: lp.recommended_listing_price_usd ?? lp.price_low_usd ?? v.guide_price_usd,
    costBasis: null,
    listingPrice: null,
    soldPrice: null,
    createdAt: new Date().toISOString(),
  };
}

export interface InventoryUpdate {
  canonical_brand?: string | null;
  car_make?: string | null;
  special_series?: string | null;
  canonical_casting_name?: string | null;
  canonical_series?: string | null;
  canonical_year?: number | null;
  canonical_sku?: string | null;
  extracted_collector_num?: string | null;
  extracted_series_number?: string | null;
  extracted_sku?: string | null;
  extracted_color?: string | null;
  treasure_hunt?: TreasureHunt;
  base_country?: string | null;
  wheel_type?: string | null;
  body_base_construction?: string | null;
  special_flags?: string[];
  match_status?: MatchStatus;
  condition?: string | null;
  condition_car_grade?: ConditionGrade;
  condition_card_grade?: ConditionGrade;
  acquired_date?: string | null;
  cost_basis_usd?: number | null;
  status?: TrackingStatus;
  listing_price_usd?: number | null;
  sold_price_usd?: number | null;
  quantity?: number;
}

async function unwrap<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = '';
    try {
      detail = (await resp.json())?.detail ?? '';
    } catch {
      /* body wasn't JSON - fall through with empty detail */
    }
    throw new Error(detail || `Request failed (status ${resp.status})`);
  }
  return resp.json();
}

export async function fetchInventory(): Promise<InventoryItem[]> {
  const rows = await unwrap<InventoryRow[]>(await fetch(`${API_BASE}/inventory`));
  return rows.map(fromRow);
}

export async function scanCard(
  photo: Blob,
  packagingType: PackagingType,
  basePhoto?: Blob | null,
): Promise<InventoryItem> {
  const form = new FormData();
  form.append('photo', photo, 'front.jpg');
  form.append('packaging_type', packagingType);
  if (basePhoto) form.append('base_photo', basePhoto, 'back.jpg');
  const data = await unwrap<ScanResponse>(await fetch(`${API_BASE}/scan`, { method: 'POST', body: form }));
  return fromScanResponse(data);
}

export async function updateItem(id: number, patch: InventoryUpdate): Promise<InventoryItem> {
  const row = await unwrap<InventoryRow>(
    await fetch(`${API_BASE}/inventory/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
  return fromRow(row);
}

export async function rematchItem(id: number): Promise<InventoryItem> {
  const row = await unwrap<InventoryRow>(await fetch(`${API_BASE}/inventory/${id}/rematch`, { method: 'POST' }));
  return fromRow(row);
}

/** Manual override for when you know the true identity but matching still
 * can't find it (or found the wrong thing) - locks in the given identity as
 * confirmed. Backend only returns {ok:true}, not the row, so the updated
 * item is reconstructed client-side from the known-current item + params. */
export async function confirmMatch(
  id: number,
  params: { castingName: string; series: string | null; year: number | null },
  current: InventoryItem,
): Promise<InventoryItem> {
  const qs = new URLSearchParams();
  qs.set('canonical_casting_name', params.castingName);
  if (params.series) qs.set('canonical_series', params.series);
  if (params.year != null) qs.set('canonical_year', String(params.year));
  await unwrap<{ ok: boolean }>(await fetch(`${API_BASE}/inventory/${id}/confirm?${qs}`, { method: 'POST' }));
  return {
    ...current,
    castingName: params.castingName,
    series: params.series,
    year: params.year != null ? String(params.year) : current.year,
    matchStatus: 'confirmed',
    matchNotes: 'Manually confirmed by user',
  };
}

export async function refreshPrice(id: number): Promise<InventoryItem> {
  const row = await unwrap<InventoryRow>(
    await fetch(`${API_BASE}/inventory/${id}/refresh_price`, { method: 'POST' }),
  );
  return fromRow(row);
}

export async function deleteItem(id: number): Promise<void> {
  await unwrap<{ ok: boolean; deleted_id: number }>(
    await fetch(`${API_BASE}/inventory/${id}`, { method: 'DELETE' }),
  );
}

export async function attachPhoto(id: number, file: Blob, slot: 'main' | 'secondary'): Promise<InventoryItem> {
  const form = new FormData();
  form.append('photo', file, `${slot}.jpg`);
  form.append('slot', slot);
  const row = await unwrap<InventoryRow>(
    await fetch(`${API_BASE}/inventory/${id}/photo`, { method: 'POST', body: form }),
  );
  return fromRow(row);
}

export async function deletePhoto(id: number, slot: 'main' | 'secondary'): Promise<InventoryItem> {
  const row = await unwrap<InventoryRow>(
    await fetch(`${API_BASE}/inventory/${id}/photo?slot=${slot}`, { method: 'DELETE' }),
  );
  return fromRow(row);
}

/** Same-packaging duplicate detection - exact SKU match ONLY. Casting name/
 * series/year/brand alone are NOT enough: the same casting legitimately
 * reappears across different years and series with a different SKU each
 * time, so matching on those would flag genuinely distinct releases as
 * duplicates. No SKU on either side means no match - never guess. */
export function findDuplicate(candidate: InventoryItem, existing: InventoryItem[]): InventoryItem | null {
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  if (!norm(candidate.sku)) return null;
  const pool = existing.filter((i) => i.packagingType === candidate.packagingType && i.id !== candidate.id);
  return pool.find((i) => norm(i.sku) === norm(candidate.sku)) ?? null;
}
