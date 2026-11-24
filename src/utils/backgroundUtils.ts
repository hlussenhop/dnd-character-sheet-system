import type { Background, BackgroundChoice, BackgroundToolPackage, CharacterCreationData, SkillName } from '../types/dnd'

/** Skill names as the background data writes them ("Sleight of Hand", "Animal Handling"). */
export const SKILL_LABELS: Record<SkillName, string> = {
  Acrobatics: 'Acrobatics',
  AnimalHandling: 'Animal Handling',
  Arcana: 'Arcana',
  Athletics: 'Athletics',
  Deception: 'Deception',
  History: 'History',
  Insight: 'Insight',
  Intimidation: 'Intimidation',
  Investigation: 'Investigation',
  Medicine: 'Medicine',
  Nature: 'Nature',
  Perception: 'Perception',
  Performance: 'Performance',
  Persuasion: 'Persuasion',
  Religion: 'Religion',
  SleightOfHand: 'Sleight of Hand',
  Stealth: 'Stealth',
  Survival: 'Survival',
}

const compact = (label: string) => label.toLowerCase().replace(/[^a-z]/g, '')
const SKILL_BY_LABEL = new Map<string, SkillName>(
  (Object.keys(SKILL_LABELS) as SkillName[]).map(skill => [compact(SKILL_LABELS[skill]), skill]),
)

/** "Sleight of Hand" and "SleightOfHand" both become the character's skill key. */
export const toSkillName = (label: string): SkillName | undefined => SKILL_BY_LABEL.get(compact(label))

export const skillChoiceOptions = (choice: BackgroundChoice): string[] =>
  choice.from ?? Object.values(SKILL_LABELS)

const picksIn = (choice: BackgroundChoice, selected: string[]): string[] => {
  const options = choice.from
  const valid = selected.filter(pick => !options || options.includes(pick))
  return Array.from(new Set(valid)).slice(0, choice.count)
}

/**
 * Split a flat list of chosen tools across choice groups. A tool counts toward the first group
 * that offers it and still needs a pick.
 */
export const assignToolPicks = (groups: BackgroundChoice[], selected: string[] | undefined): string[][] => {
  const used = new Set<number>()
  return groups.map(group => {
    const picks: string[] = []
    ;(selected ?? []).forEach((pick, index) => {
      if (used.has(index) || picks.length >= group.count) return
      if (!group.from || group.from.includes(pick)) {
        used.add(index)
        picks.push(pick)
      }
    })
    return picks
  })
}

export const selectedToolPackage = (
  background: Background,
  packageLabel: string | undefined,
): BackgroundToolPackage | undefined =>
  background.toolPackages?.find(pack => pack.label === packageLabel)

/** Skills the background grants: the fixed list plus the skills the player chose. */
export const grantedBackgroundSkills = (
  background: Background | undefined,
  data: Pick<CharacterCreationData, 'backgroundSkills'>,
): string[] => {
  if (!background) return []
  const chosen = background.skillChoices ? picksIn(background.skillChoices, data.backgroundSkills ?? []) : []
  return [...background.skill_proficiencies, ...chosen]
}

/** Tools the background grants, including the chosen package and the chosen tools. */
export const grantedBackgroundTools = (
  background: Background | undefined,
  data: Pick<CharacterCreationData, 'backgroundTools' | 'backgroundToolPackage'>,
): string[] => {
  if (!background) return []
  const pack = selectedToolPackage(background, data.backgroundToolPackage)
  if (background.toolPackages?.length) {
    if (!pack) return []
    const chosen = assignToolPicks(pack.choices ?? [], data.backgroundTools).flat()
    return [...pack.tools, ...chosen]
  }
  const chosen = assignToolPicks(background.toolChoices ?? [], data.backgroundTools).flat()
  return [...(background.tool_proficiencies ?? []), ...chosen]
}

/** The feat this background gives: the player's pick when the background offers a choice. */
export const backgroundFeatSlug = (
  background: Background | undefined,
  data: Pick<CharacterCreationData, 'backgroundFeat'>,
): string | undefined => {
  if (!background) return undefined
  if (background.originFeatOptions?.length) {
    return background.originFeatOptions.includes(data.backgroundFeat ?? '') ? data.backgroundFeat : undefined
  }
  return background.originFeat
}

/** What Step 1 still needs before the background is fully chosen. */
export const missingBackgroundPicks = (background: Background, data: CharacterCreationData): string[] => {
  const missing: string[] = []
  if (background.skillChoices) {
    const chosen = picksIn(background.skillChoices, data.backgroundSkills ?? [])
    if (chosen.length < background.skillChoices.count) missing.push('Background skill choices')
  }
  if (background.toolPackages?.length) {
    const pack = selectedToolPackage(background, data.backgroundToolPackage)
    if (!pack) {
      missing.push('Background tool package')
    } else if (assignToolPicks(pack.choices ?? [], data.backgroundTools).some((picks, i) => picks.length < (pack.choices?.[i].count ?? 0))) {
      missing.push('Background tool choices')
    }
  } else if (background.toolChoices?.length) {
    const short = assignToolPicks(background.toolChoices, data.backgroundTools)
      .some((picks, i) => picks.length < background.toolChoices![i].count)
    if (short) missing.push('Background tool choices')
  }
  if (background.originFeatOptions?.length && !backgroundFeatSlug(background, data)) {
    missing.push('Background feat')
  }
  return missing
}

const sample = <T>(items: T[], count: number): T[] => {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

/** Random valid picks for a background, so Randomize leaves the step complete. */
export const randomBackgroundPicks = (
  background: Background,
): Pick<CharacterCreationData, 'backgroundSkills' | 'backgroundTools' | 'backgroundToolPackage' | 'backgroundFeat'> => {
  const skills = background.skillChoices
    ? sample(skillChoiceOptions(background.skillChoices), background.skillChoices.count)
    : []
  const pack = background.toolPackages?.length
    ? background.toolPackages[Math.floor(Math.random() * background.toolPackages.length)]
    : undefined
  const groups = pack?.choices ?? background.toolChoices ?? []
  const tools = groups.flatMap(group => sample(group.from ?? [], group.count))
  return {
    backgroundSkills: skills,
    backgroundTools: tools,
    backgroundToolPackage: pack?.label,
    backgroundFeat: background.originFeatOptions?.[0],
  }
}
