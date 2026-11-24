import { describe, it, expect } from 'vitest'
import type { CharacterCreationData, Species, SpeciesAbilityChoice } from '../types/dnd'
import { getAllSpecies, loadClasses, BACKGROUNDS } from '../services/dataService'
import { calculateCharacterStats } from './characterCreationUtils'
import {
  buildAbilityChoiceSelection,
  getAbilityChoicePicks,
  getChoosableAbilities,
  getSpeciesAbilityRules,
  resolveSpeciesAbilityBonuses,
  validateAbilityChoice,
} from './speciesAbilityUtils'

const ZERO = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 }

// Species shapes covering the cases in the spec
const customLineageLike: Pick<Species, 'ability_bonuses' | 'abilityChoice' | 'variants'> = {
  ability_bonuses: {},
  abilityChoice: { patterns: [[2, 1], [1, 1, 1]] },
}
const halfElfLike: Pick<Species, 'ability_bonuses' | 'abilityChoice' | 'variants'> = {
  ability_bonuses: { CHA: 2 },
  abilityChoice: { patterns: [[1, 1]], from: ['STR', 'DEX', 'CON', 'INT', 'WIS'] },
}
const fixedOnly: Pick<Species, 'ability_bonuses' | 'abilityChoice' | 'variants'> = {
  ability_bonuses: { STR: 2, CON: 1 },
}

const data = (overrides: Partial<CharacterCreationData> = {}): CharacterCreationData =>
  ({ speciesSlug: 'x', edition: '2014', ...overrides }) as CharacterCreationData

describe('validateAbilityChoice', () => {
  const choice: SpeciesAbilityChoice = customLineageLike.abilityChoice!

  it('is valid when there is no choice to make', () => {
    expect(validateAbilityChoice(undefined, {}, undefined).valid).toBe(true)
  })

  it('requires a selection', () => {
    expect(validateAbilityChoice(choice, {}, undefined).valid).toBe(false)
  })

  it('accepts +2/+1 and +1/+1/+1', () => {
    expect(validateAbilityChoice(choice, {}, { pattern: [2, 1], bonuses: { DEX: 2, CON: 1 } }).valid).toBe(true)
    expect(validateAbilityChoice(choice, {}, { pattern: [1, 1, 1], bonuses: { DEX: 1, CON: 1, WIS: 1 } }).valid).toBe(true)
  })

  it('rejects incomplete assignments', () => {
    expect(validateAbilityChoice(choice, {}, { pattern: [2, 1], bonuses: { DEX: 2 } }).valid).toBe(false)
    expect(validateAbilityChoice(choice, {}, { pattern: [1, 1, 1], bonuses: {} }).valid).toBe(false)
  })

  it('rejects values that do not match the declared pattern', () => {
    expect(validateAbilityChoice(choice, {}, { pattern: [2, 1], bonuses: { DEX: 1, CON: 1 } }).valid).toBe(false)
  })

  it('rejects patterns the species does not offer', () => {
    expect(validateAbilityChoice(choice, {}, { pattern: [3], bonuses: { DEX: 3 } }).valid).toBe(false)
  })

  it('rejects abilities outside `from` and abilities that already have a fixed bonus', () => {
    const half = halfElfLike.abilityChoice!
    const fixed = halfElfLike.ability_bonuses!
    expect(validateAbilityChoice(half, fixed, { pattern: [1, 1], bonuses: { CHA: 1, DEX: 1 } }).valid).toBe(false)
    expect(validateAbilityChoice(half, fixed, { pattern: [1, 1], bonuses: { STR: 1, DEX: 1 } }).valid).toBe(true)
  })
})

describe('getChoosableAbilities', () => {
  it('defaults to all six and excludes fixed abilities', () => {
    expect(getChoosableAbilities({ patterns: [[1]] }, {})).toHaveLength(6)
    expect(getChoosableAbilities({ patterns: [[1]] }, { CON: 2 })).not.toContain('CON')
  })
})

