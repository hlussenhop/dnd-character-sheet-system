import { describe, it, expect } from 'vitest'
import type { Character, CharacterCreationData } from '../types/dnd'
import { BACKGROUNDS } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import { applyLevelUp, calculateLevelUpData, getLevelUpSteps } from './levelUpUtils'
import {
  classLevelOf,
  formatClassSummary,
  getClassEntries,
  hitDicePools,
  multiclassEligibility,
  multiclassSpellSlots,
  removeMulticlassLevel,
  spendHitDice,
} from './multiclass'

const create = (overrides: Partial<CharacterCreationData> & { scores?: Partial<Record<string, number>> }) => {
  const edition = overrides.edition ?? '2014'
  const { scores, ...rest } = overrides
  return calculateCharacterStats({
    name: 'Test',
    level: 1,
    edition,
    classSlug: 'fighter',
    speciesSlug: 'human',
    abilities: { STR: 15, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 10, ...scores },
    abilityScoreMethod: 'custom',
    background: (BACKGROUNDS.find(b => b.edition === edition) ?? BACKGROUNDS[0]).slug,
    alignment: 'Neutral Good',
    selectedSkills: [],
    selectedMusicalInstruments: [],
    equipmentChoices: [],
    hpCalculationMethod: 'max',
    spellSelection: { selectedCantrips: [], preparedSpells: [], knownSpells: [], spellbook: [] },
    ...rest,
  } as unknown as CharacterCreationData)
}

const withClasses = (character: Character, classes: Character['classes']): Character => ({
  ...character,
  classes,
  level: (classes ?? []).reduce((total, entry) => total + entry.level, 0),
})

describe('multiclass prerequisites', () => {
  it('needs 13 in the new class ability and in the current class ability', () => {
    const fighter = create({ level: 3 })
    expect(multiclassEligibility(fighter, 'wizard').eligible).toBe(false)
    expect(multiclassEligibility(fighter, 'wizard').reasons.join(' ')).toMatch(/INT 13/)

    const smartFighter = create({ level: 3, scores: { INT: 14 } })
    expect(multiclassEligibility(smartFighter, 'wizard').eligible).toBe(true)

    const weakFighter = create({ level: 3, scores: { STR: 10, DEX: 10, INT: 14 } })
    const result = multiclassEligibility(weakFighter, 'wizard')
    expect(result.eligible).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/Fighter needs STR 13 or DEX 13/)
  })

  it('rejects a class the character already has', () => {
    expect(multiclassEligibility(create({}), 'fighter').eligible).toBe(false)
  })
})

describe('leveling into a new class', () => {
  it('adds Wizard 1 to a Fighter 3 with its own hit die, spells and spellcasting', () => {
    const fighter = create({ level: 3, scores: { INT: 14 } })
    const data = calculateLevelUpData(fighter, 'wizard')!
    expect(data.isNewClass).toBe(true)
    expect(data.toLevel).toBe(4)
    expect(data.toClassLevel).toBe(1)
    expect(data.hitDie).toBe('d6')
    expect(data.choices.filter(choice => choice.type === 'spells').map(choice => choice.description)).toEqual([
      'Learn 3 Wizard cantrips',
      'Learn 6 Wizard spells',
    ])
    expect(data.choices.some(choice => choice.type === 'asi')).toBe(false)
    expect(getLevelUpSteps(data)).toEqual(expect.arrayContaining(['spells-0', 'spells-1']))

    const leveled = applyLevelUp(fighter, data, {
      classSlug: 'wizard',
      hpGained: 4,
      spellsLearned: ['fire-bolt', 'mage-hand', 'light', 'magic-missile', 'shield'],
    })

    expect(leveled.level).toBe(4)
    expect(leveled.class).toBe('Fighter')
    expect(formatClassSummary(leveled)).toBe('Fighter 3 / Wizard 1')
    expect(classLevelOf(leveled, 'wizard')).toBe(1)
    expect(hitDicePools(leveled)).toEqual([
      { die: 10, max: 3, current: 3 },
      { die: 6, max: 1, current: 1 },
    ])
    expect(leveled.spellcasting?.ability).toBe('INT')
    expect(leveled.spellcasting?.spellcastingType).toBe('wizard')
    expect(leveled.spellcasting?.cantripsKnown).toEqual(['fire-bolt', 'mage-hand', 'light'])
    expect(leveled.spellcasting?.spellbook).toEqual(['magic-missile', 'shield'])
    expect(leveled.spellcasting?.spellSlots.slice(0, 3)).toEqual([0, 2, 0])
    expect(leveled.spellcasting?.classCasting).toEqual([
      { classSlug: 'wizard', className: 'Wizard', ability: 'INT', spellcastingType: 'wizard' },
    ])
    expect(leveled.levelHistory?.[leveled.levelHistory.length - 1]).toMatchObject({ classSlug: 'wizard', classLevel: 1, newClass: true })
  })

  it('grants the reduced multiclass proficiencies and a picked skill', () => {
    const fighter = create({ level: 2, scores: { DEX: 14 } })
    expect(fighter.skills.Stealth.proficient).toBe(false)
    const data = calculateLevelUpData(fighter, 'rogue')!
    const leveled = applyLevelUp(fighter, data, { classSlug: 'rogue', hpGained: 5, multiclassSkills: ['Stealth'] })
    expect(leveled.skills.Stealth.proficient).toBe(true)
    expect(leveled.proficiencies?.tools).toContain("Thieves' Tools")
    expect(leveled.savingThrowProficiencies ?? []).not.toContain('DEX')
  })

  it('advances the second class with that class level for features and ASI', () => {
    const fighter = create({ level: 3, scores: { INT: 14 } })
    let character = applyLevelUp(fighter, calculateLevelUpData(fighter, 'wizard')!, { classSlug: 'wizard', hpGained: 4 })
    character = applyLevelUp(character, calculateLevelUpData(character, 'fighter')!, { classSlug: 'fighter', hpGained: 6 })
    expect(formatClassSummary(character)).toBe('Fighter 4 / Wizard 1')
    expect(character.proficiencyBonus).toBe(3)

    const wizardTwo = calculateLevelUpData(character, 'wizard')!
    expect(wizardTwo.toClassLevel).toBe(2)
    expect(wizardTwo.choices.some(choice => choice.type === 'asi')).toBe(false)
    expect(wizardTwo.choices.some(choice => choice.type === 'subclass')).toBe(true)
    expect(wizardTwo.choices.find(choice => choice.description.includes('spell'))?.count).toBe(2)
  })
})

