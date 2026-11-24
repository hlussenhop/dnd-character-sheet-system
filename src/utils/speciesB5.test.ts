import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS, SPECIES_LANGUAGE_MAP } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { getFeatureDescription } from './featureDescriptions'
import { getEffectiveSpeciesTraits, getVariantPickerOptions, isVariantChoiceRequired } from './speciesVariantUtils'
import { getMissingSpeciesChoices, getSpeciesPickSlots, resolveSpeciesGrants } from './speciesGrantUtils'

const classData = loadClasses().find(c => c.slug === 'fighter') ?? loadClasses()[0]
const background = BACKGROUNDS.find(b => b.edition === '2014') ?? BACKGROUNDS[0]
const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!
const ctx = { edition: '2014' as const, level: 1, walkSpeed: 30 }
const desc = (n: string) => getFeatureDescription(n, '2014')?.description ?? ''

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

const STANDALONE: Record<string, string> = {
  'dwarf-mark-of-warding': 'ERLW', 'elf-mark-of-shadow': 'ERLW', 'gnome-mark-of-scribing': 'ERLW',
  'halfling-mark-of-healing': 'ERLW', 'halfling-mark-of-hospitality': 'ERLW', 'human-mark-of-handling': 'ERLW',
  'human-mark-of-making': 'ERLW', 'human-mark-of-passage': 'ERLW', 'human-mark-of-sentinel': 'ERLW',
  'human-mark-of-finding': 'ERLW', 'half-elf-mark-of-detection': 'ERLW', 'half-elf-mark-of-storm': 'ERLW',
  'half-orc-mark-of-finding': 'ERLW', 'elf-pallid': 'EGW', 'halfling-ghostwise': 'SCAG', 'halfling-lotusden': 'EGW',
  'dragonborn-draconblood': 'EGW', 'dragonborn-ravenite': 'EGW',
}

