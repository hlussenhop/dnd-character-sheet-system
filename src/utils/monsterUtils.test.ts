import { describe, it, expect } from 'vitest';
import { generateMonsterSlug, isCustomMonsterId, getCustomMonsterDbId, formatChallengeRating, monsterShareSlug, pickCatalogSlug } from './monsterUtils';

describe('monsterUtils', () => {
  describe('generateMonsterSlug', () => {
    it('should convert monster name to lowercase slug', () => {
      expect(generateMonsterSlug('Ancient Red Dragon')).toBe('ancient-red-dragon');
    });

    it('should replace spaces with hyphens', () => {
      expect(generateMonsterSlug('Fire Elemental')).toBe('fire-elemental');
    });

    it('should remove special characters', () => {
      expect(generateMonsterSlug('Orc (Warrior)')).toBe('orc-warrior');
    });

    it('should handle multiple spaces and hyphens', () => {
      expect(generateMonsterSlug('  Ancient -- Red -- Dragon  ')).toBe('ancient-red-dragon');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(generateMonsterSlug('-Orc-')).toBe('orc');
    });
  });

  describe('isCustomMonsterId', () => {
    it('should return true for custom monster IDs', () => {
      expect(isCustomMonsterId('custom-123')).toBe(true);
    });

    it('should return false for SRD monster IDs', () => {
      expect(isCustomMonsterId('orc')).toBe(false);
      expect(isCustomMonsterId('ancient-red-dragon')).toBe(false);
    });
  });

  describe('getCustomMonsterDbId', () => {
    it('should extract database ID from custom monster ID', () => {
      expect(getCustomMonsterDbId('custom-123')).toBe('123');
    });

    it('should return original ID if not custom', () => {
      expect(getCustomMonsterDbId('orc')).toBe('orc');
    });
  });
});

const entries = [
  { slug: 'aboleth', name: 'Aboleth', edition: '2014' as const },
  { slug: 'aboleth-2024', name: 'Aboleth', edition: '2024' as const },
  { slug: 'ancient-red-dragon-2024', name: 'Ancient Red Dragon', edition: '2024' as const },
]

describe('monster links', () => {
  it('uses the catalog slug so the two Aboleths do not share a path', () => {
    expect(monsterShareSlug({ index: 'aboleth' })).toBe('aboleth')
    expect(monsterShareSlug({ index: 'aboleth-2024' })).toBe('aboleth-2024')
    expect(monsterShareSlug({ index: 'custom-goblin-1', isCustom: true })).toBe('custom-custom-goblin-1')
  })

  it('opens an old name link on the 2014 creature and an exact 2024 slug on that reprint', () => {
    expect(pickCatalogSlug(entries, 'aboleth')).toBe('aboleth')
    expect(pickCatalogSlug(entries, 'aboleth-2024')).toBe('aboleth-2024')
    expect(pickCatalogSlug(entries, 'ancient-red-dragon')).toBe('ancient-red-dragon-2024')
    expect(pickCatalogSlug(entries, 'missing')).toBeUndefined()
  })
})

describe('formatChallengeRating', () => {
  it('writes the fractional ratings a DM reads on the page', () => {
    expect(formatChallengeRating(0)).toBe('0')
    expect(formatChallengeRating(0.125)).toBe('1/8')
    expect(formatChallengeRating(0.25)).toBe('1/4')
    expect(formatChallengeRating(0.5)).toBe('1/2')
    expect(formatChallengeRating(10)).toBe('10')
  })
})
