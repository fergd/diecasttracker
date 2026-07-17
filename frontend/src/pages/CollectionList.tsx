import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabBar } from '../components/TabBar';
import { Tab } from '../components/Tab';
import { Input } from '../components/Input';
import { Tag } from '../components/Tag';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { ListItemIonic as ListItem } from '../components/ListItemIonic';
import { IconButtonIonic } from '../components/IconButtonIonic';
import { ScanFab } from '../components/ScanFab';
import { Toast } from '../components/Toast';
import { useInventory } from '../api/InventoryContext';
import { downloadEbayCsv } from '../api/ebayExport';
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
  const { items, error, updateItemLocal, removeItemLocal, searchQuery, setSearchQuery } = useInventory();
  const navigate = useNavigate();
  const [packagingType, setPackagingType] = useState<'carded' | 'loose'>('carded');
  const [matchFilter, setMatchFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchRematching, setBatchRematching] = useState(false);
  const [bulkListingMenuOpen, setBulkListingMenuOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [relotWarningCount, setRelotWarningCount] = useState<number | null>(null);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [actionItem, setActionItem] = useState<InventoryItem | null>(null);
  const [actionStage, setActionStage] = useState<'menu' | 'status' | 'delete'>('menu');
  const [itemActionBusy, setItemActionBusy] = useState(false);

  const stagedItems = useMemo(() => (items ?? []).filter((i) => i.stagedForListing), [items]);

  async function handleExportCsv() {
    setExporting(true);
    try {
      downloadEbayCsv(stagedItems);
      const results = await Promise.allSettled(
        stagedItems.map((i) =>
          updateItem(i.id, { status: 'listed' as TrackingStatus, staged_for_listing: false }),
        ),
      );
      let failures = 0;
      results.forEach((r) => {
        if (r.status === 'fulfilled') updateItemLocal(r.value);
        else failures += 1;
      });
      if (failures > 0) {
        setToast({
          message: `CSV downloaded, but ${failures} item${failures === 1 ? '' : 's'} failed to move to Listed`,
          variant: 'error',
        });
      } else {
        setToast({ message: `Exported ${stagedItems.length} car${stagedItems.length === 1 ? '' : 's'} to CSV`, variant: 'success' });
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), variant: 'error' });
    } finally {
      setExporting(false);
    }
  }

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
    setBulkListingMenuOpen(false);
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

  async function handleBulkStageForListing() {
    setBulkListingMenuOpen(false);
    setBulkActionBusy(true);
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((id) => updateItem(id, { staged_for_listing: true })),
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

  /** Combining always overwrites lot_id, which would otherwise silently
   * shrink or disband any lot a selected item already belongs to. Block on
   * that and let the user explicitly choose to proceed rather than losing
   * a previous grouping without warning. */
  function handleCombineIntoLotClick() {
    const alreadyLotted = [...selectedIds].filter((id) => items?.find((i) => i.id === id)?.lotId).length;
    if (alreadyLotted > 0) {
      setRelotWarningCount(alreadyLotted);
      return;
    }
    void handleBulkCombineIntoLot();
  }

  async function handleBulkCombineIntoLot() {
    setRelotWarningCount(null);
    const lotId = `lot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const count = selectedIds.size;
    setBulkActionBusy(true);
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((id) => updateItem(id, { lot_id: lotId, staged_for_listing: true })),
      );
      let failures = 0;
      results.forEach((r) => {
        if (r.status === 'fulfilled') updateItemLocal(r.value);
        else failures += 1;
      });
      setToast(
        failures > 0
          ? { message: `Combined, but ${failures} car${failures === 1 ? '' : 's'} failed`, variant: 'error' }
          : { message: `Combined ${count} cars into one eBay listing`, variant: 'success' },
      );
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

  function closeItemActions() {
    setActionItem(null);
    setActionStage('menu');
  }

  async function handleItemRematch() {
    if (!actionItem) return;
    setItemActionBusy(true);
    try {
      const updated = await rematchItem(actionItem.id);
      updateItemLocal(updated);
      closeItemActions();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), variant: 'error' });
    } finally {
      setItemActionBusy(false);
    }
  }

  async function handleItemSetStatus(status: TrackingStatus) {
    if (!actionItem) return;
    setItemActionBusy(true);
    try {
      const updated = await updateItem(actionItem.id, { status });
      updateItemLocal(updated);
      closeItemActions();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), variant: 'error' });
    } finally {
      setItemActionBusy(false);
    }
  }

  async function handleItemToggleStaged() {
    if (!actionItem) return;
    setItemActionBusy(true);
    try {
      const updated = await updateItem(actionItem.id, { staged_for_listing: !actionItem.stagedForListing });
      updateItemLocal(updated);
      closeItemActions();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), variant: 'error' });
    } finally {
      setItemActionBusy(false);
    }
  }

  async function handleItemRemoveFromLot() {
    if (!actionItem) return;
    setItemActionBusy(true);
    try {
      const updated = await updateItem(actionItem.id, { lot_id: null });
      updateItemLocal(updated);
      closeItemActions();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), variant: 'error' });
    } finally {
      setItemActionBusy(false);
    }
  }

  async function handleItemDelete() {
    if (!actionItem) return;
    setItemActionBusy(true);
    try {
      await deleteItem(actionItem.id);
      removeItemLocal(actionItem.id);
      closeItemActions();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : String(err), variant: 'error' });
    } finally {
      setItemActionBusy(false);
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
        // Each word in the query must appear somewhere in the haystack, in any
        // order - "camaro custom" and "custom camaro" both match "Custom '11
        // Camaro", not just the exact phrase typed.
        const terms = query.split(/\s+/).filter(Boolean);
        if (!terms.every((term) => haystack.includes(term))) return false;
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
          <IconButtonIonic icon="sorting01" label="Sort" onClick={() => setSortMenuOpen(true)} />
          <Button variant="text" onClick={toggleSelectionMode}>
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>
        </div>
      </header>

      {stagedItems.length > 0 && (
        <div className={styles.stagedBanner}>
          <span>
            {stagedItems.length} car{stagedItems.length === 1 ? '' : 's'} staged for eBay listing
          </span>
          <Button
            variant="tonal"
            icon={exporting ? 'refresh01' : 'bookmark01'}
            iconSpin={exporting}
            disabled={exporting}
            onClick={handleExportCsv}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      )}

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
            onLongPress={selectionMode ? undefined : () => setActionItem(item)}
            selectable={selectionMode}
            selected={selectedIds.has(item.id)}
            photoUrl={item.photoUrl ?? undefined}
            title={item.castingName || 'Unrecognized item'}
            meta={[item.brand, item.carMake, item.year].filter(Boolean).join(' · ') || '—'}
            matchLabel={matchLabel(item)}
            matchVariant={matchBadgeVariant(item.matchStatus)}
            showTreasureHunt={!!item.treasureHunt}
            showLot={!!item.lotId}
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
          <IconButtonIonic
            icon="scan"
            label="Rematch selected"
            disabled={selectedIds.size === 0 || batchRematching || bulkActionBusy}
            onClick={handleBatchRematch}
          />
          <IconButtonIonic
            icon="bookmark01"
            label="Listing options for selected"
            disabled={selectedIds.size === 0 || bulkActionBusy}
            onClick={() => setBulkListingMenuOpen(true)}
          />
          <IconButtonIonic
            icon="package01"
            label="Combine selected into one eBay listing"
            disabled={selectedIds.size < 2 || bulkActionBusy}
            onClick={handleCombineIntoLotClick}
          />
          <IconButtonIonic
            icon="delete02"
            label="Delete selected"
            disabled={selectedIds.size === 0 || bulkActionBusy}
            onClick={() => setConfirmBulkDelete(true)}
          />
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

      <Sheet open={bulkListingMenuOpen} onClose={() => setBulkListingMenuOpen(false)}>
        <h2 className={styles.sheetTitle}>Listing options for {selectedIds.size} cars</h2>
        <button className={styles.sortOption} onClick={handleBulkStageForListing}>
          <span>Stage for listing</span>
        </button>
        <button className={styles.sortOption} onClick={() => handleBulkSetStatus('listed')}>
          <span>Listed</span>
        </button>
        <button className={styles.sortOption} onClick={() => handleBulkSetStatus('sold')}>
          <span>Sold</span>
        </button>
      </Sheet>

      <Sheet open={relotWarningCount !== null} onClose={() => setRelotWarningCount(null)}>
        <h2 className={styles.sheetTitle}>Combine into a new lot?</h2>
        <p className={styles.empty}>
          {relotWarningCount} of the selected cars {relotWarningCount === 1 ? 'is' : 'are'} already part of
          another lot. Combining will remove {relotWarningCount === 1 ? 'it' : 'them'} from that lot.
        </p>
        <div className={styles.bulkDeleteActions}>
          <Button variant="text" onClick={() => setRelotWarningCount(null)}>
            Cancel
          </Button>
          <Button variant="filled" onClick={handleBulkCombineIntoLot}>
            Combine anyway
          </Button>
        </div>
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

      <Sheet open={!!actionItem && actionStage === 'menu'} onClose={closeItemActions}>
        {actionItem && (
          <>
            <h2 className={styles.sheetTitle}>{actionItem.castingName || 'Unrecognized item'}</h2>
            <button className={styles.sortOption} disabled={itemActionBusy} onClick={handleItemRematch}>
              <span>Rematch</span>
            </button>
            <button className={styles.sortOption} disabled={itemActionBusy} onClick={() => setActionStage('status')}>
              <span>Set status</span>
            </button>
            <button className={styles.sortOption} disabled={itemActionBusy} onClick={handleItemToggleStaged}>
              <span>{actionItem.stagedForListing ? 'Remove from eBay listing' : 'Stage for eBay listing'}</span>
            </button>
            {actionItem.lotId && (
              <button className={styles.sortOption} disabled={itemActionBusy} onClick={handleItemRemoveFromLot}>
                <span>Remove from lot</span>
              </button>
            )}
            <button className={styles.sortOption} disabled={itemActionBusy} onClick={() => setActionStage('delete')}>
              <span>Delete</span>
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={!!actionItem && actionStage === 'status'} onClose={closeItemActions}>
        <h2 className={styles.sheetTitle}>Set status</h2>
        <button className={styles.sortOption} onClick={() => handleItemSetStatus('in_collection')}>
          <span>In collection</span>
        </button>
        <button className={styles.sortOption} onClick={() => handleItemSetStatus('listed')}>
          <span>Listed</span>
        </button>
        <button className={styles.sortOption} onClick={() => handleItemSetStatus('sold')}>
          <span>Sold</span>
        </button>
      </Sheet>

      <Sheet open={!!actionItem && actionStage === 'delete'} onClose={closeItemActions}>
        <h2 className={styles.sheetTitle}>Delete {actionItem?.castingName || 'this car'}?</h2>
        <p className={styles.empty}>This can't be undone.</p>
        <div className={styles.bulkDeleteActions}>
          <Button variant="text" onClick={closeItemActions}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleItemDelete}>
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
