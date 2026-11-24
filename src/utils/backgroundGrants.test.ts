import { describe, it, expect } from 'vitest'
import type { CharacterCreationData } from '../types/dnd'
import { getBackground, loadClasses } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { missingBackgroundPicks } from './backgroundUtils'

const fighter = (edition: '2014' | '2024') =>
  loadClasses(edition).find(c => c.slug.startsWith('fighter')) ?? loadClasses(edition)[0]

const create = (overrides: Partial<CharacterCreationData>) => {
  const edition = overrides.edition ?? '2024'
  return calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition,
    classSlug: fighter(edition).slug,
    speciesSlug: edition === '2024' ? 'human-2024' : 'human',
    abilities: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10 },
    abilityScoreMethod: 'custom',
    background: edition === '2024' ? 'soldier-2024' : 'soldier',
    alignment: 'Neutral Good',
    selectedSkills: [],
    selectedMusicalInstruments: [],
    equipmentChoices: [],
    hpCalculationMethod: 'max',
    spellSelection: { cantrips: [], spells: [] },
    ...overrides,
  } as unknown as CharacterCreationData)
}

describe('background grants at character creation', () => {
  it('grants a background with fixed skills', () => {
    const character = create({ background: 'soldier-2024' })
    expect(character.skills.Athletics.proficient).toBe(true)
    expect(character.skills.Intimidation.proficient).toBe(true)
    expect(character.skills.Stealth.proficient).toBe(false)
  })

  it('grants the skills the player chose', () => {
    const background = getBackground('urban-bounty-hunter')!
    expect(missingBackgroundPicks(background, { background: background.slug } as CharacterCreationData)).toContain('Background skill choices')
    const character = create({
      edition: '2014',
      background: 'urban-bounty-hunter',
      backgroundSkills: ['Deception', 'Stealth'],
      backgroundTools: ['Gaming Set', "Thieves' Tools"],
    })
    expect(character.skills.Deception.proficient).toBe(true)
    expect(character.skills.Stealth.proficient).toBe(true)
    expect(character.skills.Insight.proficient).toBe(false)
    expect(character.proficiencies?.tools).toEqual(expect.arrayContaining(['Gaming Set', "Thieves' Tools"]))
  })

  it('grants a chosen tool alongside the fixed one', () => {
    const character = create({
      edition: '2014',
      background: 'criminal',
      backgroundTools: ['Dice Set'],
    })
    expect(character.proficiencies?.tools).toEqual(expect.arrayContaining(["Thieves' Tools", 'Dice Set']))
    expect(character.skills.SleightOfHand?.proficient).not.toBe(true)
    expect(character.skills.Deception.proficient).toBe(true)
  })

  it('maps Sleight of Hand onto the character skill', () => {
    const character = create({ edition: '2014', background: 'charlatan' })
    expect(character.skills.SleightOfHand.proficient).toBe(true)
    expect(character.skills.Deception.proficient).toBe(true)
  })

  it('applies the background feat, including a chosen Dark Gift', () => {
    const haunted = getBackground('haunted-one-2024')!
    expect(haunted.originFeatOptions).toContain('survivor-2024')
    const withGift = create({
      background: 'haunted-one-2024',
      backgroundFeat: 'survivor-2024',
      backgroundTools: ['Dice Set'],
    })
    expect(withGift.selectedFeats).toContain('survivor-2024')
    expect(withGift.originFeat).toBe('survivor-2024')
  })

  it('grants the tools of the chosen dragonmarked house', () => {
    const character = create({
      edition: '2014',
      background: 'house-agent',
      backgroundToolPackage: 'Cannith',
    })
    expect(character.proficiencies?.tools).toEqual(expect.arrayContaining(["Alchemist's Supplies", "Tinker's Tools"]))
  })

  it('keeps pocket money out of the inventory', () => {
    const character = create({ background: 'acolyte-2024' })
    expect(character.currency?.gp).toBe(8)
    expect(character.inventory?.some(item => item.equipmentSlug.includes('gp'))).toBe(false)
  })
})
