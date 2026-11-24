import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS, SPECIES_LANGUAGE_MAP } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { getFeatureDescription } from './featureDescriptions'
import {
  getMissingSpeciesChoices,
  getSpeciesLanguageChoices,
  getSpeciesPickSlots,
  resolveSpeciesGrants,
} from './speciesGrantUtils'

const B3 = {
  'astral-elf': 'AAG', autognome: 'AAG', giff: 'AAG', hadozee: 'AAG', plasmoid: 'AAG', 'thri-kreen': 'AAG',
  leonin: 'MOT', 'simic-hybrid': 'GGR', vedalken: 'GGR',
  dhampir: 'VRGR', hexblood: 'VRGR', reborn: 'VRGR', verdan: 'AI',
} as const
const FLEX = ['astral-elf', 'autognome', 'giff', 'hadozee', 'plasmoid', 'thri-kreen', 'dhampir', 'hexblood', 'reborn']

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

describe('B3: AAG, MOT, GGR, VRGR and AI species', () => {
  it('adds the 13 species as expanded 2014 entries from the right books', () => {
    Object.entries(B3).forEach(([slug, source]) => {
      const s = find(slug)
      expect(s, slug).toBeDefined()
      expect(s.edition).toBe('2014')
      expect(s.source).toBe(source)
      expect(s.sources).toEqual([source])
      expect(s.core).toBe(false)
      expect(s.expanded).toBe(true)
      expect(SPECIES_LANGUAGE_MAP[slug]?.[0]).toBe('Common')
    })
  })

  it('lineage-style species use the flexible +2/+1 or +1/+1/+1 choice', () => {
    FLEX.forEach(slug => {
      const s = find(slug)
      expect(s.ability_bonuses).toEqual({})
      expect(s.abilityChoice?.patterns).toEqual([[2, 1], [1, 1, 1]])
    })
  })

  it('fixed-ASI books keep the printed bonuses', () => {
    expect(find('leonin').ability_bonuses).toEqual({ STR: 1, CON: 2 })
    expect(find('vedalken').ability_bonuses).toEqual({ INT: 2, WIS: 1 })
    expect(find('verdan').ability_bonuses).toEqual({ CON: 1, CHA: 2 })
    const simic = find('simic-hybrid')
    expect(simic.ability_bonuses).toEqual({ CON: 2 })
    expect(simic.abilityChoice).toEqual({ patterns: [[1]], from: ['STR', 'DEX', 'INT', 'WIS', 'CHA'] })
  })

  it('uses the book walking speeds', () => {
    expect(find('leonin').speed).toBe(35)
    expect(find('dhampir').speed).toBe(35)
    expect(find('giff').speed).toBe(30)
  })

  it('species languages and language choices', () => {
    expect(SPECIES_LANGUAGE_MAP.leonin).toEqual(['Common', 'Leonin'])
    expect(SPECIES_LANGUAGE_MAP.vedalken).toEqual(['Common', 'Vedalken'])
    expect(SPECIES_LANGUAGE_MAP.verdan).toEqual(['Common', 'Goblin'])
    expect(getSpeciesLanguageChoices(find('leonin'), '2014')).toBe(0)
    expect(getSpeciesLanguageChoices(find('vedalken'), '2014')).toBe(1)
    expect(getSpeciesLanguageChoices(find('hadozee'), '2014')).toBe(1)
  })

  it('same-name traits that differ keep their own text', () => {
    const desc = (n: string) => getFeatureDescription(n, '2014')?.description ?? ''
    expect(desc('Deathless Nature')).toMatch(/death saving throws/)
    expect(desc('Deathless Nature (No Breathing)')).toMatch(/breathe/)
    expect(desc('Leonin Claws')).toMatch(/1d4/)
    expect(desc('Claws')).toMatch(/1d6/)
  })
})

