import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { findSpeciesBySlug, getAllSpecies, loadClasses, BACKGROUNDS, SPECIES_CATEGORIES } from '../services/dataService'
import { isPlayerSpeciesOffered } from '../data/contentFlags'
import { calculateCharacterStats } from './characterCreationUtils'
import { resolveSpeciesGrants } from './speciesGrantUtils'
import { applyLevelUp, calculateLevelUpData } from './levelUpUtils'

const SLUGS = ['bullywug', 'gnoll', 'grimlock', 'kuo-toa', 'merfolk', 'skeleton', 'troglodyte', 'zombie'] as const

const classData = loadClasses().find(c => c.slug === 'fighter') ?? loadClasses()[0]
const background = BACKGROUNDS.find(b => b.edition === '2014') ?? BACKGROUNDS[0]
const ctx = { edition: '2014' as const, level: 1, walkSpeed: 30 }

const create = (overrides: Partial<CharacterCreationData>) =>
  calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition: '2014',
    classSlug: classData.slug,
    abilities: { STR: 10, DEX: 10, CON: 10, INT: 8, WIS: 10, CHA: 10 },
    abilityScoreMethod: 'custom',
    background: background.slug,
    alignment: 'Neutral',
    selectedSkills: [],
    selectedMusicalInstruments: [],
    equipmentChoices: [],
    hpCalculationMethod: 'max',
    spellSelection: { cantrips: [], spells: [] },
    ...overrides,
  } as unknown as CharacterCreationData)

describe('DMG monstrous player species', () => {
  it('adds the eight species as expanded 2014 DMG options', () => {
    SLUGS.forEach(slug => {
      const species = findSpeciesBySlug(slug)
      expect(species, slug).toMatchObject({
        edition: '2014',
        source: 'DMG',
        core: false,
        expanded: true,
        monstrousOption: true,
      })
      expect(getAllSpecies().some(s => s.slug === slug)).toBe(true)
      expect(SPECIES_CATEGORIES.find(c => c.name.includes('Expanded'))?.species.some(s => s.slug === slug)).toBe(true)
    })
  })

  it('keeps the book ability modifiers, including the two rows with none', () => {
    expect(findSpeciesBySlug('bullywug')?.ability_bonuses).toEqual({ INT: -2, CHA: -2 })
    expect(findSpeciesBySlug('gnoll')?.ability_bonuses).toEqual({ STR: 2, INT: -2 })
    expect(findSpeciesBySlug('grimlock')?.ability_bonuses).toEqual({ STR: 2, CHA: -2 })
    expect(findSpeciesBySlug('kuo-toa')?.ability_bonuses).toEqual({})
    expect(findSpeciesBySlug('merfolk')?.ability_bonuses).toEqual({})
    expect(findSpeciesBySlug('skeleton')?.ability_bonuses).toEqual({ DEX: 2, INT: -4, CHA: -4 })
    expect(findSpeciesBySlug('troglodyte')?.ability_bonuses).toEqual({ STR: 2, CON: 2, INT: -4, CHA: -4 })
    expect(findSpeciesBySlug('zombie')?.ability_bonuses).toEqual({ STR: 1, CON: 2, INT: -6, WIS: -4, CHA: -4 })
  })

  it('hides them when the flag is off and still resolves a saved slug', () => {
    const bullywug = findSpeciesBySlug('bullywug')!
    expect(isPlayerSpeciesOffered(bullywug)).toBe(true)
    expect(isPlayerSpeciesOffered(bullywug, false)).toBe(false)
    expect(isPlayerSpeciesOffered(findSpeciesBySlug('human')!, false)).toBe(true)
    const hidden = getAllSpecies().filter(s => isPlayerSpeciesOffered(s, false))
    expect(hidden.some(s => s.monstrousOption)).toBe(false)
    expect(findSpeciesBySlug('zombie')?.slug).toBe('zombie')
  })

  it('applies the printed speed, swim speed, senses, armor, and immunities', () => {
    const bullywug = create({ speciesSlug: 'bullywug' })
    expect(bullywug.speed).toBe(20)
    expect(bullywug.movement).toEqual({ swim: 40 })
    expect(bullywug.languages).toEqual(expect.arrayContaining(['Common', 'Bullywug']))
    const leveled = applyLevelUp(bullywug, calculateLevelUpData(bullywug)!, { hpGained: 6 })
    expect(leveled.movement?.swim).toBe(40)
    expect(bullywug.abilities.INT.score).toBe(6)
    expect(bullywug.abilities.CHA.score).toBe(8)

    const merfolk = create({ speciesSlug: 'merfolk' })
    expect(merfolk.speed).toBe(10)
    expect(merfolk.movement).toEqual({ swim: 40 })

    expect(resolveSpeciesGrants(findSpeciesBySlug('grimlock'), ctx).senses.blindsight).toBe(30)
    expect(resolveSpeciesGrants(findSpeciesBySlug('kuo-toa'), ctx).senses.darkvision).toBe(120)
    expect(resolveSpeciesGrants(findSpeciesBySlug('troglodyte'), ctx).acBonus).toBe(1)
    expect(resolveSpeciesGrants(findSpeciesBySlug('skeleton'), ctx)).toMatchObject({
      damageImmunities: ['poison'],
      conditionImmunities: ['poisoned', 'exhaustion'],
    })
    expect(resolveSpeciesGrants(findSpeciesBySlug('zombie'), ctx).conditionImmunities).toEqual(['poisoned'])

    const zombie = create({
      speciesSlug: 'zombie',
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 3, WIS: 10, CHA: 10 },
    })
    expect(zombie.abilities.INT.score).toBe(1)
  })
})
