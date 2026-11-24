import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS, SPECIES_LANGUAGE_MAP } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { getFeatureDescription } from './featureDescriptions'
import { getMissingSpeciesChoices, getSpeciesChoiceDefs, getSpeciesPickSlots, resolveSpeciesGrants } from './speciesGrantUtils'

const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!
const ctx = { edition: '2024' as const, level: 1, walkSpeed: 30 }
const desc = (n: string, e: '2014' | '2024' = '2024') => getFeatureDescription(n, e)?.description ?? ''

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

const SLUGS: Record<string, string> = {
  'changeling-2024': 'EFA', 'kalashtar-2024': 'EFA', 'khoravar-2024': 'EFA', 'shifter-2024': 'EFA', 'warforged-2024': 'EFA',
  'dhampir-2024': 'RHW', 'hexblood-2024': 'RHW', 'lupin-2024': 'RHW', 'reborn-2024': 'RHW',
}

describe('B6: 2024 EFA and RHW species', () => {
  it('adds nine expanded 2024 species with no species ability bonuses', () => {
    Object.entries(SLUGS).forEach(([slug, source]) => {
      const s = find(slug)
      expect(s, slug).toBeDefined()
      expect(s.edition).toBe('2024')
      expect(s.source).toBe(source)
      expect(s.core).toBe(false)
      expect(s.expanded).toBe(true)
      expect(s.legacy).toBe(false)
      expect(s.ability_bonuses).toEqual({})
      expect(s.abilityChoice).toBeUndefined()
      expect(SPECIES_LANGUAGE_MAP[slug]).toEqual(['Common'])
    })
  })

  it('keeps the 2014 versions separate and untouched', () => {
    expect(find('kalashtar').edition).toBe('2014')
    expect(find('kalashtar').ability_bonuses).toEqual({ WIS: 2, CHA: 1 })
    expect(find('warforged').ability_bonuses).toEqual({ CON: 2 })
    expect(desc('Mental Discipline', '2014')).toMatch(/charmed and frightened/)
    expect(desc('Mental Discipline', '2024')).toBe('You have Resistance to Psychic damage.')
    expect(desc('Skill Versatility', '2014')).toMatch(/two skills/)
    expect(desc('Skill Versatility', '2024')).toMatch(/one skill or with one tool/)
    expect(resolveSpeciesGrants(find('kalashtar'), { ...ctx, edition: '2014' }).resistances).toEqual(['psychic'])
  })

  it('creature type, size and speed come from the book', () => {
    expect(find('changeling-2024')).toMatchObject({ creatureType: 'Fey', size: 'Medium or Small', speed: 30 })
    expect(find('kalashtar-2024')).toMatchObject({ creatureType: 'Aberration', size: 'Medium' })
    expect(find('warforged-2024').creatureType).toBe('Construct')
    expect(find('hexblood-2024').creatureType).toBe('Fey')
    expect(find('dhampir-2024').speed).toBe(35)
  })

  it('Changeling and Lupin ask for skills from the book lists', () => {
    const changeling = getSpeciesPickSlots(find('changeling-2024'), '2024')
    expect(changeling).toHaveLength(1)
    expect(changeling[0]).toMatchObject({ count: 2, options: ['Deception', 'Insight', 'Intimidation', 'Performance', 'Persuasion'] })
    const lupin = getSpeciesPickSlots(find('lupin-2024'), '2024')
    expect(lupin[0]).toMatchObject({ count: 1, options: ['Perception', 'Stealth', 'Survival'] })
    expect(getSpeciesPickSlots(find('shifter-2024'), '2024')[0].options).toEqual(['Acrobatics', 'Athletics', 'Intimidation', 'Survival'])
  })

  it('2024 Kalashtar, Khoravar and Reborn use the 2024 skill rules, not the 2014 two-skill grant', () => {
    expect(getSpeciesPickSlots(find('khoravar-2024'), '2024').map(s => [s.trait, s.count])).toEqual([['Skill Versatility', 1]])
    expect(getSpeciesPickSlots(find('kalashtar-2024'), '2024').map(s => [s.trait, s.count])).toEqual([['Severed from Dreams', 1]])
    expect(getSpeciesPickSlots(find('reborn-2024'), '2024').map(s => [s.trait, s.count])).toEqual([['Knowledge from a Past Life', 1]])
  })

  it('resistances: Kalashtar psychic, Warforged poison, Dhampir necrotic', () => {
    expect(resolveSpeciesGrants(find('kalashtar-2024'), ctx).resistances).toEqual(['psychic'])
    expect(resolveSpeciesGrants(find('warforged-2024'), ctx).resistances).toEqual(['poison'])
    expect(resolveSpeciesGrants(find('dhampir-2024'), ctx).resistances).toEqual(['necrotic'])
  })

  it('Reborn picks one of three resistances (Strange Endurance)', () => {
    const reborn = find('reborn-2024')
    const def = getSpeciesChoiceDefs('reborn-2024')[0]
    expect(def.options.map(o => o.value)).toEqual(['cold', 'necrotic', 'poison'])
    expect(getMissingSpeciesChoices(reborn, { edition: '2024' })).toContain('Strange Endurance')
    expect(resolveSpeciesGrants(reborn, { ...ctx, choices: { strangeEndurance: 'cold' } }).resistances).toEqual(['cold'])
  })

  it('Shifter picks one of the four Shifting benefits', () => {
    const def = getSpeciesChoiceDefs('shifter-2024')[0]
    expect(def.options.map(o => o.label)).toEqual(['Beasthide', 'Longtooth', 'Swiftstride', 'Wildhunt'])
    expect(def.options[0].description).toMatch(/\+1 bonus to your Armor Class/)
    expect(def.options[2].description).toMatch(/Speed increases by 10 feet/)
    expect(getMissingSpeciesChoices(find('shifter-2024'), { edition: '2024' })).toContain('Shifting')
  })

  it('Dhampir has a 35 ft speed with a matching climb speed and darkvision', () => {
    const g = resolveSpeciesGrants(find('dhampir-2024'), { ...ctx, walkSpeed: 35 })
    expect(g.movement.climb).toBe(35)
    expect(g.senses.darkvision).toBe(60)
  })

  it('Warforged: +1 AC, poison resistance and a skill plus a tool pick', () => {
    const warforged = find('warforged-2024')
    expect(resolveSpeciesGrants(warforged, ctx).acBonus).toBe(1)
    expect(getSpeciesPickSlots(warforged, '2024').map(s => [s.kind, s.count])).toEqual([['skill', 1], ['tool', 1]])
    const c = create({ speciesSlug: 'warforged-2024' })
    expect(c.armorClass).toBe(10 + c.abilities.DEX.modifier + 1)
  })

  it('every B6 trait has 2024 text and the Hexblood/Dhampir texts are the 2024 ones', () => {
    Object.keys(SLUGS).forEach(slug => {
      find(slug).species_traits.forEach(t => expect(desc(t), `${slug}: ${t}`).not.toBe(''))
    })
    expect(desc('Vampiric Bite')).toMatch(/1d4 plus your Constitution modifier/)
    expect(desc('Eerie Token')).toMatch(/Disguise Self and Hex/)
    expect(desc('Shape-Shifter')).toMatch(/Advantage on Charisma checks/)
  })
})