describe('B5: 2014 variants', () => {
  it('adds the standalone options as expanded 2014 entries from the right books', () => {
    Object.entries(STANDALONE).forEach(([slug, source]) => {
      const s = find(slug)
      expect(s, slug).toBeDefined()
      expect(s.edition).toBe('2014')
      expect(s.source).toBe(source)
      expect(s.core).toBe(false)
      expect(s.expanded).toBe(true)
      expect(SPECIES_LANGUAGE_MAP[slug]?.[0]).toBeDefined()
    })
  })

  it('dragonmarked species keep the parent base traits and add the mark', () => {
    const warding = find('dwarf-mark-of-warding')
    expect(warding.ability_bonuses).toEqual({ CON: 2, INT: 1 })
    expect(warding.species_traits).toEqual(expect.arrayContaining(['Darkvision', 'Dwarven Resilience', "Warder's Intuition", 'Spells of the Mark (Warding)']))
    expect(find('human-mark-of-passage').speed).toBe(35)
    expect(find('human-mark-of-passage').abilityChoice).toEqual({ patterns: [[1]], from: ['STR', 'CON', 'INT', 'WIS', 'CHA'] })
    expect(find('human-mark-of-sentinel').ability_bonuses).toEqual({ CON: 2, WIS: 1 })
    expect(find('half-elf-mark-of-storm').abilityChoice).toBeUndefined()
    expect(find('half-elf-mark-of-detection').species_traits).not.toContain('Skill Versatility')
    expect(find('half-elf-mark-of-detection').ability_bonuses).toEqual({ WIS: 2 })
    expect(desc('Spells of the Mark (Storm)')).toMatch(/Gust of wind/i)
    expect(SPECIES_LANGUAGE_MAP['human-mark-of-finding']).toEqual(['Common', 'Goblin'])
    expect(find('human-mark-of-finding').languageChoices ?? 0).toBe(0)
  })

  it('spells of the mark names are unique per mark (no shared conflicting text)', () => {
    const marks = ['Warding', 'Shadow', 'Scribing', 'Healing', 'Hospitality', 'Handling', 'Making', 'Passage', 'Sentinel', 'Finding', 'Detection', 'Storm']
    const texts = marks.map(m => desc(`Spells of the Mark (${m})`))
    texts.forEach(t => expect(t).not.toBe(''))
    expect(new Set(texts).size).toBe(marks.length)
  })

  it('dragonmark mechanics: Storm resistance, Making tool choice', () => {
    expect(resolveSpeciesGrants(find('half-elf-mark-of-storm'), ctx).resistances).toEqual(['lightning'])
    const slots = getSpeciesPickSlots(find('human-mark-of-making'), '2014')
    expect(slots.map(s => s.kind)).toContain('tool')
  })

  it('EGW dragonborn have breath only: no resistance, ancestry required', () => {
    ;['dragonborn-draconblood', 'dragonborn-ravenite'].forEach(slug => {
      const s = find(slug)
      expect(s.species_traits).not.toContain('Damage Resistance')
      expect(getMissingSpeciesChoices(s, { edition: '2014' })).toHaveLength(1)
      expect(resolveSpeciesGrants(s, { ...ctx, choices: { draconicAncestry: 'red' } }).resistances).toEqual([])
    })
    expect(find('dragonborn-draconblood').ability_bonuses).toEqual({ INT: 2, CHA: 1 })
    expect(find('dragonborn-ravenite').ability_bonuses).toEqual({ STR: 2, CON: 1 })
  })

  it('Pallid elf, Ghostwise and Lotusden halflings add +1 WIS to their parent', () => {
    expect(find('elf-pallid').ability_bonuses).toEqual({ DEX: 2, WIS: 1 })
    expect(find('halfling-ghostwise').ability_bonuses).toEqual({ DEX: 2, WIS: 1 })
    expect(find('halfling-lotusden').ability_bonuses).toEqual({ DEX: 2, WIS: 1 })
    expect(desc('Timberwalk')).toMatch(/difficult terrain/) // quickref markup fixed
    expect(desc('Timberwalk')).not.toMatch(/\b3\b/)
  })

  describe('Tiefling bloodlines and SCAG variants', () => {
    const tiefling = find('tiefling')

    it('offers 13 variants, with the PHB tiefling remaining a standard option', () => {
      expect(tiefling.variants).toHaveLength(13)
      expect(tiefling.variantOptional).toBe(true)
      expect(isVariantChoiceRequired(tiefling, '2014')).toBe(false)
      expect((getVariantPickerOptions(tiefling, '2014') ?? []).length).toBe(13)
    })

    it('a bloodline replaces Infernal Legacy; Asmodeus keeps it', () => {
      expect(getEffectiveSpeciesTraits(tiefling, 'zariel')).toEqual(['Darkvision', 'Hellish Resistance', 'Legacy of Avernus'])
      expect(getEffectiveSpeciesTraits(tiefling, 'asmodeus')).toContain('Infernal Legacy')
      expect(getEffectiveSpeciesTraits(tiefling, undefined)).toContain('Infernal Legacy')
      expect(getEffectiveSpeciesTraits(tiefling, 'infernal-legacy-variant')).toContain('Infernal Legacy')
    })

    it('bloodline ability scores replace the base', () => {
      const ab = (slug: string) => tiefling.variants!.find(v => v.slug === slug)!.ability_bonuses
      expect(ab('zariel')).toEqual({ STR: 1, CHA: 2 })
      expect(ab('dispater')).toEqual({ DEX: 1, CHA: 2 })
      expect(ab('fierna')).toEqual({ WIS: 1, CHA: 2 })
      expect(ab('levistus')).toEqual({ CON: 1, CHA: 2 })
      expect(ab('mammon')).toEqual({ INT: 1, CHA: 2 })
      const hellfire = tiefling.variants!.find(v => v.slug === 'hellfire')!
      expect(hellfire.ability_bonuses).toEqual({ INT: 1 })
      expect(hellfire.abilityChoice).toEqual({ patterns: [[2]], from: ['DEX', 'CHA'] })
    })

    it('Winged gives a 30 ft fly speed and drops Infernal Legacy', () => {
      expect(resolveSpeciesGrants(tiefling, { ...ctx, variantSlug: 'winged' }).movement.fly).toBe(30)
      expect(resolveSpeciesGrants(tiefling, { ...ctx, variantSlug: 'zariel' }).movement.fly).toBeUndefined()
    })

    it('character creation applies the bloodline ability scores and traits', () => {
      const c = create({ speciesSlug: 'tiefling', selectedSpeciesVariant: 'zariel' })
      expect(c.abilities.STR.score).toBe(11)
      expect(c.abilities.CHA.score).toBe(12)
      expect(c.abilities.INT.score).toBe(10)
      const traits = c.featuresAndTraits.speciesTraits ?? []
      expect(traits).toContain('Legacy of Avernus')
      expect(traits).not.toContain('Infernal Legacy')
    })
  })

  describe('SCAG Half-Elf descents', () => {
    const halfElf = find('half-elf')

    it('offers 7 descent options plus the standard Skill Versatility', () => {
      expect(halfElf.variants).toHaveLength(7)
      expect(halfElf.variantOptional).toBe(true)
      expect(getEffectiveSpeciesTraits(halfElf, undefined)).toContain('Skill Versatility')
      expect(getEffectiveSpeciesTraits(halfElf, 'wood-elf-descent-fleet')).not.toContain('Skill Versatility')
      expect(getEffectiveSpeciesTraits(halfElf, 'wood-elf-descent-fleet')).toContain('Fleet of Foot')
    })

    it('Skill Versatility picks are only required with the standard half-elf', () => {
      expect(getSpeciesPickSlots(halfElf, '2014').length).toBeGreaterThan(0)
      expect(getSpeciesPickSlots(halfElf, '2014', 'wood-elf-descent-fleet')).toHaveLength(0)
    })

    it('descent mechanics: swim speed, fleet of foot, elf weapon training', () => {
      expect(resolveSpeciesGrants(halfElf, { ...ctx, variantSlug: 'aquatic-elf-descent-swim' }).movement.swim).toBe(30)
      expect(resolveSpeciesGrants(halfElf, { ...ctx, variantSlug: 'wood-elf-descent-weapons' }).weapons.length).toBeGreaterThan(0)
      const c = create({
        speciesSlug: 'half-elf', selectedSpeciesVariant: 'wood-elf-descent-fleet',
        speciesAbilityChoices: { pattern: [1, 1], bonuses: { DEX: 1, CON: 1 } },
      })
      expect(c.speed).toBe(35)
      expect(c.abilities.CHA.score).toBe(12)
    })

    it('Swimming Speed keeps distinct text per species', () => {
      expect(desc('Swimming Speed (Half-Elf)')).toMatch(/swimming speed of 30/)
      expect(desc('Swimming Speed')).toMatch(/equal to your walking speed/)
    })
  })
})
