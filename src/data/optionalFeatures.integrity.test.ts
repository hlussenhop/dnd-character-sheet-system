import { describe, it, expect } from 'vitest'
import { SPELL_DATABASE } from '../services/dataService'
import type { Character } from '../types/dnd'
import { calculateLevelUpData, getLevelUpSteps } from '../utils/levelUpUtils'
import {
  OPTIONAL_FEATURES,
  applyOptionalFeatureGrants,
  creationNeedsOptionalFeatures,
  getOptionalFeature,
  levelUpNeedsOptionalFeatures,
  optionalFeatureAllowance,
  optionalFeatureBlockedReason,
  optionalFeatureNotes,
  optionalFeaturePicksAtLevel,
  optionalFeatureSelectionComplete,
  optionalFeaturesForPick,
  optionalFeaturesOfType,
} from '../utils/optionalFeatures'

/**
 * Optional-feature lane (sourcebooks/build_optional_features.py): one record per feature and
 * edition, saved fighting-style slugs kept, and the class tables say how many you know.
 */
describe('optional feature data', () => {
  it('keeps one record per feature and edition, with the saved fighting-style slugs', () => {
    const slugs = OPTIONAL_FEATURES.map(feature => feature.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(OPTIONAL_FEATURES.length).toBe(221)
    expect(OPTIONAL_FEATURES.filter(feature => feature.edition === '2014').length).toBe(151)
    expect(OPTIONAL_FEATURES.filter(feature => feature.edition === '2024').length).toBe(70)

    expect(getOptionalFeature('defense')).toMatchObject({ name: 'Defense', edition: '2014' })
    expect(getOptionalFeature('thrown-weapon-fighting')?.name).toBe('Thrown Weapon Fighting')
    expect(getOptionalFeature('agonizing-blast', '2024')?.slug).toBe('agonizing-blast-2024')
    expect(optionalFeaturesOfType('EI', '2014').length).toBeGreaterThan(20)

    const spellSlugs = new Set(SPELL_DATABASE.map(spell => spell.slug))
    for (const feature of OPTIONAL_FEATURES) {
      expect(feature.description.length).toBeGreaterThan(0)
      expect(feature.featureTypes.length).toBeGreaterThan(0)
      for (const spell of feature.spells ?? []) expect(spellSlugs.has(spell)).toBe(true)
      for (const group of feature.prerequisites ?? []) {
        for (const spell of group.spells ?? []) expect(spellSlugs.has(spell)).toBe(true)
        for (const required of group.features ?? []) expect(getOptionalFeature(required)).toBeTruthy()
      }
    }
  })

  it('counts options from the class and subclass tables', () => {
    expect(optionalFeatureAllowance('warlock', '2014', 2).find(row => row.featureType === 'EI')?.known).toBe(2)
    expect(optionalFeaturePicksAtLevel('warlock', '2014', 5).find(row => row.featureType === 'EI')?.gain).toBe(1)
    expect(optionalFeatureAllowance('warlock', '2024', 1).find(row => row.featureType === 'EI')?.known).toBe(1)
    expect(optionalFeatureAllowance('warlock', '2014', 3).find(row => row.featureType === 'PB')?.known).toBe(1)

    expect(optionalFeatureAllowance('fighter', '2014', 1).find(row => row.featureType === 'FS:F')?.known).toBe(1)
    expect(optionalFeatureAllowance('fighter', '2014', 10, 'champion').find(row => row.featureType === 'FS:F')?.known).toBe(2)
    expect(optionalFeatureAllowance('fighter', '2014', 3, 'battle-master').find(row => row.featureType === 'MV:B')?.known).toBe(3)
    expect(optionalFeatureAllowance('fighter', '2014', 7, 'battle-master').find(row => row.featureType === 'MV:B')?.known).toBe(5)
    expect(optionalFeatureAllowance('fighter', '2014', 1, undefined, ['superior-technique']).find(row => row.featureType === 'MV:B')?.known).toBe(1)

    expect(optionalFeatureAllowance('sorcerer', '2014', 3).find(row => row.featureType === 'MM')?.known).toBe(2)
    expect(optionalFeatureAllowance('sorcerer', '2024', 2).find(row => row.featureType === 'MM')?.known).toBe(2)
    expect(optionalFeatureAllowance('artificer', '2014', 2).find(row => row.featureType === 'AI')?.known).toBe(4)

    const elements = optionalFeatureAllowance('monk', '2014', 3, 'four-elements').find(row => row.featureType === 'ED')
    expect(elements).toMatchObject({ known: 2, required: ['elemental-attunement'] })
  })

  it('applies a feature skill and sense', () => {
    const character = {
      edition: '2014',
      proficiencyBonus: 2,
      abilities: { CHA: { score: 14, modifier: 2 } },
      skills: {
        Deception: { value: 2, proficient: false },
        Persuasion: { value: 2, proficient: false },
      },
    } as Character

    applyOptionalFeatureGrants(character, ['beguiling-influence', 'blind-fighting'])

    expect(character.skills.Deception).toEqual({ value: 4, proficient: true })
    expect(character.skills.Persuasion.proficient).toBe(true)
    expect(character.senses?.blindsight).toBe(10)
    expect(getOptionalFeature('armor-of-shadows')?.spells).toEqual(['mage-armor-2014'])
  })

  it('blocks level, class, pact, and feature prerequisites, and leaves spells as notes', () => {
    const thirsting = getOptionalFeature('thirsting-blade')!
    expect(optionalFeatureBlockedReason(thirsting, 2, 'warlock', ['pact-of-the-blade'])).toMatch(/level 5/)
    expect(optionalFeatureBlockedReason(thirsting, 5, 'warlock', [])).toMatch(/Pact of the Blade/)
    expect(optionalFeatureBlockedReason(thirsting, 5, 'warlock', ['pact-of-the-blade'])).toBeNull()
    expect(optionalFeaturesForPick('EI', '2014', 5, 'warlock').some(feature => feature.slug === 'thirsting-blade')).toBe(false)
    expect(optionalFeaturesForPick('EI', '2014', 5, 'warlock', ['pact-of-the-blade']).some(feature => feature.slug === 'thirsting-blade')).toBe(true)

    const thirsting2024 = getOptionalFeature('thirsting-blade-2024')!
    expect(optionalFeatureBlockedReason(thirsting2024, 5, 'warlock', [], 'blade')).toMatch(/Pact of the Blade/)
    expect(optionalFeatureBlockedReason(thirsting2024, 5, 'warlock', ['pact-of-the-blade-2024'])).toBeNull()

    expect(optionalFeatureBlockedReason(getOptionalFeature('agonizing-blast')!, 2, 'warlock', [])).toBeNull()
    expect(optionalFeatureNotes(getOptionalFeature('agonizing-blast')!).join(' ')).toMatch(/eldritch blast/)
  })

  it('shows the creation and level-up steps only when the count increases', () => {
    expect(creationNeedsOptionalFeatures('fighter', '2014', 1)).toBe(true)
    expect(creationNeedsOptionalFeatures('paladin', '2014', 1)).toBe(false)
    expect(creationNeedsOptionalFeatures('warlock', '2024', 1)).toBe(true)
    expect(creationNeedsOptionalFeatures(undefined, '2014', 1)).toBe(false)

    expect(levelUpNeedsOptionalFeatures('warlock', '2014', 2)).toBe(true)
    expect(levelUpNeedsOptionalFeatures('fighter', '2014', 2)).toBe(false)
    expect(levelUpNeedsOptionalFeatures('fighter', '2014', 3, null, true)).toBe(true)
    expect(levelUpNeedsOptionalFeatures('fighter', '2014', 3, 'champion')).toBe(false)
    expect(levelUpNeedsOptionalFeatures('fighter', '2014', 3, 'battle-master')).toBe(true)

    expect(optionalFeatureSelectionComplete(
      [{ featureType: 'FS:F', name: 'Fighting Style', known: 1, required: [] }],
      ['defense'],
      '2014',
    )).toBe(true)

    const warlock = {
      class: 'Warlock',
      classSlug: 'warlock',
      edition: '2014',
      level: 1,
      abilities: { CON: { modifier: 2 } },
    } as Character
    const warlockLevelUp = calculateLevelUpData(warlock)!
    expect(warlockLevelUp.optionalFeaturePicks).toBe(true)
    expect(getLevelUpSteps(warlockLevelUp)).toEqual(['overview', 'hp', 'optional-features', 'confirm'])

    const fighter = { ...warlock, class: 'Fighter', classSlug: 'fighter' }
    expect(calculateLevelUpData(fighter)!.optionalFeaturePicks).toBeFalsy()

    const fighter2024 = { ...fighter, edition: '2024' as const, level: 2 }
    const subclassLevel = calculateLevelUpData(fighter2024)!
    const steps = getLevelUpSteps(subclassLevel)
    expect(subclassLevel.optionalFeaturePicks).toBe(true)
    expect(steps.indexOf('optional-features')).toBe(steps.indexOf('subclass') + 1)
  })
})
