import type {
  AbilityName,
  CharacterCreationData,
  Edition,
  MovementKind,
  NaturalArmorGrant,
  SensesGrant,
  SkillName,
  Species,
  SpeciesChoiceDef,
  TraitGrant,
} from '../types/dnd'
import traitGrantData from '../data/speciesTraitGrants.json'
import choiceData from '../data/speciesChoices.json'
import { getEffectiveSpeciesTraits } from './speciesVariantUtils'

const TRAIT_GRANTS = traitGrantData as unknown as Record<string, TraitGrant>
const SPECIES_CHOICES = (choiceData as unknown as {
  choices: Record<string, SpeciesChoiceDef[]>
  lineageGrants: Record<string, Record<string, TraitGrant>>
})

const ALL_SKILL_NAMES: SkillName[] = [
  'Acrobatics', 'AnimalHandling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation',
  'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'SleightOfHand', 'Stealth', 'Survival',
]

type GrantSpecies = Pick<Species, 'slug' | 'species_traits' | 'variants' | 'languageChoices'>

/** Everything a set of grants (species traits, feats) gives the character, after choices and level. */
export interface ResolvedGrants {
  movement: Partial<Record<MovementKind, number>>
  senses: SensesGrant
  resistances: string[]
  conditionImmunities: string[]
  damageImmunities: string[]
  skills: SkillName[]
  expertise: SkillName[]
  tools: string[]
  weapons: string[]
  armor: string[]
  languages: string[]
  languageChoices: number
  savingThrows: AbilityName[]
  naturalArmor?: NaturalArmorGrant
  hpPerLevel: number
  acBonus: number
  initiativeProficiency: boolean
  initiativeBonus: number
  speedBonus: number
  /** Restrictions/notes from the contributing grants, for display */
  notes: string[]
}

export type ResolvedSpeciesGrants = ResolvedGrants

export const emptyGrants = (): ResolvedGrants => ({
  movement: {}, senses: {}, resistances: [], conditionImmunities: [], damageImmunities: [], skills: [], expertise: [],
  tools: [], weapons: [], armor: [], languages: [], languageChoices: 0, savingThrows: [], hpPerLevel: 0, acBonus: 0,
  initiativeProficiency: false, initiativeBonus: 0, speedBonus: 0, notes: [],
})

const union = <T,>(a: T[], b: T[] | undefined) => Array.from(new Set([...a, ...(b ?? [])]))

/** Add one grant's fixed parts to `out` (choices are resolved by the caller). */
export function applyTraitGrant(out: ResolvedGrants, grant: TraitGrant | undefined, ctx: { level: number; walkSpeed: number }): void {
  if (!grant || (grant.minLevel && ctx.level < grant.minLevel)) return
  Object.entries(grant.movement ?? {}).forEach(([kind, value]) => {
    const feet = value === 'walk' ? ctx.walkSpeed : value
    if (typeof feet === 'number') out.movement[kind as MovementKind] = Math.max(out.movement[kind as MovementKind] ?? 0, feet)
  })
  Object.entries(grant.senses ?? {}).forEach(([sense, range]) => {
    out.senses[sense as keyof SensesGrant] = Math.max(out.senses[sense as keyof SensesGrant] ?? 0, range as number)
  })
  out.resistances = union(out.resistances, grant.resistances)
  out.conditionImmunities = union(out.conditionImmunities, grant.conditionImmunities)
  out.damageImmunities = union(out.damageImmunities, grant.damageImmunities)
  out.skills = union(out.skills, grant.skills)
  out.expertise = union(out.expertise, grant.expertise)
  out.tools = union(out.tools, grant.tools)
  out.weapons = union(out.weapons, grant.weapons)
  out.armor = union(out.armor, grant.armor)
  out.languages = union(out.languages, grant.languages)
  out.savingThrows = union(out.savingThrows, grant.savingThrows)
  out.languageChoices += grant.languageChoices ?? 0
  out.hpPerLevel += grant.hpPerLevel ?? 0
  out.acBonus += grant.acBonus ?? 0
  out.initiativeBonus += grant.initiativeBonus ?? 0
  out.speedBonus += grant.speedBonus ?? 0
  out.initiativeProficiency = out.initiativeProficiency || !!grant.initiativeProficiency
  if (grant.naturalArmor && (!out.naturalArmor || grant.naturalArmor.base > out.naturalArmor.base)) {
    out.naturalArmor = grant.naturalArmor
  }
  if (grant.note) out.notes = union(out.notes, [grant.note])
}