describe('slot picks round-trip', () => {
  it('maps slots to abilities and back, including repeated amounts', () => {
    const selection = buildAbilityChoiceSelection([1, 1, 1], ['STR', 'DEX', 'WIS'])
    expect(selection.bonuses).toEqual({ STR: 1, DEX: 1, WIS: 1 })
    expect(getAbilityChoicePicks([1, 1, 1], selection).sort()).toEqual(['DEX', 'STR', 'WIS'])

    const sel2 = buildAbilityChoiceSelection([2, 1], ['CON', undefined])
    expect(getAbilityChoicePicks([2, 1], sel2)).toEqual(['CON', undefined])
  })
})

describe('resolveSpeciesAbilityBonuses', () => {
  it('returns fixed bonuses unchanged for species without a choice (no behavior change)', () => {
    expect(resolveSpeciesAbilityBonuses(fixedOnly, data())).toEqual({ ...ZERO, STR: 2, CON: 1 })
  })

  it('adds a valid choice on top of fixed bonuses', () => {
    const result = resolveSpeciesAbilityBonuses(
      halfElfLike,
      data({ speciesAbilityChoices: { pattern: [1, 1], bonuses: { STR: 1, WIS: 1 } } }),
    )
    expect(result).toEqual({ ...ZERO, CHA: 2, STR: 1, WIS: 1 })
  })

  it('ignores a missing or invalid choice rather than granting illegal scores', () => {
    expect(resolveSpeciesAbilityBonuses(halfElfLike, data())).toEqual({ ...ZERO, CHA: 2 })
    expect(
      resolveSpeciesAbilityBonuses(halfElfLike, data({ speciesAbilityChoices: { pattern: [1, 1], bonuses: { STR: 3 } } })),
    ).toEqual({ ...ZERO, CHA: 2 })
  })

  it('variant rules replace the base species rules', () => {
    const species = {
      ability_bonuses: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
      variants: [
        { slug: 'standard', name: 'S', description: '', ability_bonuses: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, species_traits: [], features: [] },
        { slug: 'variant', name: 'V', description: '', ability_bonuses: {}, abilityChoice: { patterns: [[1, 1]] }, species_traits: [], features: [] },
      ],
    }
    expect(getSpeciesAbilityRules(species, 'variant').choice).toBeDefined()
    expect(getSpeciesAbilityRules(species, undefined).choice).toBeUndefined()
    expect(getSpeciesAbilityRules(species, 'unknown-slug').fixed.STR).toBe(1)
  })
})

describe('real species data', () => {
  const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)

  it('2014 Half-Elf: CHA +2 fixed, plus +1 to two other abilities', () => {
    const half = find('half-elf')!
    expect(half.edition).toBe('2014')
    const rules = getSpeciesAbilityRules(half)
    expect(rules.fixed).toEqual({ CHA: 2 })
    expect(rules.choice?.patterns).toEqual([[1, 1]])
    expect(getChoosableAbilities(rules.choice!, rules.fixed)).toEqual(['STR', 'DEX', 'CON', 'INT', 'WIS'])
  })

  it('Variant Human: +1/+1 chosen, via legacy variantAbilityBonuses (HumanVariantSelector)', () => {
    const human = find('human')!
    const base = { speciesSlug: 'human', selectedSpeciesVariant: 'variant' } as const

    // Incomplete -> nothing applied
    expect(resolveSpeciesAbilityBonuses(human, data({ ...base, variantAbilityBonuses: { STR: 1 } as never }))).toEqual(ZERO)
    // Complete
    expect(
      resolveSpeciesAbilityBonuses(human, data({ ...base, variantAbilityBonuses: { STR: 1, CON: 1 } as never })),
    ).toEqual({ ...ZERO, STR: 1, CON: 1 })
  })

  it('Standard Human (and Human with no variant picked yet) still get +1 to everything', () => {
    const human = find('human')!
    const all = { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }
    expect(resolveSpeciesAbilityBonuses(human, data({ speciesSlug: 'human', selectedSpeciesVariant: 'standard' }))).toEqual(all)
    expect(resolveSpeciesAbilityBonuses(human, data({ speciesSlug: 'human' }))).toEqual(all)
  })

  it('every authored abilityChoice is well-formed', () => {
    const all = getAllSpecies()
    const problems: string[] = []
    all.forEach(species => {
      const choices = [
        { label: species.slug, fixed: species.ability_bonuses ?? {}, choice: species.abilityChoice },
        ...(species.variants ?? []).map(v => ({ label: `${species.slug}/${v.slug}`, fixed: v.ability_bonuses, choice: v.abilityChoice })),
      ]
      choices.forEach(({ label, fixed, choice }) => {
        if (!choice) return
        if (choice.patterns.length === 0 || choice.patterns.some(p => p.length === 0 || p.some(n => !(n > 0)))) {
          problems.push(`${label}: bad patterns`)
        }
        const slots = Math.max(...choice.patterns.map(p => p.length))
        if (getChoosableAbilities(choice, fixed).length < slots) problems.push(`${label}: fewer choosable abilities than slots`)
      })
    })
    expect(problems).toEqual([])
  })
})

