import React, { useMemo, useState } from 'react';
import { loadEquipment } from '../../services/dataService';
import { useMagicItemIndex } from '../../hooks/useMagicItemIndex';
import { MagicItemDetailModal } from '../CharacterSheet/MagicItemDetailModal';
import {
  EMPTY_ITEM_FILTERS,
  filterLibraryItems,
  gearLibraryItems,
  itemFiltersAreActive,
  magicLibraryItems,
  type ItemLibraryFilters,
} from '../../utils/itemLibrary';
import { GearDetail } from './GearDetail';
import { ItemCard } from './ItemCard';
import { ItemFilters } from './ItemFilters';

const PAGE = 60;

export const ItemLibrary: React.FC = () => {
  const magicIndex = useMagicItemIndex();
  const [filters, setFilters] = useState<ItemLibraryFilters>(EMPTY_ITEM_FILTERS);
  const [page, setPage] = useState({ key: '', extra: 0 });
  const [selected, setSelected] = useState<{ kind: 'gear' | 'magic'; slug: string } | null>(null);

  const catalog = useMemo(() => {
    const gear = gearLibraryItems(loadEquipment());
    return magicIndex ? [...gear, ...magicLibraryItems(magicIndex)] : gear;
  }, [magicIndex]);

  const filtered = useMemo(() => filterLibraryItems(catalog, filters), [catalog, filters]);
  const filterKey = JSON.stringify(filters);
  const extra = page.key === filterKey ? page.extra : 0;
  const visible = filtered.slice(0, PAGE + extra);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-theme-primary">Item Library</h1>
        <p className="text-theme-secondary mt-2">
          {magicIndex ? filtered.length : '…'} item{filtered.length === 1 ? '' : 's'}{' '}
          {itemFiltersAreActive(filters) ? 'match' : 'in the library'}
          {!magicIndex && ' (magic items are still loading)'}
        </p>
      </div>
      <div className="mb-6">
        <ItemFilters items={catalog} filters={filters} onChange={setFilters} />
      </div>
      {visible.length === 0 ? (
        <div className="text-center p-12 bg-theme-secondary rounded-xl border-2 border-dashed border-theme-primary">
          <p className="text-xl font-semibold text-theme-muted">No items found</p>
          <p className="text-theme-disabled">Try a different name, book, or rarity.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map(item => (
            <ItemCard
              key={`${item.kind}:${item.slug}`}
              item={item}
              onView={() => setSelected({ kind: item.kind, slug: item.slug })}
            />
          ))}
        </div>
      )}
      {visible.length < filtered.length && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setPage({ key: filterKey, extra: extra + PAGE })}
            className="px-4 py-2 bg-theme-tertiary text-theme-primary rounded-lg hover:bg-theme-quaternary transition-colors"
          >
            Show {Math.min(PAGE, filtered.length - visible.length)} more
            <span className="text-theme-muted"> ({filtered.length - visible.length} left)</span>
          </button>
        </div>
      )}
      {selected?.kind === 'magic' && (
        <MagicItemDetailModal slug={selected.slug} onClose={() => setSelected(null)} />
      )}
      {selected?.kind === 'gear' && (
        <GearDetail slug={selected.slug} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};