describe('2024 multiclass', () => {
  it('takes a Cleric 2 into Wizard 1 with shared slots and two casting classes', () => {
    const cleric = create({ edition: '2024', classSlug: 'cleric', level: 2, scores: { WIS: 15, INT: 14 } })
    const data = calculateLevelUpData(cleric, 'wizard')!
    expect(data.isNewClass).toBe(true)
    expect(data.features.every(feature => feature.level === 1)).toBe(true)
    expect(data.choices.filter(choice => choice.type === 'spells')).toHaveLength(2)

    const leveled = applyLevelUp(cleric, data, { classSlug: 'wizard', hpGained: 4, spellsLearned: ['magic-missile'] })
    expect(formatClassSummary(leveled)).toBe('Cleric 2 / Wizard 1')
    expect(leveled.spellcasting?.ability).toBe('WIS')
    expect(leveled.spellcasting?.classCasting?.map(item => [item.classSlug, item.ability])).toEqual([
      ['cleric', 'WIS'],
      ['wizard', 'INT'],
    ])
    expect(leveled.spellcasting?.spellSlots.slice(1, 3)).toEqual([4, 2])
    expect(leveled.spellcasting?.spellbook).toContain('magic-missile')
  })
})

describe('shared spell slots', () => {
  const base = create({ level: 1 })

  it('adds full and half caster levels on the multiclass table', () => {
    const clericWizard = withClasses(base, [
      { class: 'Cleric', classSlug: 'cleric', level: 3, hitDie: 8 },
      { class: 'Wizard', classSlug: 'wizard', level: 2, hitDie: 6 },
    ])
    expect(multiclassSpellSlots(clericWizard)?.slice(1, 4)).toEqual([4, 3, 2])

    const paladinSorcerer = withClasses({ ...base, class: 'Paladin', classSlug: 'paladin' }, [
      { class: 'Paladin', classSlug: 'paladin', level: 2, hitDie: 10 },
      { class: 'Sorcerer', classSlug: 'sorcerer', level: 1, hitDie: 6 },
    ])
    expect(multiclassSpellSlots(paladinSorcerer)?.slice(1, 3)).toEqual([3, 0])
  })

  it('uses a lone casting class table and stacks Pact Magic on top', () => {
    const warlockSorcerer = withClasses({ ...base, class: 'Warlock', classSlug: 'warlock' }, [
      { class: 'Warlock', classSlug: 'warlock', level: 2, hitDie: 8 },
      { class: 'Sorcerer', classSlug: 'sorcerer', level: 1, hitDie: 6 },
    ])
    expect(multiclassSpellSlots(warlockSorcerer)?.slice(1, 3)).toEqual([4, 0])
  })

  it('is null for a single-class character', () => {
    expect(multiclassSpellSlots(base)).toBeNull()
  })
})

describe('hit dice and level down', () => {
  it('spends the largest dice first and gives a level back to the right class', () => {
    const fighter = create({ level: 3, scores: { INT: 14 } })
    const multi = applyLevelUp(fighter, calculateLevelUpData(fighter, 'wizard')!, { classSlug: 'wizard', hpGained: 4 })

    const spent = spendHitDice(multi, 2)
    expect(spent.dice).toEqual([10, 10])
    expect(spent.hitDice.pools).toEqual({ d10: { current: 1, max: 3 }, d6: { current: 1, max: 1 } })

    const down = removeMulticlassLevel(multi)!
    expect(down.classSlug).toBe('wizard')
    expect(down.character.level).toBe(3)
    expect(down.character.classes).toBeUndefined()
    expect(getClassEntries(down.character)).toHaveLength(1)
    expect(down.character.hitDice).toEqual(expect.objectContaining({ max: 3 }))
    expect(down.character.hitDice.pools).toBeUndefined()
  })
})

describe('single-class level-up', () => {
  it('keeps the single-class data shape', () => {
    const fighter = create({ level: 1 })
    const data = calculateLevelUpData(fighter)!
    expect(data.classSlug).toBe('fighter')
    expect(data.isNewClass).toBe(false)
    const leveled = applyLevelUp(fighter, data, { hpGained: 6 })
    expect(leveled.classes).toBeUndefined()
    expect(leveled.hitDice.pools).toBeUndefined()
    expect(leveled.hitDice.max).toBe(2)
  })

  it('offers the 2014 subclass at the class subclass level', () => {
    const fighter = create({ level: 2 })
    expect(calculateLevelUpData(fighter)!.choices.some(choice => choice.type === 'subclass')).toBe(true)
  })
})
