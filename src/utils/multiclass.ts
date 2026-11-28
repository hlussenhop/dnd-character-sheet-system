/**
 * Multiclassing rules: class entries, prerequisites, proficiencies gained from a new class,
 * shared spell slots and hit dice by die size.
 *
 * `Character.class`, `classSlug` and `subclass` stay the starting class and `Character.level`
 * stays the total level, so single-class code keeps working. `Character.classes` lists every
 * class once a character multiclasses.
 */

import type { AbilityName, Character, CharacterClassEntry, Class, Edition, SkillName } from '../types/dnd';
import { getHitDieForClass, getSpellsForClass, loadClasses, type AppSpell } from '../services/dataService';
import { SPELL_SLOTS_BY_CLASS } from '../data/spellSlots';
import { normalizeSpellSlots } from './spellSlotUtils';
import { asList, asNumberList } from './normalizeCharacter';

export const MULTICLASS_MIN_SCORE = 13;

const slugOf = (value: string | undefined | null): string =>
  (value ?? '').toLowerCase().trim().replace(/\s+/g, '-');

export const primaryClassSlug = (character: Pick<Character, 'class' | 'classSlug'>): string =>
  slugOf(character.classSlug || character.class);

export function findClassData(classSlug: string, edition: Edition): Class | undefined {
  const slug = slugOf(classSlug);
  const all = loadClasses();
  return all.find(cls => cls.slug === slug && cls.edition === edition) ?? all.find(cls => cls.slug === slug);
}

const titleCase = (slug: string): string =>
  slug.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

/**
 * Every class the character has levels in, starting class first. Single-class characters get
 * one entry built from `class` / `level` / `subclass`.
 */
export function getClassEntries(character: Character): CharacterClassEntry[] {
  const primary = primaryClassSlug(character);
  const stored = asList<CharacterClassEntry>(character.classes)
    .filter(entry => entry && entry.classSlug && entry.level > 0)
    .map(entry => ({ ...entry, classSlug: slugOf(entry.classSlug) }));

  if (stored.length === 0) {
    return [{
      class: character.class,
      classSlug: primary,
      level: Math.max(1, character.level || 1),
      subclass: character.subclass ?? null,
      hitDie: character.hitDice?.dieType || getHitDieForClass(primary),
    }];
  }

  const entries = stored.map(entry =>
    entry.classSlug === primary ? { ...entry, subclass: character.subclass ?? entry.subclass ?? null } : entry,
  );

  // Manual edits change `level` without touching `classes`; the starting class absorbs the gap.
  const sum = entries.reduce((total, entry) => total + entry.level, 0);
  const gap = (character.level || sum) - sum;
  if (gap !== 0) {
    const index = Math.max(0, entries.findIndex(entry => entry.classSlug === primary));
    entries[index] = { ...entries[index], level: Math.max(1, entries[index].level + gap) };
  }
  return entries;
}

export const isMulticlassed = (character: Character): boolean => getClassEntries(character).length > 1;

export function classLevelOf(character: Character, classSlug: string): number {
  const slug = slugOf(classSlug);
  return getClassEntries(character).find(entry => entry.classSlug === slug)?.level ?? 0;
}

/** "Fighter 3 / Wizard 2" for multiclass characters, the class name otherwise. */
export function formatClassSummary(character: Character): string {
  const entries = getClassEntries(character);
  if (entries.length < 2) return character.class;
  return entries.map(entry => `${entry.class} ${entry.level}`).join(' / ');
}

/** "Fighter 5" or "Fighter 3 / Wizard 2". */
export function formatClassAndLevel(character: Character): string {
  const entries = getClassEntries(character);
  if (entries.length < 2) return `${character.class} ${character.level}`;
  return formatClassSummary(character);
}

/** Whether any of the character's casting classes prepares spells. */
export function hasPreparedCasting(character: Character): boolean {
  const casting = character.spellcasting;
  if (!casting) return false;
  if (casting.spellcastingType === 'prepared') return true;
  return asList<{ spellcastingType: string }>(casting.classCasting).some(item => item.spellcastingType === 'prepared');
}