describe('calculateCharacterStats (live creation path)', () => {
  const classData = loadClasses().find(c => c.edition === '2014' || !c.edition) ?? loadClasses()[0]
  const background = BACKGROUNDS.find(b => b.edition === '2014') ?? BACKGROUNDS[0]

  const base = (overrides: Partial<CharacterCreationData>): CharacterCreationData =>
    ({
      name: 'Test',
      level: 1,
      edition: '2014',
      speciesSlug: 'half-elf',
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
    }) as unknown as CharacterCreationData

  it('applies Half-Elf fixed + chosen increases to the final scores', () => {
    const character = calculateCharacterStats(
      base({ speciesAbilityChoices: { pattern: [1, 1], bonuses: { DEX: 1, CON: 1 } } }),
    )
    expect(character.abilities.CHA.score).toBe(12)
    expect(character.abilities.DEX.score).toBe(11)
    expect(character.abilities.CON.score).toBe(11)
    expect(character.abilities.STR.score).toBe(10)
  })

  it('without a choice, only the fixed Half-Elf bonus applies', () => {
    const character = calculateCharacterStats(base({}))
    expect(character.abilities.CHA.score).toBe(12)
    expect(character.abilities.DEX.score).toBe(10)
  })

  it('Variant Human gets only the two chosen +1s, not +1 to everything', () => {
    const character = calculateCharacterStats(
      base({
        speciesSlug: 'human',
        selectedSpeciesVariant: 'variant',
        variantAbilityBonuses: { STR: 1, WIS: 1 } as never,
      }),
    )
    expect(character.abilities.STR.score).toBe(11)
    expect(character.abilities.WIS.score).toBe(11)
    expect(character.abilities.DEX.score).toBe(10)
    expect(character.abilities.CHA.score).toBe(10)
    // The chosen variant is persisted and contributes its traits
    expect(character.selectedSpeciesVariant).toBe('variant')
    expect(character.featuresAndTraits.speciesTraits).toEqual(expect.arrayContaining(['Variant Skills', 'Variant Feat']))
  })

  it('a species without any choice behaves as before (fixed bonuses only)', () => {
    const fixedSpecies = getAllSpecies().find(
      s => s.edition === '2014' && !s.abilityChoice && !s.variants && Object.keys(s.ability_bonuses ?? {}).length > 0,
    )
    expect(fixedSpecies).toBeDefined()
    const character = calculateCharacterStats(base({ speciesSlug: fixedSpecies!.slug }))
    ;(Object.entries(fixedSpecies!.ability_bonuses!) as [keyof typeof character.abilities, number][]).forEach(([ability, bonus]) => {
      expect(character.abilities[ability].score).toBe(10 + bonus)
    })
  })
})
