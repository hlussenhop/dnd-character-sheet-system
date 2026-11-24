import { describe, it, expect } from 'vitest';
import { filterAppSpells, SpellFilterState } from './spellbookAdapter';
import { AppSpell } from '../services/dataService';

const mockSpells: AppSpell[] = [
  {
    slug: 'fireball',
    name: 'Fireball',
    level: 3,
    school: 'Evocation',
    castingTime: '1 action',
    range: '150 feet',
    components: { verbal: true, somatic: true, material: true },
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    description: 'A bright streak flashes from your pointing finger...',
    classes: ['wizard', 'sorcerer'],
    source: '2024',
    year: 2024,
    book: 'XPHB',
    damageType: 'Fire',
  },
  {
    slug: 'shield',
    name: 'Shield',
    level: 1,
    school: 'Abjuration',
    castingTime: '1 reaction',
    range: 'Self',
    components: { verbal: true, somatic: true, material: false },
    duration: '1 round',
    concentration: false,
    ritual: false,
    description: 'An invisible barrier of magical force appears...',
    classes: ['wizard', 'sorcerer'],
    source: '2014',
    year: 2014,
  },
  {
    slug: 'detect-magic',
    name: 'Detect Magic',
    level: 1,
    school: 'Divination',
    castingTime: '1 action',
    range: 'Self',
    components: { verbal: true, somatic: true, material: false },
    duration: 'Concentration, up to 10 minutes',
    concentration: true,
    ritual: true,
    description: 'For the duration, you sense the presence of magic...',
    classes: ['wizard', 'cleric', 'druid'],
    source: '2024',
    year: 2024,
  },
];

describe('spellbookAdapter filterAppSpells', () => {
  const baseFilters: SpellFilterState = {
    searchTerm: '',
    editionFilter: 'all',
    selectedLevels: [],
    selectedSchools: [],
    selectedClasses: [],
    selectedBooks: [],
    casting: [],
    sort: 'name',
    filterRitual: false,
    filterConcentration: false,
    filterFavorites: false,
    favoriteSlugs: [],
  };

  it('returns all spells when no filters are applied', () => {
    const result = filterAppSpells(mockSpells, baseFilters);
    expect(result).toHaveLength(3);
  });

  it('filters by search term', () => {
    const result = filterAppSpells(mockSpells, { ...baseFilters, searchTerm: 'fire' });
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('fireball');
  });

  it('filters by level', () => {
    const result = filterAppSpells(mockSpells, { ...baseFilters, selectedLevels: [1] });
    expect(result).toHaveLength(2);
  });

  it('filters by ritual flag', () => {
    const result = filterAppSpells(mockSpells, { ...baseFilters, filterRitual: true });
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('detect-magic');
  });

  it('filters by concentration flag', () => {
    const result = filterAppSpells(mockSpells, { ...baseFilters, filterConcentration: true });
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('detect-magic');
  });

  it('filters by edition source', () => {
    const result2014 = filterAppSpells(mockSpells, { ...baseFilters, editionFilter: '2014' });
    expect(result2014).toHaveLength(1);
    expect(result2014[0].slug).toBe('shield');
  });

  it('matches every search word against name, class, school, or book', () => {
    const found = filterAppSpells(mockSpells, { ...baseFilters, searchTerm: 'wizard fire' });
    expect(found.map(spell => spell.slug)).toEqual(['fireball']);
    expect(filterAppSpells(mockSpells, { ...baseFilters, searchTerm: 'cleric fire' })).toEqual([]);
  });

  it('filters by class, book, and casting time, then sorts by level', () => {
    const cleric = filterAppSpells(mockSpells, { ...baseFilters, selectedClasses: ['cleric'] });
    expect(cleric.map(spell => spell.slug)).toEqual(['detect-magic']);

    const book = filterAppSpells(mockSpells, { ...baseFilters, selectedBooks: ['XPHB'] });
    expect(book.map(spell => spell.slug)).toEqual(['fireball']);

    const reactions = filterAppSpells(mockSpells, { ...baseFilters, casting: ['reaction'] });
    expect(reactions.map(spell => spell.slug)).toEqual(['shield']);

    const ranked = filterAppSpells(mockSpells, { ...baseFilters, sort: 'level-desc' });
    expect(ranked.map(spell => spell.slug)).toEqual(['fireball', 'detect-magic', 'shield']);
  });
});
