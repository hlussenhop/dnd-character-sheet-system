import type {
  AbilityName,
  CharacterCreationData,
  Species,
  SpeciesAbilityChoice,
  SpeciesAbilityChoiceSelection,
} from '../types/dnd'

const ALL_ABILITIES: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

export type AbilityBonusMap = Partial<Record<AbilityName, number>>

export interface SpeciesAbilityRules {
  /** Fixed increases */
  fixed: AbilityBonusMap
  /** Player-chosen increases, if the species/variant grants any */
  choice?: SpeciesAbilityChoice
}

export interface AbilityChoiceValidation {
  valid: boolean
  /** Human-readable reason when invalid */
  reason?: string
}

/**
 * The ability rules in force for a species. A selected variant's rules REPLACE the base
 * species' rules entirely (they are not additive).
 */
export function getSpeciesAbilityRules(
  species: Pick<Species, 'ability_bonuses' | 'abilityChoice' | 'variants'> | undefined,
  variantSlug?: string,
): SpeciesAbilityRules {
  if (!species) return { fixed: {} }
  const variant = variantSlug ? species.variants?.find(v => v.slug === variantSlug) : undefined
  if (variant) {
    return { fixed: variant.ability_bonuses ?? {}, choice: variant.abilityChoice }
  }
  return { fixed: species.ability_bonuses ?? {}, choice: species.abilityChoice }
}

/** Abilities a choice may be spent on (excludes abilities that already get a fixed bonus). */
export function getChoosableAbilities(choice: SpeciesAbilityChoice, fixed: AbilityBonusMap): AbilityName[] {
  const from = choice.from && choice.from.length > 0 ? choice.from : ALL_ABILITIES
  return from.filter(a => !fixed[a])
}

const sortedDesc = (values: number[]) => [...values].sort((a, b) => b - a)
const sameValues = (a: number[], b: number[]) =>
  a.length === b.length && sortedDesc(a).every((v, i) => v === sortedDesc(b)[i])

/** Short label for a pattern, e.g. [2, 1] -> "+2 / +1". */
export const formatAbilityPattern = (pattern: number[]): string =>
  sortedDesc(pattern).map(n => formatSignedBonus(n)).join(' / ')

/** "+2" or "-2". Zero is "0". */
export const formatSignedBonus = (bonus: number): string =>
  bonus > 0 ? `+${bonus}` : `${bonus}`

/**
 * An assigned ability score cannot fall below 1 after a species penalty.
 * An unassigned 0 is left alone so an empty wizard step does not become a 1.
 */
export const clampAssignedScore = (base: number, total: number): number =>
  base > 0 ? Math.max(1, total) : total

/**
 * The player's selection, or - for Variant Human only - the legacy `variantAbilityBonuses`
 * written by HumanVariantSelector, so that UI keeps working unchanged.
 */
export function getAbilityChoiceSelection(
  data: Pick<CharacterCreationData, 'speciesAbilityChoices' | 'variantAbilityBonuses' | 'selectedSpeciesVariant' | 'speciesSlug'>,
): SpeciesAbilityChoiceSelection | undefined {
  if (data.speciesAbilityChoices) return data.speciesAbilityChoices
  if (data.speciesSlug === 'human' && data.selectedSpeciesVariant === 'variant' && data.variantAbilityBonuses) {
    return { pattern: [1, 1], bonuses: data.variantAbilityBonuses }
  }
  return undefined
}

/** Check that a selection is a complete, legal way to spend a SpeciesAbilityChoice. */
export function validateAbilityChoice(
  choice: SpeciesAbilityChoice | undefined,
  fixed: AbilityBonusMap,
  selection: SpeciesAbilityChoiceSelection | undefined,
): AbilityChoiceValidation {
  if (!choice) return { valid: true }
  if (!selection) return { valid: false, reason: 'Choose your ability score increases' }

  if (!choice.patterns.some(p => sameValues(p, selection.pattern))) {
    return { valid: false, reason: 'Choose how to distribute your ability score increases' }
  }

  const allowed = getChoosableAbilities(choice, fixed)
  const entries = Object.entries(selection.bonuses).filter(([, v]) => (v ?? 0) !== 0) as [AbilityName, number][]

  if (entries.some(([a]) => !allowed.includes(a))) {
    return { valid: false, reason: 'Ability score increase assigned to an ability that is not allowed' }
  }
  if (!sameValues(entries.map(([, v]) => v), selection.pattern)) {
    return { valid: false, reason: `Assign all of your ability score increases (${formatAbilityPattern(selection.pattern)})` }
  }
  return { valid: true }
}

/** Convert ordered slot picks into a selection. Empty slots are left out (and so fail validation). */
export function buildAbilityChoiceSelection(
  pattern: number[],
  picks: Array<AbilityName | undefined>,
): SpeciesAbilityChoiceSelection {
  const bonuses: AbilityBonusMap = {}
  pattern.forEach((amount, i) => {
    const ability = picks[i]
    if (ability) bonuses[ability] = amount
  })
  return { pattern, bonuses }
}

/** Inverse of buildAbilityChoiceSelection: which ability fills each slot of the pattern. */
export function getAbilityChoicePicks(
  pattern: number[],
  selection: SpeciesAbilityChoiceSelection | undefined,
): Array<AbilityName | undefined> {
  const used = new Set<AbilityName>()
  return pattern.map(amount => {
    const found = (Object.entries(selection?.bonuses ?? {}) as [AbilityName, number][]).find(
      ([a, v]) => v === amount && !used.has(a),
    )
    if (found) used.add(found[0])
    return found?.[0]
  })
}

/**
 * Total species ability increases (fixed + valid chosen) for the creation data.
 * An invalid or missing choice contributes nothing, so partially-filled data never
 * produces illegal scores.
 */
export function resolveSpeciesAbilityBonuses(
  species: Pick<Species, 'ability_bonuses' | 'abilityChoice' | 'variants'> | undefined,
  data: Pick<CharacterCreationData, 'speciesAbilityChoices' | 'variantAbilityBonuses' | 'selectedSpeciesVariant' | 'speciesSlug'>,
): Record<AbilityName, number> {
  const { fixed, choice } = getSpeciesAbilityRules(species, data.selectedSpeciesVariant)
  const result = {} as Record<AbilityName, number>
  ALL_ABILITIES.forEach(a => { result[a] = fixed[a] ?? 0 })

  if (choice) {
    const selection = getAbilityChoiceSelection(data)
    if (validateAbilityChoice(choice, fixed, selection).valid && selection) {
      Object.entries(selection.bonuses).forEach(([a, v]) => {
        result[a as AbilityName] += v ?? 0
      })
    }
  }
  return result
}
