import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS, resolveSpeciesSlug } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'

const classData = loadClasses().find(c => c.edition === '2014' || !c.edition) ?? loadClasses()[0]
const background = BACKGROUNDS.find(b => b.edition === '2014') ?? BACKGROUNDS[0]

const create = (overrides: Partial<CharacterCreationData>) =>
  calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition: '2014',
    classSlug: classData.slug,
    abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
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

const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!

describe('B1 species repairs', () => {
  it('Yuan-Ti is the MPMM species; the old Pureblood slug resolves to it', () => {
    const yuanTi = find('yuan-ti')
    expect(yuanTi.name).toBe('Yuan-Ti')
    expect(yuanTi.source).toBe('MPMM')
    expect(resolveSpeciesSlug('yuan-ti-pureblood')).toBe('yuan-ti')
    expect(getAllSpecies().some(s => s.slug === 'yuan-ti-pureblood')).toBe(false)
  })

  it('repaired species are expanded 2014 entries with canonical sources', () => {
    ;['aasimar', 'goliath', 'orc', 'kobold', 'genasi', 'owlin'].forEach(slug => {
      const s = find(slug)
      expect(s.edition).toBe('2014')
      expect(s.core).toBe(false)
      expect(s.expanded).toBe(true)
    })
    expect(find('owlin').source).toBe('SCC')
    expect(find('loxodon').source).toBe('GGR')
    expect(find('goliath').source).toBe('MPMM')
  })

  it('MPMM species use the flexible +2/+1 or +1/+1/+1 choice; Loxodon keeps its fixed bonuses', () => {
    expect(find('goliath').abilityChoice?.patterns).toEqual([[2, 1], [1, 1, 1]])
    expect(find('loxodon').ability_bonuses).toEqual({ CON: 2, WIS: 1 })
    expect(find('loxodon').abilityChoice).toBeUndefined()
  })

  it('Genasi has all four elements, each with its own traits', () => {
    const genasi = find('genasi')
    expect(genasi.variants?.map(v => v.name)).toEqual(['Air Genasi', 'Earth Genasi', 'Fire Genasi', 'Water Genasi'])
    expect(genasi.variants?.every(v => v.species_traits.length >= 2)).toBe(true)
  })

  it('creating an Air Genasi applies the variant speed, traits and chosen ability scores', () => {
    const character = create({
      speciesSlug: 'genasi',
      selectedSpeciesVariant: 'air-genasi',
      speciesAbilityChoices: { pattern: [2, 1], bonuses: { CON: 2, DEX: 1 } },
    })
    expect(character.speed).toBe(35)
    expect(character.abilities.CON.score).toBe(12)
    expect(character.abilities.DEX.score).toBe(11)
    expect(character.featuresAndTraits.speciesTraits).toEqual(
      expect.arrayContaining(['Darkvision', 'Unending Breath', 'Lightning Resistance', 'Mingle with the Wind']),
    )
    expect(character.featuresAndTraits.speciesTraits).not.toContain('Fire Resistance')
  })

  it('a Fire Genasi keeps the base walking speed', () => {
    const character = create({
      speciesSlug: 'genasi',
      selectedSpeciesVariant: 'fire-genasi',
      speciesAbilityChoices: { pattern: [1, 1, 1], bonuses: { CON: 1, INT: 1, CHA: 1 } },
    })
    expect(character.speed).toBe(30)
    expect(character.featuresAndTraits.speciesTraits).toContain('Reach to the Blaze')
  })

  it('Loxodon applies its fixed bonuses without any choice', () => {
    const character = create({ speciesSlug: 'loxodon' })
    expect(character.abilities.CON.score).toBe(12)
    expect(character.abilities.WIS.score).toBe(11)
  })

  it('Aasimar traits reflect the chosen Celestial Revelation', () => {
    const character = create({
      speciesSlug: 'aasimar',
      selectedSpeciesVariant: 'radiant-soul',
      speciesAbilityChoices: { pattern: [2, 1], bonuses: { CHA: 2, WIS: 1 } },
    })
    expect(character.featuresAndTraits.speciesTraits).toContain('Celestial Revelation (Radiant Soul)')
    expect(character.featuresAndTraits.speciesTraits).not.toContain('Celestial Revelation (Necrotic Shroud)')
  })
})
