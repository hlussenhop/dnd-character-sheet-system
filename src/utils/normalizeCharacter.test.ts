import { describe, expect, it } from 'vitest';
import type { Character } from '../types/dnd';
import { asList, asNumberList, normalizeCharacter } from './normalizeCharacter';

describe('normalizeCharacter', () => {
  it('turns cloud objects that used to be arrays back into arrays', () => {
    expect(asList({})).toEqual([]);
    expect(asList(['elf'])).toEqual(['elf']);
    expect(asList({ 0: 'darkvision', 2: 'fey ancestry' })).toEqual(['darkvision', 'fey ancestry']);
    expect(asNumberList({ 1: 4, 2: 3 })).toEqual([0, 4, 3]);
    expect(asNumberList([0, 2])).toEqual([0, 2]);
  });

  it('keeps a rested character renderable when empty lists come back as objects', () => {
    const character = {
      id: 'c1',
      level: 1,
      optionalFeatures: {},
      eldritchInvocations: {},
      weaponMastery: {},
      featuresAndTraits: {
        personality: '',
        ideals: '',
        bonds: '',
        flaws: '',
        classFeatures: {},
        speciesTraits: {},
        backgroundFeatures: {},
        musicalInstrumentProficiencies: {},
      },
      spellcasting: {
        ability: 'WIS',
        spellSaveDC: 12,
        spellAttackBonus: 4,
        cantripsKnown: {},
        preparedSpells: {},
        spellSlots: { 1: 2 },
        usedSpellSlots: {},
        spellcastingType: 'prepared',
        cantripChoicesByLevel: {},
      },
    } as unknown as Character;

    const normalized = normalizeCharacter(character);
    expect(normalized.optionalFeatures).toEqual([]);
    expect(normalized.featuresAndTraits.speciesTraits).toEqual([]);
    expect(normalized.spellcasting?.cantripsKnown).toEqual([]);
    expect(normalized.spellcasting?.preparedSpells).toEqual([]);
    expect(normalized.spellcasting?.spellSlots).toEqual([0, 2]);
    expect(normalized.spellcasting?.usedSpellSlots).toEqual([]);
    expect(normalized.hitDice).toEqual({ current: 1, max: 1, dieType: 8 });
    expect(normalized.weaponMastery).toEqual([]);
  });
});
