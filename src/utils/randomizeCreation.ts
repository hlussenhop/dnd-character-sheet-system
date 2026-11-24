import type {
  AbilityName,
  CharacterCreationData,
  Class,
  Edition,
  Equipment,
  FeatChoiceMap,
  SkillName,
  Species,
} from '../types/dnd'
import type { BranchChoiceConfig, SelectionPoolConfig } from '../types/widgets'
import {
  findSpeciesBySlug,
  getBackground,
  getFeatBySlug,
  loadClasses,
  loadEquipment,
  randomizeAbilities,
  randomizeBackgroundAbilityChoices,
  randomizeClassAndSkills,
  randomizeIdentity,
  randomizeLanguages,
  randomizePersonality,
  randomizeSpecies,
  randomizeStartingEquipment,
  FEAT_DATABASE,
} from '../services/dataService'
import { backgroundFeatSlug, randomBackgroundPicks, toSkillName } from './backgroundUtils'
import { randomFeatChoices } from './featGrantUtils'
import { generateName } from './nameGenerator'
import { getASILevelsForCharacter } from './highLevelCreationUtils'
import { randomOptionalFeatures } from './optionalFeatures'
import { randomSpellSelection } from './spellUtils'
import { buildAbilityChoiceSelection, getChoosableAbilities, getSpeciesAbilityRules } from './speciesAbilityUtils'
import { getSpeciesChoiceDefs, getSpeciesPickSlots } from './speciesGrantUtils'
import { getVariantPickerOptions } from './speciesVariantUtils'

const ABILITIES: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const SKILLS: SkillName[] = [
  'Acrobatics', 'AnimalHandling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation',
  'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'SleightOfHand', 'Stealth', 'Survival',
]
const HUMAN_VARIANT_FEATS = ['Alert', 'Lucky', 'Resilient', 'Skilled', 'War Caster', 'Elemental Adept', 'Spell Sniper']

const draw = <T>(items: T[], count: number): T[] => {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.max(0, count))
}

const pick = <T>(items: T[]): T => draw(items, 1)[0]

const rememberFeat = (bag: Record<string, FeatChoiceMap>, slug: string | undefined, edition: Edition) => {
  const feat = slug ? getFeatBySlug(slug, edition) : undefined
  if (!feat) return
  const choices = randomFeatChoices(feat)
  if (Object.keys(choices).length > 0) bag[feat.slug] = choices
}

/** Background, its picks, its ability increases, and any choices its origin feat asks for. */
export function randomBackgroundPatch(
  backgroundSlug: string,
  edition: Edition,
): Partial<CharacterCreationData> {
  const background = getBackground(backgroundSlug)
  const picks = background ? randomBackgroundPicks(background) : {}
  const featSlug = background ? backgroundFeatSlug(background, picks) : undefined
  const featChoices: Record<string, FeatChoiceMap> = {}
  rememberFeat(featChoices, featSlug, edition)
  return {
    background: backgroundSlug,
    ...picks,
    backgroundAbilityChoices: randomizeBackgroundAbilityChoices(backgroundSlug, edition),
    featChoices,
  }
}

const clearedSpeciesChoices = (): Partial<CharacterCreationData> => ({
  selectedSpeciesVariant: undefined,
  selectedLineage: undefined,
  speciesAbilityChoices: undefined,
  speciesChoices: undefined,
  speciesPicks: undefined,
  variantAbilityBonuses: undefined,
  variantSkillProficiency: undefined,
  variantFeat: undefined,
  speciesFeat: undefined,
  humanOriginFeat: undefined,
  humanVersatileFeat: undefined,
})