/** The character seen as a single member of one of its classes (class level, that class's subclass). */
export function projectCharacterForClass(character: Character, classSlug: string): Character {
  const slug = slugOf(classSlug);
  const entry = getClassEntries(character).find(item => item.classSlug === slug);
  const name = entry?.class ?? findClassData(slug, character.edition)?.name ?? titleCase(slug);
  return {
    ...character,
    class: name,
    classSlug: slug,
    level: entry?.level ?? 0,
    subclass: entry?.subclass ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

interface AbilityRequirement {
  all?: AbilityName[];
  any?: AbilityName[];
}

/** Ability scores of 13 needed to multiclass into or out of a class (same in 2014 and 2024). */
export const MULTICLASS_PREREQUISITES: Record<string, AbilityRequirement> = {
  artificer: { all: ['INT'] },
  barbarian: { all: ['STR'] },
  bard: { all: ['CHA'] },
  cleric: { all: ['WIS'] },
  druid: { all: ['WIS'] },
  fighter: { any: ['STR', 'DEX'] },
  monk: { all: ['DEX', 'WIS'] },
  paladin: { all: ['STR', 'CHA'] },
  ranger: { all: ['DEX', 'WIS'] },
  rogue: { all: ['DEX'] },
  sorcerer: { all: ['CHA'] },
  warlock: { all: ['CHA'] },
  wizard: { all: ['INT'] },
};

export function describeMulticlassPrerequisite(classSlug: string): string {
  const requirement = MULTICLASS_PREREQUISITES[slugOf(classSlug)];
  if (!requirement) return 'None';
  if (requirement.any) return requirement.any.map(ability => `${ability} ${MULTICLASS_MIN_SCORE}`).join(' or ');
  return (requirement.all ?? []).map(ability => `${ability} ${MULTICLASS_MIN_SCORE}`).join(' and ');
}

export function meetsMulticlassPrerequisite(character: Character, classSlug: string): boolean {
  const requirement = MULTICLASS_PREREQUISITES[slugOf(classSlug)];
  if (!requirement) return true;
  const score = (ability: AbilityName) => character.abilities?.[ability]?.score ?? 0;
  if (requirement.any) return requirement.any.some(ability => score(ability) >= MULTICLASS_MIN_SCORE);
  return (requirement.all ?? []).every(ability => score(ability) >= MULTICLASS_MIN_SCORE);
}

export interface MulticlassEligibility {
  eligible: boolean;
  reasons: string[];
}

/** Whether the character may take a first level in a new class. Both the new and the current classes' prerequisites apply. */
export function multiclassEligibility(character: Character, classSlug: string): MulticlassEligibility {
  const slug = slugOf(classSlug);
  const entries = getClassEntries(character);
  const reasons: string[] = [];

  if (entries.some(entry => entry.classSlug === slug)) {
    return { eligible: false, reasons: ['Already has levels in this class'] };
  }
  if (character.level >= 20) {
    return { eligible: false, reasons: ['Already level 20'] };
  }
  if (!meetsMulticlassPrerequisite(character, slug)) {
    reasons.push(`Needs ${describeMulticlassPrerequisite(slug)}`);
  }
  entries.forEach(entry => {
    if (!meetsMulticlassPrerequisite(character, entry.classSlug)) {
      reasons.push(`${entry.class} needs ${describeMulticlassPrerequisite(entry.classSlug)}`);
    }
  });
  return { eligible: reasons.length === 0, reasons };
}

/** Classes a character could add, with eligibility, for the chosen edition. */
export function multiclassOptions(character: Character): Array<{ cls: Class; eligibility: MulticlassEligibility }> {
  const owned = new Set(getClassEntries(character).map(entry => entry.classSlug));
  return loadClasses(character.edition)
    .filter(cls => !owned.has(cls.slug) && MULTICLASS_PREREQUISITES[cls.slug])
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(cls => ({ cls, eligibility: multiclassEligibility(character, cls.slug) }));
}

// ---------------------------------------------------------------------------
// Proficiencies gained from a new class
// ---------------------------------------------------------------------------

export interface MulticlassProficiencies {
  armor: string[];
  weapons: string[];
  tools: string[];
  /** Skills chosen from the class's skill list */
  skills: number;
  /** Musical instruments of choice */
  instruments: number;
}

const grant = (partial: Partial<MulticlassProficiencies>): MulticlassProficiencies => ({
  armor: [], weapons: [], tools: [], skills: 0, instruments: 0, ...partial,
});

const LIGHT_MEDIUM_SHIELDS = ['Light Armor', 'Medium Armor', 'Shields'];

const MULTICLASS_PROFICIENCIES: Record<Edition, Record<string, MulticlassProficiencies>> = {
  '2014': {
    artificer: grant({ armor: LIGHT_MEDIUM_SHIELDS, tools: ["Thieves' Tools", "Tinker's Tools"] }),
    barbarian: grant({ armor: ['Shields'], weapons: ['Simple Weapons', 'Martial Weapons'] }),
    bard: grant({ armor: ['Light Armor'], skills: 1, instruments: 1 }),
    cleric: grant({ armor: LIGHT_MEDIUM_SHIELDS }),
    druid: grant({ armor: LIGHT_MEDIUM_SHIELDS }),
    fighter: grant({ armor: LIGHT_MEDIUM_SHIELDS, weapons: ['Simple Weapons', 'Martial Weapons'] }),
    monk: grant({ weapons: ['Simple Weapons', 'Shortswords'] }),
    paladin: grant({ armor: LIGHT_MEDIUM_SHIELDS, weapons: ['Simple Weapons', 'Martial Weapons'] }),
    ranger: grant({ armor: LIGHT_MEDIUM_SHIELDS, weapons: ['Simple Weapons', 'Martial Weapons'], skills: 1 }),
    rogue: grant({ armor: ['Light Armor'], tools: ["Thieves' Tools"], skills: 1 }),
    sorcerer: grant({}),
    warlock: grant({ armor: ['Light Armor'], weapons: ['Simple Weapons'] }),
    wizard: grant({}),
  },
  '2024': {
    artificer: grant({ armor: LIGHT_MEDIUM_SHIELDS, tools: ["Thieves' Tools", "Tinker's Tools"] }),
    barbarian: grant({ armor: ['Shields'], weapons: ['Martial Weapons'] }),
    bard: grant({ armor: ['Light Armor'], skills: 1, instruments: 1 }),
    cleric: grant({ armor: LIGHT_MEDIUM_SHIELDS }),
    druid: grant({ armor: ['Light Armor', 'Shields'] }),
    fighter: grant({ armor: LIGHT_MEDIUM_SHIELDS, weapons: ['Martial Weapons'] }),
    monk: grant({ weapons: ['Martial Weapons (Light)'] }),
    paladin: grant({ armor: LIGHT_MEDIUM_SHIELDS, weapons: ['Martial Weapons'] }),
    ranger: grant({ armor: LIGHT_MEDIUM_SHIELDS, weapons: ['Martial Weapons'], skills: 1 }),
    rogue: grant({ armor: ['Light Armor'], tools: ["Thieves' Tools"], skills: 1 }),
    sorcerer: grant({}),
    warlock: grant({ armor: ['Light Armor'] }),
    wizard: grant({}),
  },
};

export function multiclassProficiencies(classSlug: string, edition: Edition): MulticlassProficiencies {
  return MULTICLASS_PROFICIENCIES[edition]?.[slugOf(classSlug)] ?? grant({});
}

/** Skill keys on Character.skills, from class list names such as "Animal Handling". */
export function classSkillOptions(classSlug: string, edition: Edition): SkillName[] {
  const options = findClassData(classSlug, edition)?.skill_proficiencies ?? [];
  return [...new Set(options.map(name => name.replace(/[^A-Za-z]/g, '') as SkillName))];
}

export function classInstrumentOptions(classSlug: string, edition: Edition): string[] {
  return findClassData(classSlug, edition)?.musical_instrument_proficiencies ?? [];
}

// ---------------------------------------------------------------------------
// Spellcasting
// ---------------------------------------------------------------------------

export type CasterProgression = 'full' | 'half' | 'half-up' | 'third' | 'pact' | 'none';

const FULL_CASTERS = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);
const THIRD_CASTER_SUBCLASSES: Record<string, RegExp> = {
  fighter: /^eldritch-knight/,
  rogue: /^arcane-trickster/,
};

export function casterProgression(entry: Pick<CharacterClassEntry, 'classSlug' | 'subclass'>, edition: Edition): CasterProgression {
  const slug = slugOf(entry.classSlug);
  if (FULL_CASTERS.has(slug)) return 'full';
  if (slug === 'warlock') return 'pact';
  if (slug === 'artificer') return 'half-up';
  if (slug === 'paladin' || slug === 'ranger') return edition === '2024' ? 'half-up' : 'half';
  const third = THIRD_CASTER_SUBCLASSES[slug];
  if (third && entry.subclass && third.test(entry.subclass)) return 'third';
  return 'none';
}

/** Levels this class adds to the multiclass spellcaster level. */
export function casterLevelContribution(progression: CasterProgression, classLevel: number): number {
  switch (progression) {
    case 'full': return classLevel;
    case 'half': return Math.floor(classLevel / 2);
    case 'half-up': return Math.ceil(classLevel / 2);
    case 'third': return Math.floor(classLevel / 3);
    default: return 0;
  }
}

const FULL_CASTER_TABLE = SPELL_SLOTS_BY_CLASS.wizard;

const emptySlots = () => new Array(10).fill(0) as number[];

/**
 * Slot maxima for a multiclass character (index 1 = 1st level). One slot-casting class uses its
 * own table; two or more use the multiclass spellcaster table. Warlock Pact Magic slots are
 * added on top. Returns null for single-class characters, whose slots come from their class table.
 */
export function multiclassSpellSlots(character: Character): number[] | null {
  const entries = getClassEntries(character);
  if (entries.length < 2) return null;

  const casters = entries
    .map(entry => ({ entry, progression: casterProgression(entry, character.edition) }))
    .filter(({ entry, progression }) => progression !== 'pact' && casterLevelContribution(progression, entry.level) > 0);

  let slots = emptySlots();
  if (casters.length === 1) {
    const { entry, progression } = casters[0];
    if (progression === 'third') {
      slots = normalizeSpellSlots('wizard', FULL_CASTER_TABLE[Math.ceil(entry.level / 3)]);
    } else {
      slots = normalizeSpellSlots(entry.classSlug, SPELL_SLOTS_BY_CLASS[entry.classSlug]?.[entry.level]);
    }
  } else if (casters.length > 1) {
    const casterLevel = Math.min(20, casters.reduce(
      (total, { entry, progression }) => total + casterLevelContribution(progression, entry.level), 0,
    ));
    slots = normalizeSpellSlots('wizard', FULL_CASTER_TABLE[casterLevel]);
  }

  const warlock = entries.find(entry => casterProgression(entry, character.edition) === 'pact');
  if (warlock) {
    const pact = normalizeSpellSlots('warlock', SPELL_SLOTS_BY_CLASS.warlock?.[warlock.level]);
    slots = slots.map((count, level) => count + (pact[level] ?? 0));
  }
  return slots;
}

/** Whether a class casts spells at the given class level (Paladin and Ranger start at 2 in the class data). */
export function classCastsAtLevel(classSlug: string, classLevel: number, edition: Edition, subclass?: string | null): boolean {
  const progression = casterProgression({ classSlug, subclass }, edition);
  if (progression === 'none') return false;
  if (progression === 'third') return classLevel >= 3;
  const start = findClassData(classSlug, edition)?.spellcasting?.level ?? 1;
  return classLevel >= start;
}

type CastingType = 'known' | 'prepared' | 'wizard';

export function classCastingType(classSlug: string, edition: Edition): CastingType {
  const type = findClassData(classSlug, edition)?.spellcasting?.type;
  if (type === 'prepared' || type === 'wizard') return type;
  return 'known';
}

export function classCastingAbility(classSlug: string, edition: Edition): 'INT' | 'WIS' | 'CHA' {
  if (THIRD_CASTER_SUBCLASSES[slugOf(classSlug)]) return 'INT';
  return findClassData(classSlug, edition)?.spellcasting?.ability ?? 'INT';
}

export interface ClassCastingStats {
  classSlug: string;
  className: string;
  ability: 'INT' | 'WIS' | 'CHA';
  spellcastingType: CastingType;
  classLevel: number;
  spellSaveDC: number;
  spellAttackBonus: number;
}

/** Spellcasting stats per casting class. Empty for single-class characters. */
export function classCastingStats(character: Character): ClassCastingStats[] {
  const entries = getClassEntries(character);
  if (entries.length < 2 || !character.spellcasting) return [];
  const listed = asList<NonNullable<NonNullable<Character['spellcasting']>['classCasting']>[number]>(
    character.spellcasting.classCasting,
  );
  return listed.map(item => {
    const modifier = character.abilities?.[item.ability]?.modifier ?? 0;
    return {
      ...item,
      classLevel: entries.find(entry => entry.classSlug === item.classSlug)?.level ?? 0,
      spellSaveDC: 8 + character.proficiencyBonus + modifier,
      spellAttackBonus: character.proficiencyBonus + modifier,
    };
  });
}

/** The class whose prepared list the Prepare dialog edits, with its class level. */
export function preparedCasterClass(character: Character): { classSlug: string; className: string; classLevel: number; ability: 'INT' | 'WIS' | 'CHA' } | null {
  const stats = classCastingStats(character);
  const prepared = stats.find(item => item.spellcastingType === 'prepared') ?? stats.find(item => item.spellcastingType === 'wizard');
  if (prepared) {
    return { classSlug: prepared.classSlug, className: prepared.className, classLevel: prepared.classLevel, ability: prepared.ability };
  }
  if (!character.spellcasting) return null;
  return {
    classSlug: primaryClassSlug(character),
    className: character.class,
    classLevel: character.level,
    ability: character.spellcasting.ability,
  };
}

/** Spells the Prepare dialog offers: the preparing class's list, with that class's subclass extras. */
export function preparableSpells(character: Character): AppSpell[] {
  const preparer = preparedCasterClass(character);
  const view = preparer ? projectCharacterForClass(character, preparer.classSlug) : character;
  const className = isMulticlassed(character) ? view.class : character.class;
  return getSpellsForClass(className, character.edition, character.background, view.subclass || undefined);
}

// ---------------------------------------------------------------------------
// Hit dice
// ---------------------------------------------------------------------------

export interface HitDiePool {
  die: number;
  max: number;
  current: number;
}

/** Hit dice by size, largest first. Single-class characters have one pool. */
export function hitDicePools(character: Character): HitDiePool[] {
  const entries = getClassEntries(character);
  const maxByDie = new Map<number, number>();
  entries.forEach(entry => maxByDie.set(entry.hitDie, (maxByDie.get(entry.hitDie) ?? 0) + entry.level));
  const dice = [...maxByDie.keys()].sort((left, right) => right - left);

  if (dice.length < 2) {
    const die = dice[0] ?? character.hitDice?.dieType ?? 8;
    return [{ die, max: character.hitDice?.max ?? character.level, current: character.hitDice?.current ?? character.level }];
  }

  const stored = character.hitDice?.pools;
  if (stored) {
    return dice.map(die => {
      const max = maxByDie.get(die) ?? 0;
      const current = stored[`d${die}`]?.current;
      return { die, max, current: Math.max(0, Math.min(max, current ?? max)) };
    });
  }

  // No per-die record yet: assume any spent dice were the smallest.
  let remaining = character.hitDice?.current ?? character.level;
  return dice.map(die => {
    const max = maxByDie.get(die) ?? 0;
    const current = Math.max(0, Math.min(max, remaining));
    remaining -= current;
    return { die, max, current };
  });
}

/** Write pools back onto hitDice, keeping the totals in step. */
export function withHitDicePools(character: Character, pools: HitDiePool[]): Character['hitDice'] {
  const current = pools.reduce((total, pool) => total + pool.current, 0);
  const max = pools.reduce((total, pool) => total + pool.max, 0);
  const base: Character['hitDice'] = { ...character.hitDice, current, max };
  if (pools.length < 2) {
    delete base.pools;
    return base;
  }
  return {
    ...base,
    pools: Object.fromEntries(pools.map(pool => [`d${pool.die}`, { current: pool.current, max: pool.max }])),
  };
}

/** Spend one die of the given size. Returns null when none of that size is left. */
export function spendHitDieOfSize(character: Character, die: number): Character['hitDice'] | null {
  const pools = hitDicePools(character);
  const pool = pools.find(item => item.die === die);
  if (!pool || pool.current <= 0) return null;
  return withHitDicePools(character, pools.map(item => (item === pool ? { ...item, current: item.current - 1 } : item)));
}

/** Spend `count` dice, largest first. Returns the dice rolled and the new hit dice. */
export function spendHitDice(character: Character, count: number): { dice: number[]; hitDice: Character['hitDice'] } {
  const pools = hitDicePools(character).map(pool => ({ ...pool }));
  const dice: number[] = [];
  for (const pool of pools) {
    while (pool.current > 0 && dice.length < count) {
      pool.current -= 1;
      dice.push(pool.die);
    }
  }
  return { dice, hitDice: withHitDicePools(character, pools) };
}

/**
 * Remove one level from a multiclass character: from the class that gained the most recent level,
 * else the newest class. Updates class entries, hit dice and the shared slot table. Returns null
 * for single-class characters.
 */
export function removeMulticlassLevel(character: Character): { character: Character; classSlug: string; hitDie: number } | null {
  const entries = getClassEntries(character);
  if (entries.length < 2) return null;

  const history = asList<{ level: number; classSlug?: string }>(character.levelHistory);
  const lastRecord = history[history.length - 1];
  const fromHistory = lastRecord?.level === character.level ? lastRecord.classSlug : undefined;
  let target = entries.find(entry => entry.classSlug === fromHistory) ?? entries[entries.length - 1];
  // The starting class keeps at least one level; `class` and `classSlug` point at it.
  if (target.level === 1 && target.classSlug === primaryClassSlug(character)) {
    target = entries[entries.length - 1];
  }

  const remaining = entries
    .map(entry => (entry.classSlug === target.classSlug ? { ...entry, level: entry.level - 1 } : entry))
    .filter(entry => entry.level > 0);

  const pools = hitDicePools(character)
    .map(pool => (pool.die === target.hitDie ? { ...pool, max: pool.max - 1, current: Math.min(pool.current, pool.max - 1) } : pool))
    .filter(pool => pool.max > 0);

  const updated: Character = {
    ...character,
    level: character.level - 1,
    classes: remaining.length > 1 ? remaining : undefined,
    levelHistory: fromHistory ? history.slice(0, -1) as Character['levelHistory'] : character.levelHistory,
  };
  updated.hitDice = withHitDicePools(updated, pools);

  if (updated.spellcasting) {
    const removedClass = !remaining.some(entry => entry.classSlug === target.classSlug);
    const classCasting = asList<NonNullable<NonNullable<Character['spellcasting']>['classCasting']>[number]>(updated.spellcasting.classCasting)
      .filter(item => !removedClass || item.classSlug !== target.classSlug);
    const slots = remaining.length > 1
      ? multiclassSpellSlots(updated) ?? emptySlots()
      : normalizeSpellSlots(remaining[0].classSlug, SPELL_SLOTS_BY_CLASS[remaining[0].classSlug]?.[remaining[0].level]);
    const used = asNumberList(updated.spellcasting.usedSpellSlots);
    updated.spellcasting = {
      ...updated.spellcasting,
      classCasting: remaining.length > 1 && classCasting.length > 0 ? classCasting : undefined,
      spellSlots: slots,
      usedSpellSlots: slots.map((max, level) => Math.min(used[level] ?? 0, max)),
    };
  }

  return { character: updated, classSlug: target.classSlug, hitDie: target.hitDie };
}

export function restoreHitDice(character: Character): Character['hitDice'] {
  return withHitDicePools(character, hitDicePools(character).map(pool => ({ ...pool, current: pool.max })));
}
