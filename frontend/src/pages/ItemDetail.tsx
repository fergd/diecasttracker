import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { TabBar } from '../components/TabBar';
import { Tab } from '../components/Tab';
import { Badge } from '../components/Badge';
import { Sheet } from '../components/Sheet';
import { Tag } from '../components/Tag';
import { Toast } from '../components/Toast';
import { useInventory } from '../api/InventoryContext';
import {
  updateItem,
  rematchItem,
  confirmMatch,
  refreshPrice,
  splitItem,
  deleteItem,
  attachPhoto,
  deletePhoto,
  matchLabel,
  matchBadgeVariant,
  CONDITION_GRADE_LABELS,
  type InventoryItem,
  type TreasureHunt,
  type TrackingStatus,
  type ConditionGrade,
} from '../api/inventory';
import { resolveListingTitle, resolveListingDescription } from '../api/listingText';
import styles from './ItemDetail.module.css';

const BRAND_OPTIONS = [
  'Hot Wheels',
  'Matchbox',
  'Tomica',
  'Majorette',
  'Greenlight',
  'Johnny Lightning',
  'M2 Machines',
  'Maisto',
  'Other',
].map((b) => ({ value: b, label: b }));

const BASE_COUNTRY_OPTIONS = [
  '',
  'Malaysia',
  'Thailand',
  'China',
  'Indonesia',
  'Vietnam',
  'USA',
  'Other',
].map((c) => ({ value: c, label: c || 'Unknown' }));

const WHEEL_TYPE_OPTIONS = ['', 'Redline', 'Real Riders', 'Basic Wheels', 'Chrome', 'Other'].map((w) => ({
  value: w,
  label: w || 'Unknown',
}));

const CONSTRUCTION_OPTIONS = ['', 'Metal/Metal', 'Metal/Plastic', 'All-Plastic'].map((c) => ({
  value: c,
  label: c || 'Unknown',
}));

const SPECIAL_FLAG_OPTIONS = ['New Casting', 'Zamac', 'Chase', 'Store Exclusive'];

const CONDITION_GRADES: Exclude<ConditionGrade, null>[] = ['C10', 'C9', 'C8', 'C7', 'C6'];

function GradePicker({
  value,
  onChange,
}: {
  value: ConditionGrade;
  onChange: (grade: ConditionGrade) => void;
}) {
  return (
    <div className={styles.gradeRow}>
      {CONDITION_GRADES.map((grade) => (
        <Tag key={grade} selected={value === grade} onClick={() => onChange(value === grade ? null : grade)}>
          {grade} · {CONDITION_GRADE_LABELS[grade]}
        </Tag>
      ))}
    </div>
  );
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function money(n: number | null): string {
  return n != null ? `$${n.toFixed(2)}` : '—';
}

/** Ensures a promise takes at least `ms` to resolve - makes a fast save feel
 * deliberate/trustworthy instead of suspiciously instant, without ever
 * making a genuinely slow request wait even longer. */
function withMinDelay<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.all([promise, new Promise((resolve) => setTimeout(resolve, ms))]).then(([result]) => result);
}