/** Every species choice the creation step requires for this species. */
export function randomSpeciesSelections(
  species: Species | undefined,
  edition: Edition,
  unavailableSkills: string[] = [],
): Partial<CharacterCreationData> {
  const patch = clearedSpeciesChoices()
  if (!species) return patch
  const featChoices: Record<string, FeatChoiceMap> = {}

  const variants = getVariantPickerOptions(species, edition)
  if (variants?.length) patch.selectedSpeciesVariant = pick(variants).slug
  if (species.slug === 'human' && edition === '2014') {
    patch.selectedSpeciesVariant = Math.random() < 0.5 ? 'standard' : 'variant'
    if (patch.selectedSpeciesVariant === 'variant') {
      const [first, second] = draw(ABILITIES, 2)
      patch.variantAbilityBonuses = { [first]: 1, [second]: 1 } as Record<AbilityName, number>
      patch.variantSkillProficiency = pick(SKILLS)
      patch.variantFeat = pick(HUMAN_VARIANT_FEATS)
    }
  }

  const rules = getSpeciesAbilityRules(species, patch.selectedSpeciesVariant)
  if (edition === '2014' && species.slug !== 'human' && rules.choice) {
    const allowed = getChoosableAbilities(rules.choice, rules.fixed)
    const patterns = rules.choice.patterns.filter(pattern => pattern.length <= allowed.length)
    const pattern = pick(patterns.length ? patterns : rules.choice.patterns)
    patch.speciesAbilityChoices = buildAbilityChoiceSelection(pattern, draw(allowed, pattern.length))
  }

  if (edition === '2024' && species.lineages && Object.keys(species.lineages).length > 0) {
    patch.selectedLineage = pick(Object.keys(species.lineages))
  }
  if (edition === '2024' && species.speciesFeatOptions?.length) {
    patch.speciesFeat = pick(species.speciesFeatOptions)
    rememberFeat(featChoices, patch.speciesFeat, edition)
  }
  if (species.slug === 'human-2024' && edition === '2024') {
    const origins = FEAT_DATABASE.filter(feat => feat.category === 'origin' && feat.edition === '2024')
    const origin = origins.length ? pick(origins) : undefined
    patch.humanOriginFeat = origin?.slug
    rememberFeat(featChoices, origin?.slug, edition)
    if (origin?.slug === 'versatile') {
      const rest = origins.filter(feat => feat.slug !== 'versatile')
      patch.humanVersatileFeat = rest.length ? pick(rest).slug : undefined
      rememberFeat(featChoices, patch.humanVersatileFeat, edition)
    }
  }

  const speciesChoices: Record<string, string> = {}
  getSpeciesChoiceDefs(species.slug).forEach(def => {
    if (def.options.length) speciesChoices[def.id] = pick(def.options).value
  })
  if (Object.keys(speciesChoices).length) patch.speciesChoices = speciesChoices

  const blocked = new Set(unavailableSkills.flatMap(skill => [skill, toSkillName(skill) ?? '']))
  const speciesPicks: Record<string, string[]> = {}
  getSpeciesPickSlots(species, edition, patch.selectedSpeciesVariant).forEach(slot => {
    const options = slot.kind === 'skill' ? slot.options.filter(option => !blocked.has(option)) : slot.options
    const pool = options.length >= slot.count ? options : slot.options
    speciesPicks[slot.id] = draw(pool, slot.count)
  })
  if (Object.keys(speciesPicks).length) patch.speciesPicks = speciesPicks

  if (Object.keys(featChoices).length) patch.featChoices = featChoices
  return patch
}

const proficientMasteryWeapons = (edition: Edition, classSlug: string, filter: string): string[] => {
  const slug = classSlug.toLowerCase()
  const melee = (weapon: Equipment) => {
    const properties = weapon.properties?.map(property => property.index) ?? []
    return weapon.weapon_range !== 'Ranged' && !properties.includes('ammunition')
  }
  return loadEquipment()
    .filter(item => String(item.year) === edition && item.equipment_category === 'Weapon')
    .filter(weapon => {
      if (filter === 'proficient_melee_weapons' && !melee(weapon)) return false
      const properties = weapon.properties?.map(property => property.index) ?? []
      if (weapon.weapon_category === 'Simple') return true
      if (weapon.weapon_category !== 'Martial') return false
      if (['fighter', 'paladin', 'barbarian', 'ranger'].includes(slug)) return true
      if (slug === 'rogue') return properties.includes('finesse') || properties.includes('light')
      if (slug === 'bard') return ['rapier', 'longsword', 'shortsword', 'scimitar'].includes(weapon.index)
      return false
    })
    .map(weapon => weapon.index)
}

