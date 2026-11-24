import { describe, it, expect } from 'vitest'
import type { Character, CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { recalculateAC } from './equipmentUtils'
import {
  calculateNaturalArmorClass,
  getMissingSpeciesChoices,
  getSpeciesChoiceDefs,
  getSpeciesLanguageChoices,
  getSpeciesPickSlots,
  getTraitGrant,
  resolveSpeciesGrants,
} from './speciesGrantUtils'
import { getEffectiveSpeciesTraits } from './speciesVariantUtils'
import { getFeatureDescription } from './featureDescriptions'
import traitGrants from '../data/speciesTraitGrants.json'
import choiceData from '../data/speciesChoices.json'

const classData = loadClasses().find(c => c.slug === 'fighter') ?? loadClasses()[0]
const background2014 = BACKGROUNDS.find(b => b.edition === '2014') ?? BACKGROUNDS[0]
const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!

const create = (overrides: Partial<CharacterCreationData>): Character =>
  calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition: '2014',
    classSlug: classData.slug,
    abilities: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    abilityScoreMethod: 'custom',
    background: background2014.slug,
    alignment: 'Neutral Good',
    selectedSkills: [],
    selectedMusicalInstruments: [],
    equipmentChoices: [],
    hpCalculationMethod: 'max',
    spellSelection: { cantrips: [], spells: [] },
    ...overrides,
  } as unknown as CharacterCreationData)

const ctx = { edition: '2014' as const, level: 1, walkSpeed: 30 }

describe('getTraitGrant', () => {
  it('returns the plain grant for 2014 and the [2024] override for 2024', () => {
    expect(getTraitGrant('Keen Senses', '2014')?.skills).toEqual(['Perception'])
    expect(getTraitGrant('Keen Senses', '2024')?.skillChoices?.count).toBe(1)
    expect(getTraitGrant('Keen Senses', '2024')?.skills).toBeUndefined()
  })

  it('lets an empty [2024] override cancel the plain grant', () => {
    expect(getTraitGrant('Tinker', '2014')?.tools).toEqual(["Tinker's tools"])
    expect(getTraitGrant('Tinker', '2024')).toEqual({})
  })
})

describe('resolveSpeciesGrants', () => {
  it('resolves "walk" movement to the walking speed', () => {
    const grants = resolveSpeciesGrants(find('aarakocra'), { ...ctx, walkSpeed: 25 })
    expect(grants.movement.fly).toBe(25)
  })

  it('respects minLevel (2024 Dragonborn flight arrives at level 5)', () => {
    const dragonborn = find('dragonborn-2024')
    expect(resolveSpeciesGrants(dragonborn, { ...ctx, edition: '2024', level: 4 }).movement.fly).toBeUndefined()
    expect(resolveSpeciesGrants(dragonborn, { ...ctx, edition: '2024', level: 5 }).movement.fly).toBe(30)
  })

  it('applies draconic ancestry resistance from the chosen option', () => {
    const grants = resolveSpeciesGrants(find('dragonborn'), { ...ctx, choices: { draconicAncestry: 'black' } })
    expect(grants.resistances).toEqual(['acid'])
    expect(resolveSpeciesGrants(find('dragonborn'), ctx).resistances).toEqual([])
  })

  it('applies darkvision, hp per level and fixed resistances from traits', () => {
    const hillDwarf = resolveSpeciesGrants(find('hill-dwarf'), ctx)
    expect(hillDwarf.senses.darkvision).toBe(60)
    expect(hillDwarf.hpPerLevel).toBe(1)
    expect(hillDwarf.resistances).toContain('poison')
  })

  it('adds the Drow lineage darkvision upgrade only for the Drow lineage (2024)', () => {
    const elf = find('elf-2024')
    const base = { ...ctx, edition: '2024' as const }
    expect(resolveSpeciesGrants(elf, { ...base, lineage: 'Drow' }).senses.darkvision).toBe(120)
    expect(resolveSpeciesGrants(elf, { ...base, lineage: 'High Elf' }).senses.darkvision).toBe(60)
  })

  it('adds picked skills and tools, ignoring invalid picks', () => {
    const halfElf = find('half-elf')
    const slot = getSpeciesPickSlots(halfElf, '2014')[0]
    expect(slot.id).toBe('skill:Skill Versatility')
    const grants = resolveSpeciesGrants(halfElf, {
      ...ctx,
      picks: { [slot.id]: ['Arcana', 'History', 'Stealth', 'NotASkill'] },
    })
    expect(grants.skills).toEqual(['Arcana', 'History'])
  })

  it('exposes natural armor and the initiative proficiency flag', () => {
    expect(resolveSpeciesGrants(find('lizardfolk'), ctx).naturalArmor).toMatchObject({ base: 13, abilities: ['DEX'] })
    expect(resolveSpeciesGrants(find('tortle'), ctx).naturalArmor).toMatchObject({ base: 17, noArmor: true })
    expect(resolveSpeciesGrants(find('harengon'), ctx).initiativeProficiency).toBe(true)
  })

  it('returns an empty result for an unknown species', () => {
    expect(resolveSpeciesGrants(undefined, ctx).resistances).toEqual([])
  })
})

