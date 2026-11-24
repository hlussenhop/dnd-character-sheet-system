import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS, SPECIES_LANGUAGE_MAP } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { getVariantPickerOptions, isVariantChoiceRequired } from './speciesVariantUtils'
import { getFeatureDescription } from './featureDescriptions'

const B2_SLUGS = [
  'aarakocra', 'centaur', 'changeling', 'deep-gnome', 'duergar', 'eladrin', 'githzerai',
  'lizardfolk', 'minotaur', 'satyr', 'sea-elf', 'shadar-kai', 'shifter', 'tortle',
]

const classData = loadClasses().find(c => c.edition === '2014' || !c.edition) ?? loadClasses()[0]
const background = BACKGROUNDS.find(b => b.edition === '2014') ?? BACKGROUNDS[0]
const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!

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

describe('B2: Monsters of the Multiverse species', () => {
  it('adds the 14 standalone species as expanded 2014 entries', () => {
    B2_SLUGS.forEach(slug => {
      const s = find(slug)
      expect(s, slug).toBeDefined()
      expect(s.edition).toBe('2014')
      expect(s.source).toBe('MPMM')
      expect(s.core).toBe(false)
      expect(s.expanded).toBe(true)
      expect(s.abilityChoice?.patterns).toEqual([[2, 1], [1, 1, 1]])
      expect(SPECIES_LANGUAGE_MAP[slug]).toEqual(['Common'])
    })
  })

  it('uses the book walking speeds', () => {
    expect(find('centaur').speed).toBe(40)
    expect(find('satyr').speed).toBe(35)
    expect(find('aarakocra').speed).toBe(30)
  })

  it('Shifter requires one of its four versions', () => {
    const shifter = find('shifter')
    expect((getVariantPickerOptions(shifter, '2014') ?? []).map(v => v.name)).toEqual(['Beasthide', 'Longtooth', 'Swiftstride', 'Wildhunt'])
    expect(isVariantChoiceRequired(shifter, '2014')).toBe(true)
    expect(shifter.species_traits).not.toContain('Shifting')
  })

  it('traits that differ between species keep their own text', () => {
    const desc = (n: string) => getFeatureDescription(n, '2014')?.description ?? ''
    expect(desc('Natural Armor (13 + Dex)')).toMatch(/13/)
    expect(desc('Natural Armor (Shell, AC 17)')).toMatch(/17/)
    expect(desc('Natural Armor')).toMatch(/12/) // Loxodon is untouched
    expect(desc('Hold Breath (15 Minutes)')).toMatch(/15 minutes/)
    expect(desc('Hold Breath (1 Hour)')).toMatch(/1 hour/)
    expect(desc('Fey Ancestry (Charmed Only)')).not.toMatch(/sleep/)
    expect(desc('Trance (4-Hour Rest)')).toMatch(/4 hours/)
  })

  it('book markup is rendered as plain text (no stray chapter numbers)', () => {
    expect(getFeatureDescription('Trance (4-Hour Rest)', '2014')?.description).toMatch(/weapon or a tool of your choice/)
  })

  it('creates a character from a new species and applies the chosen ability bonuses', () => {
    const character = create({
      speciesSlug: 'duergar',
      speciesAbilityChoices: { pattern: [2, 1], bonuses: { CON: 2, STR: 1 } },
    } as Partial<CharacterCreationData>)
    expect(character.abilities.CON.score).toBe(12)
    expect(character.abilities.STR.score).toBe(11)
    expect(character.speed).toBe(30)
  })
})
