import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS, SPECIES_LANGUAGE_MAP } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { recalculateAC } from './equipmentUtils'
import { calculateFeatAvailability } from './featUtils'
import { getFeatureDescription } from './featureDescriptions'
import { getVariantPickerOptions, isVariantChoiceRequired } from './speciesVariantUtils'
import { getMissingSpeciesChoices, getSpeciesChoiceDefs, getSpeciesPickSlots, resolveSpeciesGrants } from './speciesGrantUtils'

const classData = loadClasses().find(c => c.slug === 'fighter') ?? loadClasses()[0]
const background = BACKGROUNDS.find(b => b.edition === '2014') ?? BACKGROUNDS[0]
const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!
const ctx = { edition: '2014' as const, level: 1, walkSpeed: 30 }

const create = (overrides: Partial<CharacterCreationData>) =>
  calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition: '2014',
    classSlug: classData.slug,
    abilities: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    abilityScoreMethod: 'custom',
    background: background.slug,
    alignment: 'Neutral Good',
    selectedSkills: [],
    selectedMusicalInstruments: [],
    equipmentChoices: [],
    hpCalculationMethod: 'max',
    spellSelection: { cantrips: [], spells: [] },
    ...overrides,
  } as unknown as CharacterCreationData)

const FTD = { 'dragonborn-chromatic': 5, 'dragonborn-gem': 5, 'dragonborn-metallic': 5 } as const