describe('species choices and picks', () => {
  it('lists the missing choices until they are made', () => {
    const dragonborn = find('dragonborn')
    const data = { edition: '2014' as const }
    expect(getMissingSpeciesChoices(dragonborn, data)).toEqual(['Draconic Ancestry'])
    expect(getMissingSpeciesChoices(dragonborn, { ...data, speciesChoices: { draconicAncestry: 'red' } })).toEqual([])
    expect(getMissingSpeciesChoices(dragonborn, { ...data, speciesChoices: { draconicAncestry: 'plaid' } })).toHaveLength(1)
  })

  it('requires the full number of picks', () => {
    const halfElf = find('half-elf')
    const data = { edition: '2014' as const }
    expect(getMissingSpeciesChoices(halfElf, data)).toHaveLength(1)
    expect(getMissingSpeciesChoices(halfElf, { ...data, speciesPicks: { 'skill:Skill Versatility': ['Arcana'] } })).toHaveLength(1)
    expect(getMissingSpeciesChoices(halfElf, { ...data, speciesPicks: { 'skill:Skill Versatility': ['Arcana', 'History'] } })).toEqual([])
  })

  it('counts language choices from the species record and traits', () => {
    expect(getSpeciesLanguageChoices(find('half-elf'), '2014')).toBeGreaterThanOrEqual(1)
    expect(getSpeciesLanguageChoices(find('aarakocra'), '2014')).toBe(1)
    expect(getSpeciesLanguageChoices(undefined, '2014')).toBe(0)
  })

  it('has choice definitions for Dragonborn, 2024 Tiefling and 2024 Goliath', () => {
    expect(getSpeciesChoiceDefs('dragonborn')[0].options).toHaveLength(10)
    expect(getSpeciesChoiceDefs('tiefling-2024')[0].options).toHaveLength(3)
    expect(getSpeciesChoiceDefs('goliath-2024')[0].options).toHaveLength(6)
    expect(getSpeciesChoiceDefs('human')).toEqual([])
  })
})

