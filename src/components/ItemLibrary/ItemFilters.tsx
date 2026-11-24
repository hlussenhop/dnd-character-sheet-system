import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import type { Edition } from '../../types/dnd';
import {
  EMPTY_ITEM_FILTERS,
  itemFiltersAreActive,
  type ItemLibraryFilters,
  type ItemSort,
  type LibraryItem,
} from '../../utils/itemLibrary';
import { monsterSourceLabel } from '../../utils/monsterUtils';

const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
const SORTS: { id: ItemSort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'rarity', label: 'Rarity' },
  { id: 'category', label: 'Category' },
  { id: 'source', label: 'Book' },
];

const chipClass = (active: boolean) =>
  `px-3 py-1 rounded-lg text-sm transition-colors ${
    active ? 'bg-accent-yellow-dark text-white' : 'bg-theme-tertiary text-theme-secondary hover:bg-theme-quaternary'
  }`;

const FilterGroup: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="space-y-2">
    <div>
      <h3 className="text-sm font-bold text-theme-primary">{title}</h3>
      {hint && <p className="text-xs text-theme-muted">{hint}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </section>
);

interface ItemFiltersProps {
  items: LibraryItem[];
  filters: ItemLibraryFilters;
  onChange: (next: ItemLibraryFilters) => void;
}

export const ItemFilters: React.FC<ItemFiltersProps> = ({ items, filters, onChange }) => {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (searchInput === filters.search) return;
    const timer = setTimeout(() => onChange({ ...filters, search: searchInput }), 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters, onChange]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    items.forEach(item => {
      if (filters.kind !== 'all' && item.kind !== filters.kind) return;
      if (filters.edition !== 'all' && item.edition !== filters.edition) return;
      if (item.category) seen.add(item.category);
    });
    return [...seen].sort((left, right) => left.localeCompare(right));
  }, [items, filters.kind, filters.edition]);

  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    items.forEach(item => {
      if (filters.edition !== 'all' && item.edition !== filters.edition) return;
      if (!item.source) return;
      seen.set(item.source, monsterSourceLabel(item.source));
    });
    return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [items, filters.edition]);

  const toggle = (field: 'rarities' | 'categories' | 'sources', value: string) => {
    const current = filters[field];
    const next = current.includes(value) ? current.filter(entry => entry !== value) : [...current, value];
    onChange({ ...filters, [field]: next });
  };

  return (
    <div className="bg-theme-secondary border border-theme-primary rounded-xl p-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            placeholder="Search items"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-theme-primary bg-theme-tertiary text-theme-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          className="px-3 py-2 rounded-lg bg-theme-tertiary text-theme-primary flex items-center gap-1"
        >
          Filters
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {itemFiltersAreActive(filters) && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              onChange(EMPTY_ITEM_FILTERS);
            }}
            className="px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-4">
          <FilterGroup title="Kind" hint="Mundane equipment or magic items">
            {(['all', 'gear', 'magic'] as const).map(kind => (
              <button key={kind} type="button" className={chipClass(filters.kind === kind)} onClick={() => onChange({ ...filters, kind })}>
                {kind === 'all' ? 'All items' : kind === 'gear' ? 'Gear' : 'Magic'}
              </button>
            ))}
          </FilterGroup>
          <FilterGroup title="Edition" hint="The rules printing the item comes from">
            {(['all', '2014', '2024'] as const).map(edition => (
              <button
                key={edition}
                type="button"
                className={chipClass(filters.edition === edition)}
                onClick={() => onChange({ ...filters, edition: edition as 'all' | Edition })}
              >
                {edition === 'all' ? 'Both editions' : edition}
              </button>
            ))}
          </FilterGroup>
          <FilterGroup title="Attunement" hint="Magic items that must be attuned">
            <button
              type="button"
              className={chipClass(filters.attunement)}
              onClick={() => onChange({ ...filters, attunement: !filters.attunement })}
            >
              {filters.attunement ? 'Attunement only' : 'Any attunement'}
            </button>
          </FilterGroup>
          <FilterGroup title="Rarity" hint="Magic items only. Leave all off to include every rarity.">
            {RARITIES.map(rarity => (
              <button key={rarity} type="button" className={chipClass(filters.rarities.includes(rarity))} onClick={() => toggle('rarities', rarity)}>
                <span className="capitalize">{rarity}</span>
              </button>
            ))}
          </FilterGroup>
          <FilterGroup title="Sort">
            {SORTS.map(sort => (
              <button key={sort.id} type="button" className={chipClass(filters.sort === sort.id)} onClick={() => onChange({ ...filters, sort: sort.id })}>
                {sort.label}
              </button>
            ))}
          </FilterGroup>
          <FilterGroup title="Category" hint="Weapon, armor, wondrous item, and the other item types">
            <div className="w-full max-h-28 overflow-y-auto flex flex-wrap gap-2">
              {categories.map(category => (
                <button key={category} type="button" className={chipClass(filters.categories.includes(category))} onClick={() => toggle('categories', category)}>
                  {category}
                </button>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup title="Book" hint="The sourcebook that printed the item">
            <div className="w-full max-h-28 overflow-y-auto flex flex-wrap gap-2">
              {sources.map(([source, label]) => (
                <button key={source} type="button" className={chipClass(filters.sources.includes(source))} onClick={() => toggle('sources', source)}>
                  {label}
                </button>
              ))}
            </div>
          </FilterGroup>
        </div>
      )}
    </div>
  );
};