export function ItemDetail() {
  const { id } = useParams();
  const itemId = Number(id);
  const navigate = useNavigate();
  const { items, getItem, addItem, updateItemLocal, removeItemLocal } = useInventory();
  const item = getItem(itemId);

  const [form, setForm] = useState<InventoryItem | null>(item ?? null);
  const [saving, setSaving] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [togglingStaged, setTogglingStaged] = useState(false);
  const [stageQtyPromptOpen, setStageQtyPromptOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState<'title' | 'description' | null>(null);
  const [confirmingMatch, setConfirmingMatch] = useState(false);
  const [photoActionsSlot, setPhotoActionsSlot] = useState<'main' | 'secondary' | null>(null);
  const mainFileInput = useRef<HTMLInputElement>(null);
  const secondaryFileInput = useRef<HTMLInputElement>(null);
  // Quantity needs its own free-typing text buffer, separate from
  // form.quantity (a real number) - a controlled input tied directly to a
  // "coerce empty back to 1" onChange snaps back to "1" the instant you
  // delete the digit, before you can type a replacement.
  const [quantityText, setQuantityText] = useState(String(item?.quantity ?? 1));

  useEffect(() => {
    if (item) {
      setForm(item);
      setQuantityText(String(item.quantity));
    }
  }, [item]);

  useEffect(() => {
    // items is null only until the initial fetch resolves - on a hard
    // reload/direct link, don't bounce to the list just because the fetch
    // hasn't come back yet. Only redirect once we've actually loaded data
    // and the id genuinely isn't in it.
    if (items && !item && itemId) {
      const t = setTimeout(() => navigate('/', { replace: true }), 0);
      return () => clearTimeout(t);
    }
  }, [items, item, itemId, navigate]);

  if (!form) return null;

  function set<K extends keyof InventoryItem>(key: K, value: InventoryItem[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function showToast(message: string, variant: 'success' | 'error') {
    setToast({ message, variant });
  }

  function showError(err: unknown) {
    showToast(err instanceof Error ? err.message : String(err), 'error');
  }

  // A live-edited override can sit at '' while the field is mid-clear (see
  // resolveOverride's `??`), but persisting a genuinely blank override would
  // get stuck there forever - '' ?? generated still reads as "set" on the
  // next load. Blank/whitespace-only means "back to auto-generated," so
  // normalize it to null before it ever reaches the database.
  function normalizeOverride(value: string | null): string | null {
    return value && value.trim() ? value : null;
  }

  function buildUpdatePayload(current: InventoryItem, quantity: number) {
    return {
      canonical_brand: current.brand,
      car_make: current.carMake,
      canonical_casting_name: current.castingName,
      canonical_series: current.series,
      special_series: current.specialSeries,
      canonical_year: current.year ? parseInt(current.year, 10) : null,
      extracted_collector_num: current.collectorNumber,
      extracted_series_number: current.seriesNumber,
      canonical_sku: current.sku,
      extracted_color: current.color,
      treasure_hunt: current.treasureHunt,
      base_country: current.baseCountry,
      wheel_type: current.wheelType,
      body_base_construction: current.bodyBaseConstruction,
      special_flags: current.specialFlags,
      comments: current.comments,
      status: current.trackingStatus,
      quantity,
      condition: current.condition,
      condition_car_grade: current.conditionCarGrade,
      condition_card_grade: current.conditionCardGrade,
      cost_basis_usd: current.costBasis,
      listing_price_usd: current.listingPrice,
      sold_price_usd: current.soldPrice,
      custom_listing_title: normalizeOverride(current.customListingTitle),
      custom_listing_description: normalizeOverride(current.customListingDescription),
    };
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    // Defensive fallback in case onBlur hasn't fired yet (e.g. Save tapped
    // in a way that doesn't trigger a blur first) - parse whatever's
    // currently in the quantity text buffer rather than trusting form.quantity
    // might be stale.
    const parsedQuantity = parseInt(quantityText, 10);
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : form.quantity;
    let saved;
    try {
      // Minimum 1.3s so the spinner is actually visible and the save reads
      // as deliberate, even when the request itself is much faster than that.
      saved = await withMinDelay(updateItem(form.id, buildUpdatePayload(form, quantity)), 1300);
    } catch (err) {
      setSaving(false);
      showError(err);
      return;
    }

    updateItemLocal(saved);
    setForm(saved);
    setQuantityText(String(saved.quantity));
    setSaving(false);
    showToast('Saved', 'success');
  }

  async function handleRematch() {
    if (!form) return;
    setRematching(true);
    try {
      // Rematch reads whatever's already saved in the database - it has no
      // idea about in-progress edits sitting in this form. Save first, or a
      // just-corrected casting name/SKU is invisible to it and it just
      // re-confirms the same stale match.
      const parsedQuantity = parseInt(quantityText, 10);
      const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : form.quantity;
      // Reflect the save immediately, before attempting the rematch call -
      // if rematch then fails (network drop, etc), the edit is already
      // persisted and shown, not just persisted-but-invisible behind an
      // error toast.
      const saved = await updateItem(form.id, buildUpdatePayload(form, quantity));
      updateItemLocal(saved);
      setForm(saved);
      setQuantityText(String(saved.quantity));
      const updated = await rematchItem(form.id);
      updateItemLocal(updated);
      setForm(updated);
    } catch (err) {
      showError(err);
    } finally {
      setRematching(false);
    }
  }

  async function handleConfirmMatch() {
    if (!form) return;
    if (!form.castingName) {
      showToast('Casting name is required to confirm a match.', 'error');
      return;
    }
    setConfirmingMatch(true);
    try {
      const updated = await confirmMatch(
        form.id,
        {
          castingName: form.castingName,
          series: form.series,
          year: form.year ? parseInt(form.year, 10) : null,
        },
        form,
      );
      updateItemLocal(updated);
      setForm(updated);
    } catch (err) {
      showError(err);
    } finally {
      setConfirmingMatch(false);
    }
  }

  async function handleRefreshPrice() {
    if (!form) return;
    setRefreshingPrice(true);
    try {
      const updated = await refreshPrice(form.id);
      updateItemLocal(updated);
      setForm(updated);
    } catch (err) {
      showError(err);
    } finally {
      setRefreshingPrice(false);
    }
  }

  /** Tapping the tag: turning off, or staging a single-quantity item, applies
   * immediately. Turning on an item you own multiple of asks how many of the
   * total are actually being listed first - selling 1 of 3 shouldn't stage
   * (and later export) all 3. */
  function handleStagedTagClick() {
    if (!form) return;
    if (!form.stagedForListing && form.quantity > 1) {
      setStageQtyPromptOpen(true);
      return;
    }
    handleToggleStaged();
  }

  async function handleToggleStaged() {
    if (!form) return;
    const next = !form.stagedForListing;
    setTogglingStaged(true);
    try {
      const updated = await updateItem(form.id, { staged_for_listing: next });
      updateItemLocal(updated);
      setForm(updated);
      showToast(next ? 'Marked for eBay listing' : 'Removed from eBay listing', 'success');
    } catch (err) {
      showError(err);
    } finally {
      setTogglingStaged(false);
    }
  }

  /** Staging fewer than the full quantity splits the item: the original row
   * shrinks and stays in the collection, a new row (staged) carries the
   * listed portion - status/staged_for_listing are per-row, so this is the
   * only way to represent "some in collection, some going up for sale". */
  async function handleStageQuantity(n: number) {
    if (!form) return;
    setStageQtyPromptOpen(false);
    if (n >= form.quantity) {
      await handleToggleStaged();
      return;
    }
    setTogglingStaged(true);
    try {
      const { original, split } = await splitItem(form.id, n);
      updateItemLocal(original);
      addItem(split);
      showToast(`Staged ${n} for eBay listing - ${original.quantity} left in your collection`, 'success');
      navigate(`/item/${split.id}`);
    } catch (err) {
      showError(err);
    } finally {
      setTogglingStaged(false);
    }
  }

  async function handleDelete() {
    if (!form) return;
    try {
      await deleteItem(form.id);
      removeItemLocal(form.id);
      navigate('/');
    } catch (err) {
      showError(err);
    }
  }

  async function handleAttachPhoto(slot: 'main' | 'secondary', file: File) {
    if (!form) return;
    try {
      const updated = await attachPhoto(form.id, file, slot);
      updateItemLocal(updated);
      setForm(updated);
    } catch (err) {
      showError(err);
    } finally {
      setPhotoActionsSlot(null);
    }
  }

  async function handleDeletePhotoSlot(slot: 'main' | 'secondary') {
    if (!form) return;
    try {
      const updated = await deletePhoto(form.id, slot);
      updateItemLocal(updated);
      setForm(updated);
    } catch (err) {
      showError(err);
    } finally {
      setPhotoActionsSlot(null);
    }
  }

  const stale = (daysAgo(form.livePriceFetchedAt) ?? 0) > 7;
  const listingTitle = resolveListingTitle(form);
  const listingDescription = resolveListingDescription(form);

  async function copy(text: string, which: 'title' | 'description') {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/')} aria-label="Back">
          <Icon name="cancel01" size={20} />
        </button>
        <h1 className={styles.title}>{form.castingName || 'Unrecognized item'}</h1>
      </header>

      <section className={styles.photos}>
        <div className={styles.photoSlot}>
          {form.photoUrl ? (
            <>
              <img src={form.photoUrl} alt="" onClick={() => setLightbox(form.photoUrl)} />
              <button
                className={styles.photoMenuButton}
                onClick={() => setPhotoActionsSlot('main')}
                aria-label="Photo options"
              >
                <Icon name="cameraAdd01" size={16} />
              </button>
            </>
          ) : (
            <div className={styles.photoPlaceholder} onClick={() => mainFileInput.current?.click()}>
              <Icon name="car05" size={28} />
            </div>
          )}
          <input
            ref={mainFileInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && handleAttachPhoto('main', e.target.files[0])}
          />
        </div>
        <div className={styles.photoSlot}>
          {form.basePhotoUrl ? (
            <>
              <img src={form.basePhotoUrl} alt="" onClick={() => setLightbox(form.basePhotoUrl)} />
              <button
                className={styles.photoMenuButton}
                onClick={() => setPhotoActionsSlot('secondary')}
                aria-label="Photo options"
              >
                <Icon name="cameraAdd01" size={16} />
              </button>
            </>
          ) : (
            <div className={styles.addPhoto} onClick={() => secondaryFileInput.current?.click()}>
              <Icon name="cameraAdd01" size={24} />
              <span>Add photo</span>
            </div>
          )}
          <input
            ref={secondaryFileInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && handleAttachPhoto('secondary', e.target.files[0])}
          />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Identification</h2>
        <Select
          label="Brand"
          options={BRAND_OPTIONS}
          value={form.brand ?? ''}
          onChange={(e) => set('brand', e.target.value)}
        />
        <Input label="Car make" value={form.carMake ?? ''} onChange={(e) => set('carMake', e.target.value)} />
        <Input
          label="Casting name"
          value={form.castingName ?? ''}
          onChange={(e) => set('castingName', e.target.value)}
        />
        <div className={styles.row2}>
          <Input label="Series / theme" value={form.series ?? ''} onChange={(e) => set('series', e.target.value)} />
          <Input
            label="Series #"
            placeholder="e.g. 2/4"
            value={form.seriesNumber ?? ''}
            onChange={(e) => set('seriesNumber', e.target.value)}
          />
        </div>
        <Input
          label="Special series"
          value={form.specialSeries ?? ''}
          onChange={(e) => set('specialSeries', e.target.value)}
        />
        <div className={styles.row2}>
          <Input
            label="Year"
            inputMode="numeric"
            value={form.year ?? ''}
            onChange={(e) => set('year', e.target.value)}
          />
          <Input
            label="Collector # (yearly)"
            placeholder="e.g. 542"
            value={form.collectorNumber ?? ''}
            onChange={(e) => set('collectorNumber', e.target.value)}
          />
        </div>
        <div className={styles.row2}>
          <Input
            label="SKU / Toy #"
            value={form.sku ?? ''}
            onChange={(e) => set('sku', e.target.value.toUpperCase())}
          />
          <Input label="Color / deco" value={form.color ?? ''} onChange={(e) => set('color', e.target.value)} />
        </div>
        <div className={styles.row2}>
          <Select
            label="Base country"
            options={BASE_COUNTRY_OPTIONS}
            value={form.baseCountry ?? ''}
            onChange={(e) => set('baseCountry', e.target.value || null)}
          />
          <Select
            label="Wheel type"
            options={WHEEL_TYPE_OPTIONS}
            value={form.wheelType ?? ''}
            onChange={(e) => set('wheelType', e.target.value || null)}
          />
        </div>
        <Select
          label="Body/base construction"
          options={CONSTRUCTION_OPTIONS}
          value={form.bodyBaseConstruction ?? ''}
          onChange={(e) => set('bodyBaseConstruction', e.target.value || null)}
        />
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Special flags</label>
          <div className={styles.gradeRow}>
            {SPECIAL_FLAG_OPTIONS.map((flag) => (
              <Tag
                key={flag}
                selected={form.specialFlags.includes(flag)}
                onClick={() =>
                  set(
                    'specialFlags',
                    form.specialFlags.includes(flag)
                      ? form.specialFlags.filter((f) => f !== flag)
                      : [...form.specialFlags, flag],
                  )
                }
              >
                {flag}
              </Tag>
            ))}
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Treasure hunt</label>
          <TabBar>
            <Tab selected={form.treasureHunt === null} onClick={() => set('treasureHunt', null as TreasureHunt)}>
              Not a TH
            </Tab>
            <Tab selected={form.treasureHunt === 'TH'} onClick={() => set('treasureHunt', 'TH' as TreasureHunt)}>
              TH
            </Tab>
            <Tab
              selected={form.treasureHunt === 'Super TH'}
              onClick={() => set('treasureHunt', 'Super TH' as TreasureHunt)}
            >
              Super TH
            </Tab>
          </TabBar>
        </div>
        <Input
          label="Comments"
          placeholder="Any other notes about this specific item"
          value={form.comments ?? ''}
          onChange={(e) => set('comments', e.target.value || null)}
        />
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Match</h2>
          <Button
            variant="text"
            icon="scan"
            iconSpin={rematching}
            onClick={handleRematch}
            disabled={rematching}
          >
            {rematching ? 'Rematching…' : 'Rematch'}
          </Button>
        </div>
        <div className={rematching ? styles.refreshing : undefined}>
          <div className={styles.matchRow}>
            <Badge variant={matchBadgeVariant(form.matchStatus)}>{matchLabel(form)}</Badge>
            <Badge variant="neutral">{form.packagingType === 'carded' ? 'Carded' : 'Loose'}</Badge>
          </div>
          {form.matchNotes && <p className={styles.notes}>{form.matchNotes}</p>}
          {form.matchStatus !== 'confirmed' && (
            <Button variant="outlined" onClick={handleConfirmMatch} disabled={confirmingMatch}>
              {confirmingMatch ? 'Confirming…' : 'Confirm this is correct'}
            </Button>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Pricing</h2>
          <Button
            variant="text"
            icon="refresh01"
            iconSpin={refreshingPrice}
            onClick={handleRefreshPrice}
            disabled={refreshingPrice}
          >
            {refreshingPrice ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
        <div className={refreshingPrice ? styles.refreshing : undefined}>
          <div className={styles.priceGrid}>
            <div>
              <div className={styles.priceLabel}>Guide price</div>
              <div className={styles.priceValue}>
                {form.guidePrice != null ? money(form.guidePrice) : 'Not in guide'}
              </div>
            </div>
            <div>
              <div className={styles.priceLabel}>Recommended</div>
              <div className={styles.priceValue}>{money(form.liveRecommended)}</div>
            </div>
            <div>
              <div className={styles.priceLabel}>eBay range</div>
              <div className={styles.priceValue}>
                {form.liveLow != null && form.liveHigh != null
                  ? `${money(form.liveLow)} – ${money(form.liveHigh)}`
                  : '—'}
              </div>
            </div>
          </div>
          <p className={styles.freshness}>
            Guide price is a static reference-book value for this exact casting/year/packaging - only
            available when matched to a seeded reference row. Recommended + eBay range come from live
            listings instead.
          </p>
          {form.livePriceFetchedAt && (
            <p className={[styles.freshness, stale ? styles.stale : ''].filter(Boolean).join(' ')}>
              Updated {daysAgo(form.livePriceFetchedAt)} days ago
            </p>
          )}
          {form.liveSummary && <p className={styles.notes}>{form.liveSummary}</p>}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Listing text</h2>
        <div className={styles.field}>
          <div className={styles.listingHeader}>
            <label className={styles.fieldLabel}>Title ({listingTitle.length}/80)</label>
            <div className={styles.listingHeaderActions}>
              {form.customListingTitle != null && (
                <button className={styles.copyButton} onClick={() => set('customListingTitle', null)}>
                  Reset
                </button>
              )}
              <button className={styles.copyButton} onClick={() => copy(listingTitle, 'title')}>
                {copied === 'title' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <input
            className={styles.listingText}
            value={listingTitle}
            onChange={(e) => set('customListingTitle', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <div className={styles.listingHeader}>
            <label className={styles.fieldLabel}>Description</label>
            <div className={styles.listingHeaderActions}>
              {form.customListingDescription != null && (
                <button className={styles.copyButton} onClick={() => set('customListingDescription', null)}>
                  Reset
                </button>
              )}
              <button className={styles.copyButton} onClick={() => copy(listingDescription, 'description')}>
                {copied === 'description' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <textarea
            className={styles.listingTextBlock}
            value={listingDescription}
            onChange={(e) => set('customListingDescription', e.target.value)}
          />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Your tracking</h2>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Status</label>
          <TabBar>
            <Tab
              selected={form.trackingStatus === 'in_collection'}
              onClick={() => set('trackingStatus', 'in_collection' as TrackingStatus)}
            >
              In collection
            </Tab>
            <Tab
              selected={form.trackingStatus === 'listed'}
              onClick={() => set('trackingStatus', 'listed' as TrackingStatus)}
            >
              Listed
            </Tab>
            <Tab
              selected={form.trackingStatus === 'sold'}
              onClick={() => set('trackingStatus', 'sold' as TrackingStatus)}
            >
              Sold
            </Tab>
          </TabBar>
        </div>
        <div className={styles.field}>
          <Tag selected={form.stagedForListing} onClick={handleStagedTagClick} disabled={togglingStaged}>
            {togglingStaged
              ? 'Updating…'
              : form.stagedForListing
                ? 'Staged for eBay listing'
                : 'Mark for eBay listing'}
          </Tag>
        </div>
        {form.packagingType === 'carded' && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Card / bubble condition</label>
            <GradePicker value={form.conditionCardGrade} onChange={(g) => set('conditionCardGrade', g)} />
          </div>
        )}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{form.packagingType === 'carded' ? 'Car condition' : 'Condition'}</label>
          <GradePicker value={form.conditionCarGrade} onChange={(g) => set('conditionCarGrade', g)} />
        </div>
        <div className={styles.row2}>
          <Input
            label="Quantity"
            inputMode="numeric"
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)}
            onBlur={() => {
              const parsed = parseInt(quantityText, 10);
              const valid = Number.isFinite(parsed) && parsed > 0 ? parsed : form.quantity;
              set('quantity', valid);
              setQuantityText(String(valid));
            }}
          />
          <Input
            label="Condition notes"
            value={form.condition ?? ''}
            onChange={(e) => set('condition', e.target.value)}
          />
        </div>
        <div className={styles.row2}>
          <Input
            label="Cost basis (USD)"
            inputMode="decimal"
            value={form.costBasis != null ? String(form.costBasis) : ''}
            onChange={(e) => set('costBasis', e.target.value ? parseFloat(e.target.value) : null)}
          />
          <Input
            label="Listing price (USD)"
            inputMode="decimal"
            value={form.listingPrice != null ? String(form.listingPrice) : ''}
            onChange={(e) => set('listingPrice', e.target.value ? parseFloat(e.target.value) : null)}
          />
        </div>
        <Input
          label="Sold price (USD)"
          inputMode="decimal"
          value={form.soldPrice != null ? String(form.soldPrice) : ''}
          onChange={(e) => set('soldPrice', e.target.value ? parseFloat(e.target.value) : null)}
        />
      </section>

      <div className={styles.actions}>
        <Button
          variant="filled"
          onClick={handleSave}
          disabled={saving}
          icon={saving ? 'refresh01' : undefined}
          iconSpin={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          Delete
        </Button>
      </div>

      <Sheet open={stageQtyPromptOpen} onClose={() => setStageQtyPromptOpen(false)}>
        <h2 className={styles.cardTitle}>How many of your {form.quantity} are you listing?</h2>
        <div className={styles.gradeRow}>
          {Array.from({ length: form.quantity }, (_, i) => i + 1).map((n) => (
            <Tag key={n} onClick={() => handleStageQuantity(n)}>
              {n === form.quantity ? `All ${n}` : n}
            </Tag>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!lightbox} onClose={() => setLightbox(null)}>
        {lightbox && <img src={lightbox} alt="" className={styles.lightboxImg} />}
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <h2 className={styles.cardTitle}>Delete this car?</h2>
        <p className={styles.notes}>This can't be undone.</p>
        <div className={styles.actions}>
          <Button variant="text" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!photoActionsSlot} onClose={() => setPhotoActionsSlot(null)}>
        <h2 className={styles.cardTitle}>Photo options</h2>
        <div className={styles.actions}>
          <Button
            variant="outlined"
            onClick={() =>
              photoActionsSlot === 'main' ? mainFileInput.current?.click() : secondaryFileInput.current?.click()
            }
          >
            Replace
          </Button>
          <Button
            variant="destructive"
            onClick={() => photoActionsSlot && handleDeletePhotoSlot(photoActionsSlot)}
          >
            Delete
          </Button>
        </div>
      </Sheet>

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
