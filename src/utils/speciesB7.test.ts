import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS, SPECIES_LANGUAGE_MAP } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { getFeatureDescription } from './featureDescriptions'
import { getSpeciesPickSlots, resolveSpeciesGrants } from './speciesGrantUtils'

const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!
const ctx = { edition: '2024' as const, level: 1, walkSpeed: 30 }
const desc = (n: string) => getFeatureDescription(n, '2024')?.description ?? ''

const classData = loadClasses('2024').find(c => c.slug.startsWith('fighter')) ?? loadClasses('2024')[0]
const background = BACKGROUNDS.find(b => b.edition === '2024') ?? BACKGROUNDS[0]
const create = (overrides: Partial<CharacterCreationData>) =>
  calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition: '2024',
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

const SLUGS = ['boggart-2024', 'faerie-2024', 'flamekin-2024', 'kithkin-2024', 'lorwyn-changeling-2024', 'rimekin-2024']

describe('B7: Lorwyn First Light species (2024)', () => {
  it('adds six expanded 2024 species from LFL with no species ability bonuses', () => {
    SLUGS.forEach(slug => {
      const s = find(slug)
      expect(s, slug).toBeDefined()
      expect(s).toMatchObject({ edition: '2024', source: 'LFL', core: false, expanded: true, legacy: false, speed: 30 })
      expect(s.ability_bonuses).toEqual({})
      expect(SPECIES_LANGUAGE_MAP[slug]).toEqual(['Common'])
      s.species_traits.forEach(t => expect(desc(t), `${slug}: ${t}`).not.toBe(''))
    })
  })

  it('copy-based species use the traits of the species they copy', () => {
    expect(find('boggart-2024').species_traits).toEqual(['Darkvision', 'Fey Ancestry', 'Fury of the Small', 'Nimble Escape'])
    expect(find('faerie-2024').species_traits).toEqual(['Fairy Magic', 'Flight'])
    expect(find('flamekin-2024').species_traits).toEqual(['Darkvision', 'Fire Resistance', 'Reach to the Blaze'])
    expect(find('kithkin-2024').species_traits).toEqual(['Brave', 'Halfling Nimbleness', 'Luck', 'Naturally Stealthy'])
    expect(find('boggart-2024')).toMatchObject({ size: 'Small', creatureType: 'Humanoid' })
    expect(find('faerie-2024')).toMatchObject({ size: 'Small', creatureType: 'Fey' })
  })

  it('Faerie flies at its walking speed; Boggart, Flamekin and Rimekin have darkvision 60', () => {
    expect(resolveSpeciesGrants(find('faerie-2024'), ctx).movement.fly).toBe(30)
    ;['boggart-2024', 'flamekin-2024', 'rimekin-2024'].forEach(slug =>
      expect(resolveSpeciesGrants(find(slug), ctx).senses.darkvision, slug).toBe(60))
  })

  it('resistances: Flamekin fire, Rimekin cold', () => {
    expect(resolveSpeciesGrants(find('flamekin-2024'), ctx).resistances).toEqual(['fire'])
    expect(resolveSpeciesGrants(find('rimekin-2024'), ctx).resistances).toEqual(['cold'])
  })

  it('Lorwyn Changeling: darkvision 120, a Deception or Performance skill pick', () => {
    const lc = find('lorwyn-changeling-2024')
    expect(lc.creatureType).toBe('Fey')
    expect(resolveSpeciesGrants(lc, ctx).senses.darkvision).toBe(120)
    const slots = getSpeciesPickSlots(lc, '2024')
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ trait: 'Delightful Imitator', count: 1, options: ['Deception', 'Performance'] })
    expect(desc('Shape Self')).toMatch(/four-legged Beast shape/)
    expect(getFeatureDescription('Shape Self', '2014')?.description).not.toMatch(/four-legged Beast/)
  })

  it('Faerie, Kithkin and Elf offer the Lorwyn/Shadowmoor lineage; Shadowmoor gives darkvision 120', () => {
    ;['faerie-2024', 'kithkin-2024', 'elf-2024'].forEach(slug => {
      const s = find(slug)
      expect(Object.keys(s.lineages ?? {})).toEqual(expect.arrayContaining(['Lorwyn', 'Shadowmoor']))
      expect(resolveSpeciesGrants(s, { ...ctx, lineage: 'Shadowmoor' }).senses.darkvision, slug).toBe(120)
    })
    expect(resolveSpeciesGrants(find('faerie-2024'), { ...ctx, lineage: 'Lorwyn' }).senses.darkvision).toBeUndefined()
    expect(resolveSpeciesGrants(find('kithkin-2024'), { ...ctx, lineage: 'Lorwyn' }).senses.darkvision).toBeUndefined()
  })

  it('Elf keeps its existing lineages and adds the two Lorwyn ones', () => {
    const elf = find('elf-2024')
    expect(Object.keys(elf.lineages ?? {})).toEqual(['High Elf', 'Wood Elf', 'Drow', 'Lorwyn', 'Shadowmoor'])
    expect(elf.lineages?.Lorwyn.spells).toEqual(['Thorn Whip', 'Command', 'Silence'])
    expect(elf.lineages?.Shadowmoor.spells).toEqual(['Starry Wisp', 'Heroism', 'Gentle Repose'])
    expect(elf.sources).toContain('LFL')
    expect(resolveSpeciesGrants(elf, { ...ctx, lineage: 'Drow' }).senses.darkvision).toBe(120)
    expect(elf.core).toBe(true)
  })

  it('a Shadowmoor kithkin character gets the lineage trait', () => {
    const c = create({ speciesSlug: 'kithkin-2024', selectedLineage: 'Shadowmoor' })
    expect(c.featuresAndTraits.speciesTraits).toContain('Darkvision (120 ft)')
    const lorwyn = create({ speciesSlug: 'kithkin-2024', selectedLineage: 'Lorwyn' })
    expect(lorwyn.featuresAndTraits.speciesTraits).not.toContain('Darkvision (120 ft)')
  })

  it('the 2014 species of the same base keep their own text', () => {
    expect(getFeatureDescription('Darkvision (120 ft)', '2014')?.description).toMatch(/dim light/)
    expect(find('goblin').species_traits).toContain('Fey Ancestry (Charmed Only)')
  })
})
