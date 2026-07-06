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
import { useInventory } from '../api/InventoryContext';
import {
  updateItem,
  rematchItem,
  confirmMatch,
  refreshPrice,
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
import { generateListingTitle, generateListingDescription } from '../api/listingText';
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

export function ItemDetail() {
  const { id } = useParams();
  const itemId = Number(id);
  const navigate = useNavigate();
  const { getItem, updateItemLocal, removeItemLocal } = useInventory();
  const item = getItem(itemId);

  const [form, setForm] = useState<InventoryItem | null>(item ?? null);
  const [saving, setSaving] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'title' | 'description' | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmingMatch, setConfirmingMatch] = useState(false);
  const [photoActionsSlot, setPhotoActionsSlot] = useState<'main' | 'secondary' | null>(null);
  const mainFileInput = useRef<HTMLInputElement>(null);
  const secondaryFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) setForm(item);
  }, [item]);

  useEffect(() => {
    if (!item && itemId) {
      const t = setTimeout(() => navigate('/', { replace: true }), 0);
      return () => clearTimeout(t);
    }
  }, [item, itemId, navigate]);

  if (!form) return null;

  function set<K extends keyof InventoryItem>(key: K, value: InventoryItem[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await updateItem(form.id, {
        canonical_brand: form.brand,
        car_make: form.carMake,
        canonical_casting_name: form.castingName,
        canonical_series: form.series,
        special_series: form.specialSeries,
        canonical_year: form.year ? parseInt(form.year, 10) : null,
        extracted_collector_num: form.collectorNumber,
        extracted_series_number: form.seriesNumber,
        canonical_sku: form.sku,
        extracted_color: form.color,
        treasure_hunt: form.treasureHunt,
        base_country: form.baseCountry,
        wheel_type: form.wheelType,
        body_base_construction: form.bodyBaseConstruction,
        special_flags: form.specialFlags,
        status: form.trackingStatus,
        quantity: form.quantity,
        condition: form.condition,
        condition_car_grade: form.conditionCarGrade,
        condition_card_grade: form.conditionCardGrade,
        cost_basis_usd: form.costBasis,
        listing_price_usd: form.listingPrice,
        sold_price_usd: form.soldPrice,
      });
      // Editing identity fields (casting name, series, year, etc) can make
      // the previously-computed match status/notes stale - re-run matching
      // against the corrected data. No-ops server-side if already manually
      // confirmed, so this is always safe to call.
      const rematched = await rematchItem(form.id);
      updateItemLocal(rematched);
      setForm(rematched);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRematch() {
    if (!form) return;
    setRematching(true);
    try {
      const updated = await rematchItem(form.id);
      updateItemLocal(updated);
      setForm(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRematching(false);
    }
  }

  async function handleConfirmMatch() {
    if (!form) return;
    if (!form.castingName) {
      setError('Casting name is required to confirm a match.');
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
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingPrice(false);
    }
  }

  async function handleDelete() {
    if (!form) return;
    try {
      await deleteItem(form.id);
      removeItemLocal(form.id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAttachPhoto(slot: 'main' | 'secondary', file: File) {
    if (!form) return;
    try {
      const updated = await attachPhoto(form.id, file, slot);
      updateItemLocal(updated);
      setForm(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoActionsSlot(null);
    }
  }

  const stale = (daysAgo(form.livePriceFetchedAt) ?? 0) > 7;
  const listingTitle = generateListingTitle(form);
  const listingDescription = generateListingDescription(form);

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

      {error && <div className={styles.errorBanner}>{error}</div>}

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
          <Input label="SKU / Toy #" value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value)} />
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
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Match</h2>
          <button className={styles.iconButton} onClick={handleRematch} disabled={rematching} aria-label="Rematch">
            <Icon name="scan" size={18} />
          </button>
        </div>
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
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Pricing</h2>
          <button
            className={styles.iconButton}
            onClick={handleRefreshPrice}
            disabled={refreshingPrice}
            aria-label="Refresh price"
          >
            <Icon name="refresh01" size={18} />
          </button>
        </div>
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
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Listing text</h2>
        <div className={styles.field}>
          <div className={styles.listingHeader}>
            <label className={styles.fieldLabel}>Title ({listingTitle.length}/80)</label>
            <button className={styles.copyButton} onClick={() => copy(listingTitle, 'title')}>
              {copied === 'title' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className={styles.listingText}>{listingTitle}</p>
        </div>
        <div className={styles.field}>
          <div className={styles.listingHeader}>
            <label className={styles.fieldLabel}>Description</label>
            <button className={styles.copyButton} onClick={() => copy(listingDescription, 'description')}>
              {copied === 'description' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className={styles.listingTextBlock}>{listingDescription}</p>
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
            value={String(form.quantity)}
            onChange={(e) => set('quantity', parseInt(e.target.value, 10) || 1)}
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
        <Button variant="filled" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}
        </Button>
        <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
          Delete
        </Button>
      </div>

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
    </div>
  );
}