/** A pick the player makes for a species trait (skills or tools). */
export interface SpeciesPickSlot {
  id: string
  kind: 'skill' | 'tool'
  /** Trait the pick comes from */
  trait: string
  count: number
  options: string[]
}

export interface SpeciesGrantContext {
  edition: Edition
  level: number
  /** Selected 2014 variant slug */
  variantSlug?: string
  /** Selected 2024 lineage name (e.g. "Drow") */
  lineage?: string
  choices?: Record<string, string>
  picks?: Record<string, string[]>
  /** Walking speed, used to resolve "equal to your walking speed" */
  walkSpeed: number
}

/**
 * Grant for a trait. A `"<Name> [2024]"` entry replaces the plain entry for 2024
 * characters (an empty `{}` override cancels the plain grant).
 */
export function getTraitGrant(name: string, edition: Edition): TraitGrant | undefined {
  if (edition === '2024') {
    const override = TRAIT_GRANTS[`${name} [2024]`]
    if (override) return override
  }
  return TRAIT_GRANTS[name]
}

/** Species choices (Draconic Ancestry, Fiendish Legacy, ...) the wizard must ask for. */
export function getSpeciesChoiceDefs(speciesSlug: string | undefined): SpeciesChoiceDef[] {
  return (speciesSlug && SPECIES_CHOICES.choices[speciesSlug]) || []
}

function getLineageGrant(speciesSlug: string, lineage: string | undefined): TraitGrant | undefined {
  return lineage ? SPECIES_CHOICES.lineageGrants[speciesSlug]?.[lineage] : undefined
}

const traitsFor = (species: GrantSpecies, variantSlug: string | undefined) => getEffectiveSpeciesTraits(species, variantSlug)

/** Skill/tool picks the species' traits ask the player to make. */
export function getSpeciesPickSlots(
  species: GrantSpecies | undefined,
  edition: Edition,
  variantSlug?: string,
): SpeciesPickSlot[] {
  if (!species) return []
  const slots: SpeciesPickSlot[] = []
  traitsFor(species, variantSlug).forEach(trait => {
    const grant = getTraitGrant(trait, edition)
    if (grant?.skillChoices) {
      slots.push({
        id: `skill:${trait}`, kind: 'skill', trait, count: grant.skillChoices.count,
        options: grant.skillChoices.from ?? ALL_SKILL_NAMES,
      })
    }
    if (grant?.toolChoices) {
      slots.push({ id: `tool:${trait}`, kind: 'tool', trait, count: grant.toolChoices.count, options: grant.toolChoices.from })
    }
  })
  return slots
}

/** Valid picks for one slot: only offered options, no duplicates, no more than `count`. */
export function sanitizePicks(slot: SpeciesPickSlot, picks: string[] | undefined): string[] {
  return Array.from(new Set((picks ?? []).filter(p => slot.options.includes(p)))).slice(0, slot.count)
}

/** Number of extra languages the species lets the player choose. */
export function getSpeciesLanguageChoices(
  species: GrantSpecies | undefined,
  edition: Edition,
  variantSlug?: string,
): number {
  if (!species) return 0
  let count = species.languageChoices ?? 0
  traitsFor(species, variantSlug).forEach(trait => {
    count += getTraitGrant(trait, edition)?.languageChoices ?? 0
  })
  return count
}