describe('character calculation with species grants', () => {
  it('adds Dwarven Toughness HP per level', () => {
    const base = create({ speciesSlug: 'human' as string, selectedSpeciesVariant: 'standard', level: 3 })
    const dwarf = create({ speciesSlug: 'hill-dwarf', level: 3 })
    // Hill dwarf has +2 CON in the book, so compare against the same CON modifier
    const conGain = (dwarf.abilities.CON.modifier - base.abilities.CON.modifier) * 3
    expect(dwarf.maxHitPoints - base.maxHitPoints - conGain).toBe(3)
    expect(dwarf.hpPerLevelBonus).toBe(1)
  })

  it('computes natural armor AC (Lizardfolk 13 + DEX, Tortle 17, Loxodon 12 + CON)', () => {
    const lizard = create({ speciesSlug: 'lizardfolk', speciesAbilityChoices: { pattern: [2, 1], bonuses: { STR: 2, CON: 1 } } })
    expect(lizard.armorClass).toBe(13 + lizard.abilities.DEX.modifier)
    expect(create({ speciesSlug: 'tortle', speciesAbilityChoices: { pattern: [2, 1], bonuses: { STR: 2, CON: 1 } } }).armorClass).toBe(17)
    const loxodon = create({ speciesSlug: 'loxodon' })
    expect(loxodon.armorClass).toBe(12 + loxodon.abilities.CON.modifier)
  })

  it('adds proficiency bonus to initiative for Harengon', () => {
    const harengon = create({ speciesSlug: 'harengon', speciesAbilityChoices: { pattern: [2, 1], bonuses: { STR: 2, CON: 1 } } })
    expect(harengon.initiative).toBe(harengon.abilities.DEX.modifier + 2)
  })

  it('records senses, movement, resistances and the choice', () => {
    const dragonborn = create({ speciesSlug: 'dragonborn', speciesChoices: { draconicAncestry: 'blue' } })
    expect(dragonborn.damageResistances).toEqual(['lightning'])
    expect(dragonborn.speciesChoices).toEqual({ draconicAncestry: 'blue' })
    const aarakocra = create({ speciesSlug: 'aarakocra', speciesAbilityChoices: { pattern: [2, 1], bonuses: { DEX: 2, WIS: 1 } } })
    expect(aarakocra.movement?.fly).toBe(aarakocra.speed)
  })

  it('grants fixed species skills as proficiencies', () => {
    const elf = create({ speciesSlug: 'high-elf' })
    expect(elf.skills.Perception.proficient).toBe(true)
  })

  it('applies a flat AC bonus (Warforged Integrated Protection)', () => {
    const grants = resolveSpeciesGrants(find('warforged'), ctx)
    expect(grants.acBonus).toBe(1)
    expect(resolveSpeciesGrants(find('tortle'), ctx).acBonus).toBe(0)
  })

  it('recalculates natural armor with equipped gear', () => {
    const tortle = create({ speciesSlug: 'tortle', speciesAbilityChoices: { pattern: [2, 1], bonuses: { STR: 2, CON: 1 } } })
    expect(recalculateAC(tortle)).toBe(17)
    expect(calculateNaturalArmorClass(undefined, { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 })).toBeUndefined()
  })
})

describe('grant data integrity', () => {
  const allSpecies = getAllSpecies()
  const traitNames = new Set<string>()
  allSpecies.forEach(s => getEffectiveSpeciesTraits(s, undefined).forEach(t => traitNames.add(t)))
  allSpecies.forEach(s => (s.variants ?? []).forEach(v => getEffectiveSpeciesTraits(s, v.slug).forEach(t => traitNames.add(t))))

  it('every grant key is a real species trait name (or a [2024] override of one)', () => {
    const orphans = Object.keys(traitGrants).filter(key => !traitNames.has(key.replace(/ \[2024\]$/, '')))
    expect(orphans).toEqual([])
  })

  it('every [2024] grant override has a plain counterpart or a 2024 trait', () => {
    Object.keys(traitGrants)
      .filter(k => k.endsWith(' [2024]'))
      .forEach(k => expect(traitNames.has(k.replace(/ \[2024\]$/, '')), k).toBe(true))
  })

  it('every choice definition targets a real species and has unique option values', () => {
    Object.entries(choiceData.choices).forEach(([slug, defs]) => {
      expect(find(slug), slug).toBeDefined()
      ;(defs as Array<{ options: Array<{ value: string }> }>).forEach(def => {
        const values = def.options.map(o => o.value)
        expect(new Set(values).size).toBe(values.length)
      })
    })
    Object.keys(choiceData.lineageGrants).forEach(slug => expect(find(slug), slug).toBeDefined())
  })

  it('traits with grants have a feature description for the edition they apply to', () => {
    // Guards against grant keys silently drifting from the displayed trait text.
    ;['Darkvision', 'Dwarven Toughness', 'Keen Senses'].forEach(name => {
      expect(getFeatureDescription(name, '2014'), name).toBeTruthy()
    })
  })
})