/** Level-1 class widgets: orders, expertise, weapon mastery, and bard instruments. */
export function randomClassLevel1Choices(
  classData: Class | undefined,
  edition: Edition,
  skillIds: string[],
): Partial<CharacterCreationData> {
  const patch: Partial<CharacterCreationData> = {
    divineOrder: undefined,
    primalOrder: undefined,
    pactBoon: undefined,
    expertiseSkills: [],
    weaponMastery: [],
    selectedMusicalInstruments: [],
  }
  if (!classData) return patch
  const instrumentCount = classData.num_instrument_choices ?? 0
  if (instrumentCount > 0 && classData.musical_instrument_proficiencies?.length) {
    patch.selectedMusicalInstruments = draw(classData.musical_instrument_proficiencies, instrumentCount)
  }
  for (const feature of classData.level_1_features ?? []) {
    if (feature.widget_type === 'branch_choice') {
      const options = (feature.widget_config as BranchChoiceConfig).options ?? []
      const id = options.length ? pick(options).id : undefined
      if (feature.id === 'divine_order') patch.divineOrder = id as CharacterCreationData['divineOrder']
      if (feature.id === 'primal_order') patch.primalOrder = id as CharacterCreationData['primalOrder']
      if (feature.id === 'pact_boon') patch.pactBoon = id as CharacterCreationData['pactBoon']
    }
    if (feature.widget_type !== 'selection_pool') continue
    const config = feature.widget_config as SelectionPoolConfig
    if (config.source === 'skills' || config.source === 'skills_and_tools') {
      patch.expertiseSkills = draw([...new Set([...skillIds, ...(config.include_tools ?? [])])], config.count)
    }
    if (config.source === 'weapons') {
      patch.weaponMastery = draw(proficientMasteryWeapons(edition, classData.slug, config.filter), config.count)
    }
  }
  return patch
}

const blankAllocations = (): Record<AbilityName, number> => ({ STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 })

/** +2 on one ability for every ability-score improvement this level grants. */
export function randomCumulativeASI(classSlug: string, edition: Edition, level: number): CharacterCreationData['cumulativeASI'] {
  return getASILevelsForCharacter(classSlug, edition, level).map(asiLevel => {
    const asiAllocations = blankAllocations()
    asiAllocations[pick(ABILITIES)] = 2
    return { level: asiLevel, type: 'asi' as const, asiAllocations }
  })
}

/**
 * A complete random character for the ruleset and level already chosen.
 * Later wizard steps should have nothing left that the player is required to pick.
 */
export function randomizeEntireCharacter(
  input: Pick<CharacterCreationData, 'level' | 'edition'>,
): Partial<CharacterCreationData> {
  const edition = input.edition
  const level = input.level
  const speciesSlug = randomizeSpecies(edition)
  const species = findSpeciesBySlug(speciesSlug)
  const identity = randomizeIdentity(speciesSlug, edition)
  const backgroundSlug = identity.backgroundSlug || identity.background
  const background = randomBackgroundPatch(backgroundSlug, edition)
  const classAndSkills = randomizeClassAndSkills(edition)
  const classData = loadClasses(edition).find(entry => entry.slug === classAndSkills.classSlug)
  const level1 = randomClassLevel1Choices(classData, edition, classAndSkills.selectedSkills)
  const options = randomOptionalFeatures(
    classAndSkills.classSlug,
    edition,
    level,
    classAndSkills.subclassSlug,
    level1.pactBoon,
  )
  const abilities = randomizeAbilities()
  const speciesChoices = randomSpeciesSelections(species, edition, background.backgroundSkills ?? [])
  const { featChoices: speciesFeatChoices, ...speciesFields } = speciesChoices
  const { featChoices: backgroundFeatChoices, ...backgroundFields } = background
  const featChoices = { ...(backgroundFeatChoices ?? {}), ...(speciesFeatChoices ?? {}) }
  const spells = randomSpellSelection(
    classAndSkills.classSlug,
    level,
    edition,
    abilities.abilities as Record<AbilityName, number>,
    backgroundSlug,
    classAndSkills.subclassSlug,
    { divineOrder: level1.divineOrder, primalOrder: level1.primalOrder },
  )
  const equipment = randomizeStartingEquipment(classAndSkills.classSlug, backgroundSlug, edition)

  return {
    alignment: identity.alignment,
    ...backgroundFields,
    name: generateName({ race: speciesSlug, classSlug: classAndSkills.classSlug }).name,
    speciesSlug,
    ...clearedSpeciesChoices(),
    ...speciesFields,
    featChoices,
    ...classAndSkills,
    ...level1,
    ...options,
    spellSelection: spells,
    ...abilities,
    selectedFeats: [],
    equipmentChoices: equipment.equipmentChoices,
    equipmentChoice: equipment.equipmentChoice,
    equipmentGold: equipment.equipmentGold,
    startingInventory: equipment.startingInventory,
    knownLanguages: randomizeLanguages(
      speciesSlug,
      backgroundSlug,
      edition,
      abilities.abilities as Record<AbilityName, number>,
    ),
    ...randomizePersonality(),
    cumulativeASI: randomCumulativeASI(classAndSkills.classSlug, edition, level),
  }
}