describe('B3 mechanics', () => {
  it('natural armor: Autognome and Thri-kreen are 13 + DEX', () => {
    ;['autognome', 'thri-kreen'].forEach(slug => {
      expect(resolveSpeciesGrants(find(slug), ctx).naturalArmor).toMatchObject({ base: 13, abilities: ['DEX'] })
    })
  })

  it('resistances and immunities', () => {
    expect(resolveSpeciesGrants(find('autognome'), ctx)).toMatchObject({ resistances: ['poison'], conditionImmunities: ['disease'] })
    expect(resolveSpeciesGrants(find('plasmoid'), ctx).resistances).toEqual(['acid', 'poison'])
    expect(resolveSpeciesGrants(find('reborn'), ctx).resistances).toEqual(['poison'])
  })

  it('movement: Giff swims, Hadozee and Dhampir climb', () => {
    expect(resolveSpeciesGrants(find('giff'), ctx).movement).toEqual({ swim: 30 })
    expect(resolveSpeciesGrants(find('hadozee'), ctx).movement).toEqual({ climb: 30 })
    expect(resolveSpeciesGrants(find('dhampir'), { ...ctx, walkSpeed: 35 }).movement).toEqual({ climb: 35 })
  })

  it('fixed skills, weapons and darkvision', () => {
    expect(resolveSpeciesGrants(find('verdan'), ctx).skills).toEqual(['Persuasion'])
    expect(resolveSpeciesGrants(find('giff'), ctx).weapons).toEqual(['Firearms'])
    expect(resolveSpeciesGrants(find('astral-elf'), ctx)).toMatchObject({ skills: ['Perception'], senses: { darkvision: 60 } })
  })

  it('pick slots: Vedalken skill + tool, Leonin skill, Autognome two tools, VRGR lineages two skills', () => {
    expect(getSpeciesPickSlots(find('vedalken'), '2014').map(s => [s.id, s.count])).toEqual([
      ['skill:Tireless Precision', 1],
      ['tool:Tireless Precision', 1],
    ])
    expect(getSpeciesPickSlots(find('leonin'), '2014')[0].options).toEqual(['Athletics', 'Intimidation', 'Perception', 'Survival'])
    expect(getSpeciesPickSlots(find('autognome'), '2014')[0]).toMatchObject({ kind: 'tool', count: 2 })
    ;['dhampir', 'hexblood', 'reborn'].forEach(slug => {
      expect(getSpeciesPickSlots(find(slug), '2014')[0]).toMatchObject({ trait: 'Ancestral Legacy', kind: 'skill', count: 2 })
    })
  })

  it('Simic Hybrid must pick an animal enhancement, which grants movement', () => {
    const simic = find('simic-hybrid')
    expect(getMissingSpeciesChoices(simic, { edition: '2014' })).toEqual(['Animal Enhancement (1st level)'])
    const climber = resolveSpeciesGrants(simic, { ...ctx, choices: { animalEnhancement: 'nimble-climber' } })
    expect(climber.movement).toEqual({ climb: 30 })
    const swimmer = resolveSpeciesGrants(simic, { ...ctx, choices: { animalEnhancement: 'underwater-adaptation' } })
    expect(swimmer.movement).toEqual({ swim: 30 })
    expect(resolveSpeciesGrants(simic, { ...ctx, choices: { animalEnhancement: 'manta-glide' } }).movement).toEqual({})
  })

  it('creates a Leonin with printed bonuses, speed, claws skill pick and darkvision', () => {
    const leonin = create({
      speciesSlug: 'leonin',
      speciesPicks: { "skill:Hunter's Instincts": ['Intimidation'] },
    })
    expect(leonin.abilities.STR.score).toBe(11)
    expect(leonin.abilities.CON.score).toBe(16)
    expect(leonin.speed).toBe(35)
    expect(leonin.skills.Intimidation.proficient).toBe(true)
    expect(leonin.senses?.darkvision).toBe(60)
  })

  it('creates an Autognome with natural armor and poison resistance', () => {
    const autognome = create({
      speciesSlug: 'autognome',
      speciesAbilityChoices: { pattern: [2, 1], bonuses: { DEX: 2, CON: 1 } },
    })
    expect(autognome.armorClass).toBe(13 + autognome.abilities.DEX.modifier)
    expect(autognome.damageResistances).toEqual(['poison'])
    expect(autognome.conditionImmunities).toEqual(['disease'])
  })
})
