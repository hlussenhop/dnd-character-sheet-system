import type { Edition, Equipment, MagicItem } from '../types/dnd';

export type ItemKind = 'gear' | 'magic';
export type ItemSort = 'name' | 'rarity' | 'category' | 'source';

export interface LibraryItem {
  slug: string;
  kind: ItemKind;
  name: string;
  edition: Edition;
  source: string;
  category: string;
  rarity: string;
  attunement: boolean;
  summary: string;
}

export interface ItemLibraryFilters {
  search: string;
  kind: 'all' | ItemKind;
  edition: 'all' | Edition;
  rarities: string[];
  categories: string[];
  sources: string[];
  attunement: boolean;
  sort: ItemSort;
}

export const EMPTY_ITEM_FILTERS: ItemLibraryFilters = {
  search: '',
  kind: 'all',
  edition: 'all',
  rarities: [],
  categories: [],
  sources: [],
  attunement: false,
  sort: 'name',
};

const RARITY_RANK: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  'very rare': 4,
  legendary: 5,
  artifact: 6,
};

export const itemKey = (item: Pick<LibraryItem, 'kind' | 'slug'>): string => `${item.kind}:${item.slug}`;

export const itemFiltersAreActive = (filters: ItemLibraryFilters): boolean =>
  Boolean(
    filters.search
    || filters.kind !== 'all'
    || filters.edition !== 'all'
    || filters.rarities.length
    || filters.categories.length
    || filters.sources.length
    || filters.attunement
    || filters.sort !== 'name',
  );

type StoredGear = Equipment & { source?: string };

export const gearLibraryItems = (gear: StoredGear[]): LibraryItem[] =>
  gear.map(item => ({
    slug: item.slug,
    kind: 'gear',
    name: item.name,
    edition: item.year === 2024 ? '2024' : '2014',
    source: item.source || 'PHB',
    category: item.equipment_category,
    rarity: '',
    attunement: false,
    summary: item.cost ? `${item.cost.quantity} ${item.cost.unit}` : item.equipment_category,
  }));

export const magicLibraryItems = (items: Array<Omit<MagicItem, 'description'>>): LibraryItem[] =>
  items.map(item => ({
    slug: item.slug,
    kind: 'magic',
    name: item.name,
    edition: item.edition,
    source: item.source,
    category: item.itemType,
    rarity: item.rarity,
    attunement: item.attunement,
    summary: item.rarity,
  }));

const rarityRank = (item: LibraryItem): number => RARITY_RANK[item.rarity.toLowerCase()] ?? 99;

export const filterLibraryItems = (items: LibraryItem[], filters: ItemLibraryFilters): LibraryItem[] => {
  const query = filters.search.trim().toLowerCase();
  const filtered = items.filter(item => {
    if (filters.kind !== 'all' && item.kind !== filters.kind) return false;
    if (filters.edition !== 'all' && item.edition !== filters.edition) return false;
    if (filters.attunement && !item.attunement) return false;
    if (filters.rarities.length && !filters.rarities.includes(item.rarity.toLowerCase())) return false;
    if (filters.categories.length && !filters.categories.includes(item.category)) return false;
    if (filters.sources.length && !filters.sources.includes(item.source)) return false;
    if (!query) return true;
    return `${item.name} ${item.category} ${item.rarity} ${item.source}`.toLowerCase().includes(query);
  });

  const sorted = [...filtered];
  sorted.sort((left, right) => {
    if (filters.sort === 'rarity') {
      const byRarity = rarityRank(left) - rarityRank(right);
      if (byRarity !== 0) return byRarity;
    } else if (filters.sort === 'category') {
      const byCategory = left.category.localeCompare(right.category);
      if (byCategory !== 0) return byCategory;
    } else if (filters.sort === 'source') {
      const bySource = left.source.localeCompare(right.source);
      if (bySource !== 0) return bySource;
    }
    return left.name.localeCompare(right.name);
  });
  return sorted;
};
