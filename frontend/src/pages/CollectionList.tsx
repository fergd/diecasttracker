import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabBar } from '../components/TabBar';
import { Tab } from '../components/Tab';
import { Input } from '../components/Input';
import { Tag } from '../components/Tag';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { ListItem } from '../components/ListItem';
import { ScanFab } from '../components/ScanFab';
import { useInventory } from '../api/InventoryContext';
import {
  matchLabel,
  matchBadgeVariant,
  trackingLabel,
  rematchItem,
  updateItem,
  deleteItem,
  type InventoryItem,
  type TrackingStatus,
} from '../api/inventory';
import styles from './CollectionList.module.css';

const MATCH_FILTERS = [
  { value: null, label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'needs_review', label: 'Review' },
  { value: 'no_match', label: 'No match' },
] as const;

const STATUS_FILTERS = [
  { value: 'in_collection', label: 'Collection' },
  { value: 'listed', label: 'Listed' },
  { value: 'sold', label: 'Sold' },
] as const;

type SortField = 'castingName' | 'brand' | 'carMake' | 'year' | 'series';

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'castingName', label: 'Model' },
  { field: 'brand', label: 'Brand' },
  { field: 'carMake', label: 'Car make' },
  { field: 'year', label: 'Year' },
  { field: 'series', label: 'Theme' },
];

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function CollectionList() {
  const { items, error, updateItemLocal, removeItemLocal } = useInventory();
  const navigate = useNavigate();
  const [packagingType, setPackagingType] = useState<'carded' | 'loose'>('carded');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchFilter, setMatchFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRematching, setBatchRematching] = useState(false);
  const [bulkStatusMenuOpen, setBulkStatusMenuOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  function chooseSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setSortMenuOpen(false);
  }

  function clearFilters() {
    setSearchQuery('');
    setMatchFilter(null);
    setStatusFilter(null);
  }

  function toggleSelectionMode() {
    setSelectionMode((m) => !m);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBatchRematch() {
    setBatchRematching(true);
    try {
      const results = await Promise.allSettled([...selectedIds].map((id) => rematchItem(id)));
      results.forEach((r) => {
        if (r.status === 'fulfilled') updateItemLocal(r.value);
      });
    } finally {
      setBatchRematching(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }

  async function handleBulkSetStatus(status: TrackingStatus) {
    setBulkStatusMenuOpen(false);
    setBulkActionBusy(true);
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((id) => updateItem(id, { status })),
      );
      results.forEach((r) => {
        if (r.status === 'fulfilled') updateItemLocal(r.value);
      });
    } finally {
      setBulkActionBusy(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }

  async function handleBulkDelete() {
    setConfirmBulkDelete(false);
    setBulkActionBusy(true);
    try {
      const results = await Promise.allSettled([...selectedIds].map((id) => deleteItem(id)));
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') removeItemLocal([...selectedIds][i]);
      });
    } finally {
      setBulkActionBusy(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }

  const filtered = useMemo(() => {
    if (!items) return [];
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (item.packagingType !== packagingType) return false;
      if (matchFilter && item.matchStatus !== matchFilter) return false;
      if (statusFilter && item.trackingStatus !== statusFilter) return false;
      if (query) {
        const haystack = [
          item.castingName,
          item.brand,
          item.series,
          item.seriesNumber,
          item.specialSeries,
          item.sku,
          item.carMake,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, packagingType, matchFilter, statusFilter, searchQuery]);

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    const value = (item: InventoryItem): string | number => {
      if (sortField === 'year') return item.year ? parseInt(item.year, 10) : -Infinity;
      return (item[sortField] ?? '').toLowerCase();
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortField, sortDir]);

  const summary = useMemo(() => {
    const count = filtered.reduce((sum, item) => sum + item.quantity, 0);
    const value = filtered.reduce(
      (sum, item) => sum + (item.price != null ? item.price * item.quantity : 0),
      0,
    );
    return { count, value };
  }, [filtered]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Zamak Ledger</h1>
          <div className={styles.subtitle}>
            {summary.count} cars · Est. {money(summary.value)}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.sortButton} onClick={() => setSortMenuOpen(true)} aria-label="Sort">
            <Icon name="sorting01" size={20} />
          </button>
          <Button variant="text" onClick={toggleSelectionMode}>
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>
        </div>
      </header>

      <TabBar>
        <Tab selected={packagingType === 'carded'} onClick={() => setPackagingType('carded')}>
          Carded
        </Tab>
        <Tab selected={packagingType === 'loose'} onClick={() => setPackagingType('loose')}>
          Loose
        </Tab>
      </TabBar>

      <Input
        variant="outlined"
        placeholder="Search your collection"
        leadingIcon="search01"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={styles.search}
      />

      <div className={styles.filterRow}>
        {MATCH_FILTERS.map((f) => (
          <Tag key={f.label} selected={matchFilter === f.value} onClick={() => setMatchFilter(f.value)}>
            {f.label}
          </Tag>
        ))}
        <div className={styles.filterDivider} />
        {STATUS_FILTERS.map((f) => (
          <Tag
            key={f.value}
            selected={statusFilter === f.value}
            onClick={() => setStatusFilter(statusFilter === f.value ? null : f.value)}
          >
            {f.label}
          </Tag>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {!items && !error && <div className={styles.loading}>Loading…</div>}

      <div className={styles.list}>
        {sorted.map((item) => (
          <ListItem
            key={item.id}
            onClick={() => (selectionMode ? toggleSelected(item.id) : navigate(`/item/${item.id}`))}
            selectable={selectionMode}
            selected={selectedIds.has(item.id)}
            photoUrl={item.photoUrl ?? undefined}
            title={item.castingName || 'Unrecognized item'}
            meta={[item.brand, item.carMake, item.year].filter(Boolean).join(' · ') || '—'}
            matchLabel={matchLabel(item)}
            matchVariant={matchBadgeVariant(item.matchStatus)}
            showTreasureHunt={!!item.treasureHunt}
            price={item.price != null ? money(item.price) : undefined}
            statusLabel={trackingLabel(item.trackingStatus)}
          />
        ))}
      </div>

      {items && items.length === 0 && (
        <div className={styles.firstRunEmpty}>
          <Icon name="cameraAdd01" size={32} />
          <p>Nothing scanned yet.</p>
          <p className={styles.firstRunHint}>Tap the camera button below to scan your first car.</p>
        </div>
      )}

      {items && items.length > 0 && filtered.length === 0 && (
        <div className={styles.empty}>
          No cars match the current filters.
          <button className={styles.clearFiltersLink} onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {selectionMode ? (
        <div className={styles.selectionBar}>
          <span className={styles.selectionCount}>{selectedIds.size} selected</span>
          <button
            className={styles.selectionIconButton}
            disabled={selectedIds.size === 0 || batchRematching || bulkActionBusy}
            onClick={handleBatchRematch}
            aria-label="Rematch selected"
          >
            <Icon name="scan" size={18} />
          </button>
          <button
            className={styles.selectionIconButton}
            disabled={selectedIds.size === 0 || bulkActionBusy}
            onClick={() => setBulkStatusMenuOpen(true)}
            aria-label="Set status for selected"
          >
            <Icon name="tick02" size={18} />
          </button>
          <button
            className={styles.selectionIconButton}
            disabled={selectedIds.size === 0 || bulkActionBusy}
            onClick={() => setConfirmBulkDelete(true)}
            aria-label="Delete selected"
          >
            <Icon name="delete02" size={18} />
          </button>
        </div>
      ) : (
        <ScanFab packagingType={packagingType} />
      )}

      <Sheet open={sortMenuOpen} onClose={() => setSortMenuOpen(false)}>
        <h2 className={styles.sheetTitle}>Sort by</h2>
        {SORT_OPTIONS.map((opt) => (
          <button key={opt.field} className={styles.sortOption} onClick={() => chooseSort(opt.field)}>
            <span>{opt.label}</span>
            {sortField === opt.field && <span className={styles.sortDirLabel}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </button>
        ))}
        {sortField && (
          <Button variant="text" onClick={() => { setSortField(null); setSortMenuOpen(false); }}>
            Clear sort
          </Button>
        )}
      </Sheet>

      <Sheet open={bulkStatusMenuOpen} onClose={() => setBulkStatusMenuOpen(false)}>
        <h2 className={styles.sheetTitle}>Set status for {selectedIds.size} cars</h2>
        <button className={styles.sortOption} onClick={() => handleBulkSetStatus('in_collection')}>
          <span>In collection</span>
        </button>
        <button className={styles.sortOption} onClick={() => handleBulkSetStatus('listed')}>
          <span>Listed</span>
        </button>
        <button className={styles.sortOption} onClick={() => handleBulkSetStatus('sold')}>
          <span>Sold</span>
        </button>
      </Sheet>

      <Sheet open={confirmBulkDelete} onClose={() => setConfirmBulkDelete(false)}>
        <h2 className={styles.sheetTitle}>Delete {selectedIds.size} cars?</h2>
        <p className={styles.empty}>This can't be undone.</p>
        <div className={styles.bulkDeleteActions}>
          <Button variant="text" onClick={() => setConfirmBulkDelete(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleBulkDelete}>
            Delete
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