/** Human-readable list of what the player still has to decide in Step 2 (empty when complete). */
export function getMissingSpeciesChoices(
  species: GrantSpecies | undefined,
  data: Pick<CharacterCreationData, 'edition' | 'selectedSpeciesVariant' | 'speciesChoices' | 'speciesPicks'>,
): string[] {
  if (!species) return []
  const missing: string[] = []
  getSpeciesChoiceDefs(species.slug).forEach(def => {
    if (!def.options.some(o => o.value === data.speciesChoices?.[def.id])) missing.push(def.label)
  })
  getSpeciesPickSlots(species, data.edition, data.selectedSpeciesVariant).forEach(slot => {
    if (sanitizePicks(slot, data.speciesPicks?.[slot.id]).length < slot.count) {
      missing.push(`${slot.trait} (${slot.kind}s)`)
    }
  })
  return missing
}

/** Combine resolved grants from several sources (species + feats). Pure. */
export function mergeGrants(a: ResolvedGrants, b: ResolvedGrants): ResolvedGrants {
  const out: ResolvedGrants = { ...a, movement: { ...a.movement }, senses: { ...a.senses } }
  const { notes, ...grant } = b
  applyTraitGrant(out, grant, { level: Infinity, walkSpeed: 0 })
  out.notes = union(a.notes, notes)
  return out
}

/** Resolve everything the species grants for the given selections. Pure. */
export function resolveSpeciesGrants(species: GrantSpecies | undefined, ctx: SpeciesGrantContext): ResolvedSpeciesGrants {
  const out = emptyGrants()
  if (!species) return out

  const apply = (grant: TraitGrant | undefined) => applyTraitGrant(out, grant, ctx)

  traitsFor(species, ctx.variantSlug).forEach(trait => apply(getTraitGrant(trait, ctx.edition)))

  getSpeciesChoiceDefs(species.slug).forEach(def => {
    apply(def.options.find(o => o.value === ctx.choices?.[def.id])?.grants)
  })
  apply(getLineageGrant(species.slug, ctx.lineage))

  getSpeciesPickSlots(species, ctx.edition, ctx.variantSlug).forEach(slot => {
    const chosen = sanitizePicks(slot, ctx.picks?.[slot.id])
    if (slot.kind === 'skill') out.skills = union(out.skills, chosen as SkillName[])
    else out.tools = union(out.tools, chosen)
  })

  out.languageChoices += species.languageChoices ?? 0
  return out
}

/**
 * Natural armor AC for a character, or undefined when it has none.
 * Natural armor only applies when armor would give less (or cannot be worn).
 */
export function calculateNaturalArmorClass(
  natural: NaturalArmorGrant | undefined,
  abilityModifiers: Record<AbilityName, number>,
): number | undefined {
  if (!natural) return undefined
  return natural.base + (natural.abilities ?? []).reduce((sum, a) => sum + abilityModifiers[a], 0)
}

/**
 * Movement written on the character: trait grants, plus a swim speed the species record
 * states directly (Bullywug, Merfolk, Kuo-Toa). Shared by creation and level-up.
 */
export function speciesMovement(
  movement: Partial<Record<MovementKind, number>>,
  species: { swimSpeed?: number } | undefined,
): Partial<Record<MovementKind, number>> | undefined {
  const out = { ...movement }
  if (species?.swimSpeed) out.swim = Math.max(out.swim ?? 0, species.swimSpeed)
  return Object.keys(out).length ? out : undefined
}

/**
 * Creation fields that belong to the selected species and must be cleared whenever the
 * species changes (including randomizing), so choices never leak into the next species.
 */
export const SPECIES_CHOICE_RESET: Partial<CharacterCreationData> = {
  selectedSpeciesVariant: undefined,
  selectedLineage: undefined,
  speciesAbilityChoices: undefined,
  speciesChoices: undefined,
  speciesPicks: undefined,
  variantAbilityBonuses: undefined,
  variantSkillProficiency: undefined,
  variantFeat: undefined,
}
