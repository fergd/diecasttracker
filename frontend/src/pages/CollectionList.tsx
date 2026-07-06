import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabBar } from '../components/TabBar';
import { Tab } from '../components/Tab';
import { Input } from '../components/Input';
import { Tag } from '../components/Tag';
import { Button } from '../components/Button';
import { ListItem } from '../components/ListItem';
import { ScanFab } from '../components/ScanFab';
import { useInventory } from '../api/InventoryContext';
import { matchLabel, matchBadgeVariant, trackingLabel, rematchItem } from '../api/inventory';
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

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function CollectionList() {
  const { items, error, updateItemLocal } = useInventory();
  const navigate = useNavigate();
  const [packagingType, setPackagingType] = useState<'carded' | 'loose'>('carded');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchFilter, setMatchFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRematching, setBatchRematching] = useState(false);

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
        <Button variant="text" onClick={toggleSelectionMode}>
          {selectionMode ? 'Cancel' : 'Select'}
        </Button>
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
        {filtered.map((item) => (
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

      {items && filtered.length === 0 && (
        <div className={styles.empty}>No cars match the current filters.</div>
      )}

      {selectionMode ? (
        <div className={styles.selectionBar}>
          <span className={styles.selectionCount}>{selectedIds.size} selected</span>
          <Button
            variant="filled"
            disabled={selectedIds.size === 0 || batchRematching}
            onClick={handleBatchRematch}
          >
            {batchRematching ? 'Rematching…' : 'Rematch'}
          </Button>
        </div>
      ) : (
        <ScanFab packagingType={packagingType} />
      )}
    </div>
  );
}
