import { describe, expect, it } from 'vitest';
import { EMPTY_ITEM_FILTERS, filterLibraryItems, type LibraryItem } from './itemLibrary';

const items: LibraryItem[] = [
  { slug: 'dagger', kind: 'gear', name: 'Dagger', edition: '2014', source: 'PHB', category: 'Weapon', rarity: '', attunement: false, summary: '2 gp' },
  { slug: 'dagger-2024', kind: 'gear', name: 'Dagger', edition: '2024', source: 'XPHB', category: 'Weapon', rarity: '', attunement: false, summary: '2 gp' },
  { slug: 'bag-of-holding', kind: 'magic', name: 'Bag of Holding', edition: '2014', source: 'DMG', category: 'Wondrous item', rarity: 'uncommon', attunement: false, summary: 'uncommon' },
  { slug: 'staff-of-power', kind: 'magic', name: 'Staff of Power', edition: '2014', source: 'DMG', category: 'Staff', rarity: 'very rare', attunement: true, summary: 'very rare' },
];

describe('filterLibraryItems', () => {
  it('filters by kind, edition, rarity, and search', () => {
    expect(filterLibraryItems(items, { ...EMPTY_ITEM_FILTERS, kind: 'magic' }).map(item => item.slug))
      .toEqual(['bag-of-holding', 'staff-of-power']);
    expect(filterLibraryItems(items, { ...EMPTY_ITEM_FILTERS, edition: '2024' }).map(item => item.slug))
      .toEqual(['dagger-2024']);
    expect(filterLibraryItems(items, { ...EMPTY_ITEM_FILTERS, rarities: ['very rare'], attunement: true }).map(item => item.slug))
      .toEqual(['staff-of-power']);
    expect(filterLibraryItems(items, { ...EMPTY_ITEM_FILTERS, search: 'bag' }).map(item => item.slug))
      .toEqual(['bag-of-holding']);
  });

  it('sorts magic items by rarity and leaves gear after them', () => {
    const sorted = filterLibraryItems(items, { ...EMPTY_ITEM_FILTERS, sort: 'rarity' });
    expect(sorted.map(item => item.slug)).toEqual(['bag-of-holding', 'staff-of-power', 'dagger', 'dagger-2024']);
  });
});