describe('B4: ERLW, TCE and FTD species', () => {
  it('adds the six species as expanded 2014 entries from the right books', () => {
    const books: Record<string, string> = {
      kalashtar: 'ERLW', warforged: 'ERLW', 'custom-lineage': 'TCE',
      'dragonborn-chromatic': 'FTD', 'dragonborn-gem': 'FTD', 'dragonborn-metallic': 'FTD',
    }
    Object.entries(books).forEach(([slug, source]) => {
      const s = find(slug)
      expect(s, slug).toBeDefined()
      expect(s.edition).toBe('2014')
      expect(s.source).toBe(source)
      expect(s.core).toBe(false)
      expect(s.expanded).toBe(true)
      expect(SPECIES_LANGUAGE_MAP[slug]?.[0]).toBe('Common')
    })
  })

  it('ability scores: printed (Kalashtar), fixed + choice (Warforged), +2 choice (Custom), flexible (FTD)', () => {
    expect(find('kalashtar').ability_bonuses).toEqual({ WIS: 2, CHA: 1 })
    const warforged = find('warforged')
    expect(warforged.ability_bonuses).toEqual({ CON: 2 })
    expect(warforged.abilityChoice).toEqual({ patterns: [[1]], from: ['STR', 'DEX', 'INT', 'WIS', 'CHA'] })
    expect(find('custom-lineage').ability_bonuses).toEqual({})
    expect(find('custom-lineage').abilityChoice).toEqual({ patterns: [[2]] })
    Object.keys(FTD).forEach(slug => {
      expect(find(slug).abilityChoice?.patterns).toEqual([[2, 1], [1, 1, 1]])
    })
  })

  it('same-name traits that differ keep their own text', () => {
    const desc = (n: string) => getFeatureDescription(n, '2014')?.description ?? ''
    expect(desc('Breath Weapon (Chromatic)')).toMatch(/30-foot line/)
    expect(desc('Breath Weapon (Gem)')).toMatch(/15-foot cone/)
    expect(desc('Breath Weapon')).toMatch(/Draconic Ancestry|dragon/i) // PHB dragonborn is untouched
    expect(desc("Sentry's Rest (Warforged)")).toMatch(/six hours/)
    expect(desc('Specialized Design')).toMatch(/two tool/i) // Autognome
    expect(desc('Specialized Design (Skill and Tool)')).toMatch(/skill proficiency and one tool/)
  })

  it('each FTD dragonborn requires an ancestry and grants the matching resistance', () => {
    const tables: Record<string, Array<[string, string]>> = {
      'dragonborn-chromatic': [['black', 'acid'], ['blue', 'lightning'], ['green', 'poison'], ['red', 'fire'], ['white', 'cold']],
      'dragonborn-gem': [['amethyst', 'force'], ['crystal', 'radiant'], ['emerald', 'psychic'], ['sapphire', 'thunder'], ['topaz', 'necrotic']],
      'dragonborn-metallic': [['brass', 'fire'], ['bronze', 'lightning'], ['copper', 'acid'], ['gold', 'fire'], ['silver', 'cold']],
    }
    Object.entries(tables).forEach(([slug, rows]) => {
      const species = find(slug)
      expect(getSpeciesChoiceDefs(slug)[0].options).toHaveLength(FTD[slug as keyof typeof FTD])
      expect(getMissingSpeciesChoices(species, { edition: '2014' })).toHaveLength(1)
      rows.forEach(([value, damage]) => {
        expect(resolveSpeciesGrants(species, { ...ctx, choices: { ancestry: value } }).resistances).toEqual([damage])
      })
    })
  })

  it('Gem Flight gives a fly speed from level 5', () => {
    const gem = find('dragonborn-gem')
    expect(resolveSpeciesGrants(gem, { ...ctx, level: 4 }).movement.fly).toBeUndefined()
    expect(resolveSpeciesGrants(gem, { ...ctx, level: 5 }).movement.fly).toBe(30)
    expect(resolveSpeciesGrants(find('dragonborn-metallic'), { ...ctx, level: 5 }).movement.fly).toBeUndefined()
  })

  it('Kalashtar has psychic resistance; Warforged resists poison, is immune to disease and gets +1 AC', () => {
    expect(resolveSpeciesGrants(find('kalashtar'), ctx).resistances).toEqual(['psychic'])
    const warforged = resolveSpeciesGrants(find('warforged'), ctx)
    expect(warforged).toMatchObject({ resistances: ['poison'], conditionImmunities: ['disease'], acBonus: 1 })
    expect(getSpeciesPickSlots(find('warforged'), '2014').map(s => [s.kind, s.count])).toEqual([['skill', 1], ['tool', 1]])
  })

  it('Warforged character: +1 AC on top of unarmored AC, kept by recalculateAC', () => {
    const warforged = create({
      speciesSlug: 'warforged',
      speciesAbilityChoices: { pattern: [1], bonuses: { STR: 1 } },
    })
    expect(warforged.abilities.CON.score).toBe(16)
    expect(warforged.armorClass).toBe(10 + warforged.abilities.DEX.modifier + 1)
    expect(warforged.acBonus).toBe(1)
    expect(recalculateAC(warforged)).toBe(warforged.armorClass)
  })

  it('Custom Lineage requires the variable trait, grants a +2 and a level 1 feat slot', () => {
    const custom = find('custom-lineage')
    expect((getVariantPickerOptions(custom, '2014') ?? []).map(v => v.name)).toEqual(['Darkvision', 'Skill Proficiency'])
    expect(isVariantChoiceRequired(custom, '2014')).toBe(true)
    expect(calculateFeatAvailability(1, '2014', 'custom-lineage')).toBe(1)
    expect(calculateFeatAvailability(1, '2014', 'human')).toBe(0)
    expect(calculateFeatAvailability(5, '2014', 'custom-lineage')).toBe(2)
    expect(calculateFeatAvailability(1, '2024', 'custom-lineage')).toBe(0)
  })

  it('Custom Lineage variants: darkvision, or a chosen skill', () => {
    const custom = find('custom-lineage')
    expect(resolveSpeciesGrants(custom, { ...ctx, variantSlug: 'darkvision' }).senses.darkvision).toBe(60)
    const skillSlot = getSpeciesPickSlots(custom, '2014', 'skill-proficiency')
    expect(skillSlot).toHaveLength(1)
    expect(getSpeciesPickSlots(custom, '2014', 'darkvision')).toHaveLength(0)
    const character = create({
      speciesSlug: 'custom-lineage',
      selectedSpeciesVariant: 'skill-proficiency',
      speciesAbilityChoices: { pattern: [2], bonuses: { DEX: 2 } },
      speciesPicks: { [skillSlot[0].id]: ['Stealth'] },
      selectedFeats: ['alert'],
    })
    expect(character.abilities.DEX.score).toBe(16)
    expect(character.skills.Stealth.proficient).toBe(true)
    expect(character.selectedFeats).toContain('alert')
  })
})
