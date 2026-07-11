import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchInventory, type InventoryItem } from './inventory';

interface InventoryContextValue {
  items: InventoryItem[] | null;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (item: InventoryItem) => void;
  updateItemLocal: (item: InventoryItem) => void;
  removeItemLocal: (id: number) => void;
  getItem: (id: number) => InventoryItem | undefined;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

/** Loads the full inventory once and keeps it in memory, mirroring the
 * vanilla app's `allItems` array - there's no GET /inventory/{id}, so the
 * detail page and scan flow both read/write this same shared list. */
export function InventoryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lives here rather than as local state in CollectionList so it survives
  // navigating into an item and back - the list page unmounts on that
  // transition, which would otherwise reset a plain useState to ''.
  const [searchQuery, setSearchQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchInventory();
      setItems(fresh);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback((item: InventoryItem) => {
    setItems((prev) => [item, ...(prev ?? [])]);
  }, []);

  const updateItemLocal = useCallback((item: InventoryItem) => {
    setItems((prev) => (prev ? prev.map((i) => (i.id === item.id ? item : i)) : prev));
  }, []);

  const removeItemLocal = useCallback((id: number) => {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
  }, []);

  const getItem = useCallback((id: number) => items?.find((i) => i.id === id), [items]);

  return (
    <InventoryContext.Provider
      value={{
        items,
        error,
        refresh,
        addItem,
        updateItemLocal,
        removeItemLocal,
        getItem,
        searchQuery,
        setSearchQuery,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}
