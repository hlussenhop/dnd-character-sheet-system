import type { AbilityName, Edition, Feat, FeatChoiceMap, SkillName } from '../types/dnd'
import { getFeatBySlug } from '../services/dataService'
import { applyTraitGrant, emptyGrants, type ResolvedGrants } from './speciesGrantUtils'

const ALL_SKILL_NAMES: SkillName[] = [
  'Acrobatics', 'AnimalHandling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation',
  'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'SleightOfHand', 'Stealth', 'Survival',
]

/** Key in `featChoices[slug]` for the ability a feat increases (kept from the original choice modal). */
export const FEAT_ABILITY_CHOICE = 'abilityChoice'

/** A pick the player makes for a feat; the choice is stored as `featChoices[featSlug][id]`. */
export interface FeatPickSlot {
  id: 'abilityChoice' | 'skills' | 'tools' | 'resistances' | 'savingThrows'
  label: string
  count: number
  options: string[]
}

/** Picks the feat asks for: which ability it increases, and its skill/tool/resistance/save choices. */
export function getFeatPickSlots(feat: Feat | undefined): FeatPickSlot[] {
  if (!feat) return []
  const slots: FeatPickSlot[] = []
  const asi = feat.abilityScoreIncrease
  if (asi && asi.options.length > asi.choices) {
    slots.push({ id: FEAT_ABILITY_CHOICE, label: `Ability score (+${asi.amount})`, count: asi.choices, options: asi.options })
  }
  const g = feat.grants
  if (g?.skillChoices) {
    slots.push({ id: 'skills', label: 'Skill proficiency', count: g.skillChoices.count, options: g.skillChoices.from ?? ALL_SKILL_NAMES })
  }
  if (g?.toolChoices) {
    slots.push({ id: 'tools', label: 'Tool proficiency', count: g.toolChoices.count, options: g.toolChoices.from })
  }
  if (g?.resistanceChoices) {
    slots.push({ id: 'resistances', label: 'Damage resistance', count: g.resistanceChoices.count, options: g.resistanceChoices.from })
  }
  if (g?.savingThrowChoices) {
    slots.push({ id: 'savingThrows', label: 'Saving throw proficiency', count: g.savingThrowChoices.count, options: g.savingThrowChoices.from })
  }
  return slots
}

/** Valid picks for a slot from stored choices: offered options only, no duplicates, at most `count`. */
export function getFeatPicks(slot: FeatPickSlot, choices: FeatChoiceMap | undefined): string[] {
  const raw = choices?.[slot.id]
  const picks = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  return Array.from(new Set(picks.filter(p => slot.options.includes(p)))).slice(0, slot.count)
}

/** Slots of a feat that still lack picks (empty when the feat is fully chosen). */
export function getMissingFeatPicks(feat: Feat | undefined, choices: FeatChoiceMap | undefined): FeatPickSlot[] {
  return getFeatPickSlots(feat).filter(slot => getFeatPicks(slot, choices).length < slot.count)
}

export interface FeatGrantContext {
  edition: Edition
  level: number
  walkSpeed: number
  featChoices?: Record<string, FeatChoiceMap>
}

/** Everything the feats give the character (fixed grants plus the stored picks). Pure. */
export function resolveFeatGrants(featSlugs: string[], ctx: FeatGrantContext): ResolvedGrants {
  const out = emptyGrants()
  featSlugs.forEach(stored => {
    const feat = getFeatBySlug(stored, ctx.edition)
    if (!feat) return
    applyTraitGrant(out, feat.grants, ctx)
    const choices = ctx.featChoices?.[feat.slug] ?? ctx.featChoices?.[stored]
    getFeatPickSlots(feat).forEach(slot => {
      const picks = getFeatPicks(slot, choices)
      if (slot.id === 'skills') applyTraitGrant(out, { skills: picks as SkillName[] }, ctx)
      if (slot.id === 'tools') applyTraitGrant(out, { tools: picks }, ctx)
      if (slot.id === 'resistances') applyTraitGrant(out, { resistances: picks }, ctx)
      if (slot.id === 'savingThrows') applyTraitGrant(out, { savingThrows: picks as AbilityName[] }, ctx)
    })
  })
  return out
}

/**
 * Ability scores after the feats' increases: single-option increases apply automatically, the rest
 * use the stored ability pick. Each increase respects its feat's cap (20, or 30 for Epic Boons).
 */
export function applyFeatAbilityIncreases(
  scores: Record<AbilityName, number>,
  featSlugs: string[],
  edition: Edition,
  featChoices?: Record<string, FeatChoiceMap>,
): Record<AbilityName, number> {
  const out = { ...scores }
  featSlugs.forEach(stored => {
    const feat = getFeatBySlug(stored, edition)
    const asi = feat?.abilityScoreIncrease
    if (!feat || !asi) return
    const slot = getFeatPickSlots(feat).find(s => s.id === FEAT_ABILITY_CHOICE)
    const chosen = slot
      ? getFeatPicks(slot, featChoices?.[feat.slug] ?? featChoices?.[stored]) as AbilityName[]
      : asi.options
    chosen.forEach(ability => {
      out[ability] = Math.max(out[ability], Math.min(asi.max ?? 20, out[ability] + asi.amount))
    })
  })
  return out
}

/** A group of options the player picks from when taking a feat (rendered by FeatChoiceModal). */
export interface FeatChoiceSection {
  key: string;
  title: string;
  count: number;
  options: Array<{ value: string; label: string }>;
}

const ABILITY_LABELS: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

const label = (value: string) =>
  ABILITY_LABELS[value] ?? value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

const SPECIAL_SECTIONS: Record<string, FeatChoiceSection> = {
  'elemental-adept': {
    key: 'damageType',
    title: 'Damage type your spells ignore resistance to',
    count: 1,
    options: ['acid', 'cold', 'fire', 'lightning', 'thunder'].map(v => ({ value: v, label: label(v) })),
  },
  'metamagic-adept': {
    key: 'metamagicOptions',
    title: 'Metamagic options',
    count: 2,
    options: ['careful-spell', 'distant-spell', 'empowered-spell', 'extended-spell', 'heightened-spell',
      'quickened-spell', 'subtle-spell', 'twinned-spell']
      .map(v => ({ value: v, label: label(v.replace(/-/g, ' ')) })),
  },
};

/** Everything the player must pick for a feat; empty when the feat needs no picks. */
export const getFeatChoiceSections = (feat: Feat | null | undefined): FeatChoiceSection[] => {
  if (!feat) return [];
  const sections: FeatChoiceSection[] = getFeatPickSlots(feat).map(slot => ({
    key: slot.id,
    title: slot.count > 1 ? `${slot.label} (choose ${slot.count})` : slot.label,
    count: slot.count,
    options: slot.options.map(o => ({ value: o, label: label(o) })),
  }));
  const special = SPECIAL_SECTIONS[feat.slug.replace(/-2024$/, '')];
  return special ? [...sections, special] : sections;
};

const sampleValues = (values: string[], count: number): string[] => {
  const pool = [...values];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
};

/** A complete set of picks for every choice the feat asks for. */
export function randomFeatChoices(feat: Feat | null | undefined): FeatChoiceMap {
  const choices: FeatChoiceMap = {};
  getFeatChoiceSections(feat).forEach(section => {
    const values = sampleValues(section.options.map(option => option.value), Math.min(section.count, section.options.length));
    if (values.length === 0) return;
    choices[section.key] = section.count === 1 ? values[0] : values;
  });
  return choices;
}

