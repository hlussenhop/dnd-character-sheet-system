import type { Edition, MagicItem } from '../types/dnd';
import { loadChunked } from './contentChunks';

type MagicItemIndex = Omit<MagicItem, 'description'>;

let indexPromise: Promise<MagicItemIndex[]> | null = null;
let indexCache: MagicItemIndex[] | null = null;
const loaded = new Map<string, MagicItem>();

/** The catalog once `loadMagicItemIndex` has resolved. Armor class reads this. */
export const getMagicItemIndexSync = (): MagicItemIndex[] | null => indexCache;

export const setMagicItemIndexCache = (items: MagicItemIndex[] | null): void => {
  indexCache = items;
};

/** The catalog (name, rarity, bonuses) without the book text. */
export const loadMagicItemIndex = (): Promise<MagicItemIndex[]> => {
  indexPromise ??= import('../data/magicItems.json').then(mod => {
    indexCache = mod.default as MagicItemIndex[];
    return indexCache;
  });
  return indexPromise;
};

/** Full items, one source chunk at a time. Omit sources to read every book. */
export const loadMagicItems = async (sources?: string[]): Promise<MagicItem[]> => {
  const items = await loadChunked<MagicItem>('magic-items', sources);
  items.forEach(item => loaded.set(item.slug, item));
  return items;
};

/** A 2024 reprint keeps the unsuffixed slug only when that item was not reprinted. */
export const resolveMagicItemSlug = async (slug: string, edition?: Edition): Promise<string> => {
  if (edition !== '2024') return slug;
  const index = await loadMagicItemIndex();
  return index.some(item => item.slug === `${slug}-2024`) ? `${slug}-2024` : slug;
};

/** One item, including its description. */
export const getMagicItem = async (slug: string): Promise<MagicItem | undefined> => {
  const cached = loaded.get(slug);
  if (cached) return cached;
  const index = await loadMagicItemIndex();
  const hit = index.find(item => item.slug === slug);
  if (!hit) return undefined;
  await loadMagicItems([hit.source]);
  return loaded.get(slug);
};
