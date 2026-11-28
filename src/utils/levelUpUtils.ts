/**
 * Level-Up Utilities
 *
 * Core calculation logic for character level advancement.
 * Handles HP increases, spell slot progression, feature grants, and player choices.
 */

import { resolveSpeciesGrants, speciesMovement } from './speciesGrantUtils';
import { subclassFeaturesUpToLevel } from './subclassCatalog';
import { applyOptionalFeatureGrants, getOptionalFeature, levelUpNeedsOptionalFeatures, resolveOptionalFeatureSlug } from './optionalFeatures';
import { applyFeatAbilityIncreases, resolveFeatGrants } from './featGrantUtils';
import { AbilityName, Character, CharacterClassEntry, LevelUpChoices, SkillName } from '../types/dnd';
import {
  ClassProgression,
  LevelUpData,
  LevelUpRecord,
  FeatureChoice,
  grantsASI
} from '../data/classProgression';
import { fighter2024Progression } from '../data/progressions/fighter2024';
import { paladin2024Progression } from '../data/progressions/paladin2024';
import { ranger2024Progression } from '../data/progressions/ranger2024';
import { wizard2024Progression } from '../data/progressions/wizard2024';
import { barbarian2024Progression } from '../data/progressions/barbarian2024';
import { monk2024Progression } from '../data/progressions/monk2024';
import { rogue2024Progression } from '../data/progressions/rogue2024';
import { sorcerer2024Progression } from '../data/progressions/sorcerer2024';
import { bard2024Progression } from '../data/progressions/bard2024';
import { cleric2024Progression } from '../data/progressions/cleric2024';
import { druid2024Progression } from '../data/progressions/druid2024';
import { warlock2024Progression } from '../data/progressions/warlock2024';
import { artificer2024Progression } from '../data/progressions/artificer2024';
import { PROFICIENCY_BONUSES, CANTRIPS_KNOWN_BY_CLASS, findSpeciesByName, loadSpells, getFeatBySlug, getHitDieForClass, resolveFeatSlug, type AppSpell } from '../services/dataService';
import { SPELL_LEARNING_RULES } from '../data/spellLearning';
import { SPELL_SLOTS_BY_CLASS } from '../data/spellSlots';
import { normalizeSpellSlots } from './spellSlotUtils';
import {
  classCastingAbility,
  classCastingType,
  classCastsAtLevel,
  findClassData,
  getClassEntries,
  hitDicePools,
  multiclassProficiencies,
  multiclassSpellSlots,
  primaryClassSlug,
  projectCharacterForClass,
  withHitDicePools,
} from './multiclass';
import { asList, asNumberList } from './normalizeCharacter';

/**
 * Get the class progression data for a given class
 */
export function getClassProgression(classSlug: string, edition: '2014' | '2024' = '2024'): ClassProgression | null {
  // Implemented class progressions
  if (classSlug === 'barbarian' && edition === '2024') {
    return barbarian2024Progression;
  }
  if (classSlug === 'fighter' && edition === '2024') {
    return fighter2024Progression;
  }
  if (classSlug === 'monk' && edition === '2024') {
    return monk2024Progression;
  }
  if (classSlug === 'rogue' && edition === '2024') {
    return rogue2024Progression;
  }
  if (classSlug === 'sorcerer' && edition === '2024') {
    return sorcerer2024Progression;
  }
  if (classSlug === 'bard' && edition === '2024') {
    return bard2024Progression;
  }
  if (classSlug === 'cleric' && edition === '2024') {
    return cleric2024Progression;
  }
  if (classSlug === 'druid' && edition === '2024') {
    return druid2024Progression;
  }
  if (classSlug === 'warlock' && edition === '2024') {
    return warlock2024Progression;
  }
  if (classSlug === 'artificer' && edition === '2024') {
    return artificer2024Progression;
  }
  if (classSlug === 'paladin' && edition === '2024') {
    return paladin2024Progression;
  }
  if (classSlug === 'ranger' && edition === '2024') {
    return ranger2024Progression;
  }
  if (classSlug === 'wizard' && edition === '2024') {
    return wizard2024Progression;
  }

  // TODO: Add other class progressions as they are implemented
  return null;
}

/** The catalog step is separate from the 2024 progression's invocation and metamagic lines. */
function finishLevelUpData(character: Character, toLevel: number, data: LevelUpData): LevelUpData {
  const classSlug = (character.classSlug || character.class).toLowerCase()
  const needs = levelUpNeedsOptionalFeatures(
    classSlug,
    character.edition,
    toLevel,
    character.subclass,
    data.choices.some(choice => choice.type === 'subclass'),
  )
  if (!needs) return data
  return { ...data, optionalFeaturePicks: true, requiresChoices: true }
}

/** Class level at which a 2014 class picks its subclass (2024 progressions carry their own). */
const SUBCLASS_LEVEL_2014: Record<string, number> = {
  cleric: 1, sorcerer: 1, warlock: 1, wizard: 2, druid: 2,
};

/**
 * Calculate all data needed for a level-up.
 *
 * `targetClassSlug` is the class gaining the level: one the character already has, or a new class
 * when multiclassing. It defaults to the starting class.
 */
export function calculateLevelUpData(character: Character, targetClassSlug?: string): LevelUpData | null {
  const fromLevel = character.level;
  const toLevel = fromLevel + 1;

  if (toLevel > 20) {
    return null; // Max level reached
  }

  const entries = getClassEntries(character);
  const classSlug = (targetClassSlug || entries[0].classSlug).toLowerCase();
  const entry = entries.find(item => item.classSlug === classSlug);
  const isNewClass = !entry;
  const fromClassLevel = entry?.level ?? 0;
  const toClassLevel = fromClassLevel + 1;
  const multiclass = entries.length > 1 || isNewClass;

  const view = projectCharacterForClass(character, classSlug);
  const data = classLevelUpData(view, fromClassLevel, toClassLevel, multiclass);

  if (multiclass) {
    addMulticlassSpellChoices(view, fromClassLevel, toClassLevel, data);
    const before = multiclassSpellSlots(character) ?? asNumberList(character.spellcasting?.spellSlots);
    const after = multiclassSpellSlots({ ...character, level: toLevel, classes: nextClassEntries(character, classSlug) }) ?? [];
    const gained: Record<string, number> = {};
    after.forEach((count, level) => {
      if (level > 0 && count > (before[level] || 0)) gained[`level${level}`] = count;
    });
    data.newSpellSlots = Object.keys(gained).length > 0 ? gained : undefined;
  }

  const withSubclass = addFallbackSubclassChoice(view, toClassLevel, data);

  return finishLevelUpData(view, toClassLevel, {
    ...withSubclass,
    fromLevel,
    toLevel,
    classSlug,
    className: view.class,
    fromClassLevel,
    toClassLevel,
    isNewClass,
    newProficiencyBonus: PROFICIENCY_BONUSES[toLevel - 1],
    requiresChoices: withSubclass.choices.length > 0 || isNewClass,
  });
}

/** Class entries after `classSlug` gains a level. */
export function nextClassEntries(character: Character, classSlug: string): CharacterClassEntry[] {
  const slug = classSlug.toLowerCase();
  const entries = getClassEntries(character);
  if (entries.some(entry => entry.classSlug === slug)) {
    return entries.map(entry => (entry.classSlug === slug ? { ...entry, level: entry.level + 1 } : entry));
  }
  const view = projectCharacterForClass(character, slug);
  const classData = findClassData(slug, character.edition);
  return [...entries, {
    class: view.class,
    classSlug: slug,
    level: 1,
    subclass: null,
    hitDie: classData?.hit_die ?? getHitDieForClass(slug),
  }];
}

/** 2014 classes have no progression file, so their subclass pick comes from the subclass level table. */
function addFallbackSubclassChoice(view: Character, toClassLevel: number, data: LevelUpData): LevelUpData {
  if (data.choices.some(choice => choice.type === 'subclass') || view.subclass) return data;
  if (getClassProgression(view.classSlug ?? '', view.edition)) return data;
  const subclassLevel = SUBCLASS_LEVEL_2014[view.classSlug ?? ''] ?? 3;
  if (toClassLevel !== subclassLevel) return data;
  return {
    ...data,
    choices: [...data.choices, { type: 'subclass', description: `Choose a ${view.class} subclass` }],
    requiresChoices: true,
  };
}

/**
 * Multiclass spell picks follow each class's own table at its class level. Counting is by the
 * table's change from the previous class level because every class shares one spell list.
 */
function addMulticlassSpellChoices(view: Character, fromClassLevel: number, toClassLevel: number, data: LevelUpData): void {
  const classSlug = view.classSlug ?? '';
  data.choices = data.choices.filter(choice => choice.type !== 'spells');
  data.newCantripsKnown = undefined;
  data.newSpellsKnown = undefined;
  if (!classCastsAtLevel(classSlug, toClassLevel, view.edition, view.subclass)) return;

  const cantripTable = (CANTRIPS_KNOWN_BY_CLASS as Record<string, Record<string, number>>)[classSlug];
  const cantripsAt = (level: number) => (level > 0 ? cantripTable?.[String(level)] ?? 0 : 0);
  const newCantrips = Math.max(0, cantripsAt(toClassLevel) - cantripsAt(fromClassLevel));

  const rules = SPELL_LEARNING_RULES[classSlug];
  const casting = classCastsAtLevel(classSlug, fromClassLevel, view.edition, view.subclass);
  let newSpells = 0;
  if (rules?.spellbookCapacity) {
    newSpells = casting && fromClassLevel > 0 ? 2 : rules.spellbookCapacity[0];
  } else {
    const table = rules?.spellsKnown ?? rules?.spellsPrepared;
    const at = (level: number) => (level > 0 ? table?.[level - 1] ?? 0 : 0);
    newSpells = Math.max(0, at(toClassLevel) - at(fromClassLevel));
  }

  const name = view.class;
  if (newCantrips > 0) {
    data.newCantripsKnown = newCantrips;
    data.choices.push({ type: 'spells', description: `Learn ${newCantrips} ${name} cantrip${newCantrips === 1 ? '' : 's'}`, count: newCantrips });
  }
  if (newSpells > 0) {
    data.newSpellsKnown = newSpells;
    data.choices.push({ type: 'spells', description: `Learn ${newSpells} ${name} spell${newSpells === 1 ? '' : 's'}`, count: newSpells });
  }
}

/**
 * Level-up data for one class going from `fromLevel` to `toLevel` in that class. `character` is
 * the class view (see projectCharacterForClass): its level is the class level.
 */
function classLevelUpData(character: Character, fromLevel: number, toLevel: number, multiclass: boolean): LevelUpData {
  // Get class progression data
  const progression = getClassProgression((character.classSlug || character.class).toLowerCase(), character.edition);
  if (!progression) {
    // Fallback for classes without progression data yet
    return createFallbackLevelUpData(character, fromLevel, toLevel);
  }

  // Get features for the new level
  const featuresAtLevel = progression.features.filter(f => f.level === toLevel);

  // Determine if any choices are required
  const choices: FeatureChoice[] = [];
  featuresAtLevel.forEach(feature => {
    if (!feature.automatic && feature.choices) {
      choices.push(...feature.choices);
    }
  });

  // Calculate HP gain
  const hitDie = progression.hitDie;
  const conModifier = character.abilities.CON.modifier;
  const averageHpGain = Math.floor(parseInt(hitDie.substring(1)) / 2) + 1 + conModifier;

  // Calculate new proficiency bonus
  const newProficiencyBonus = PROFICIENCY_BONUSES[toLevel - 1];

  // Calculate spell slot changes (for spellcasters)
  let newSpellSlots: Record<string, number> | undefined;
  let newCantripsKnown: number | undefined;
  let newSpellsKnown: number | undefined;

  if (character.spellcasting && !multiclass) {
    const classSlug = character.class.toLowerCase();
    const currentSlots = normalizeSpellSlots(classSlug, SPELL_SLOTS_BY_CLASS[classSlug]?.[fromLevel]);
    const nextLevelSlots = normalizeSpellSlots(classSlug, SPELL_SLOTS_BY_CLASS[classSlug]?.[toLevel]);

    // Check if spell slots changed
    if (JSON.stringify(currentSlots) !== JSON.stringify(nextLevelSlots)) {
      newSpellSlots = {};
      nextLevelSlots.forEach((count, level) => {
        if (level > 0 && count > (currentSlots[level] || 0)) {
          newSpellSlots![`level${level}`] = count;
        }
      });
    }

    // Check if cantrips known changed
    const currentCantrips = (CANTRIPS_KNOWN_BY_CLASS as Record<string, Record<string, number>>)[classSlug]?.[fromLevel.toString()] || 0;
    const nextCantrips = (CANTRIPS_KNOWN_BY_CLASS as Record<string, Record<string, number>>)[classSlug]?.[toLevel.toString()] || 0;
    if (nextCantrips > currentCantrips) {
      newCantripsKnown = nextCantrips;
    }

    const learningRules = SPELL_LEARNING_RULES[classSlug];

    // For known casters, calculate new spells known
    if (character.spellcasting.spellcastingType === 'known' && learningRules?.spellsKnown) {
      const currentSpellsKnown = character.spellcasting.spellsKnown?.length || 0;
      const expectedSpellsKnown = learningRules.spellsKnown[toLevel - 1] || 0; // Array is 0-indexed
      const spellsToLearn = Math.max(0, expectedSpellsKnown - currentSpellsKnown);
      if (spellsToLearn > 0) {
        newSpellsKnown = spellsToLearn;
      }
    }

    // For prepared casters, surface additional prepared slots as spell choices
    if (character.spellcasting.spellcastingType === 'prepared' && learningRules?.spellsPrepared) {
      const currentPrepared = character.spellcasting.preparedSpells?.length || 0;
      const expectedPrepared = learningRules.spellsPrepared[toLevel - 1] || 0;
      const newPreparedSlots = Math.max(0, expectedPrepared - currentPrepared);
      if (newPreparedSlots > 0) {
        newSpellsKnown = (newSpellsKnown || 0) + newPreparedSlots;
      }
    }

    // Add spell choice if appropriate
    if (newCantripsKnown || newSpellsKnown) {
      choices.push({
        type: 'spells',
        description: `Learn new spells at level ${toLevel}`,
        count: (newCantripsKnown ? 1 : 0) + (newSpellsKnown || 0)
      });
    }
  }

  return {
    fromLevel,
    toLevel,
    newProficiencyBonus,
    hitDie,
    conModifier,
    averageHpGain,
    newSpellSlots,
    newCantripsKnown,
    newSpellsKnown,
    features: featuresAtLevel,
    requiresChoices: choices.length > 0,
    choices
  };
}

/**
 * Fallback level-up calculation for classes without progression data
 */
function createFallbackLevelUpData(
  character: Character,
  fromLevel: number,
  toLevel: number
): LevelUpData {
  const classSlug = character.class.toLowerCase();

  // Determine hit die based on class
  const hitDieMap: Record<string, string> = {
    'barbarian': 'd12',
    'fighter': 'd10',
    'paladin': 'd10',
    'ranger': 'd10',
    'monk': 'd8',
    'rogue': 'd8',
    'bard': 'd8',
    'cleric': 'd8',
    'druid': 'd8',
    'warlock': 'd8',
    'sorcerer': 'd6',
    'wizard': 'd6'
  };
  const hitDie = hitDieMap[classSlug] || 'd8';

  const conModifier = character.abilities.CON.modifier;
  const averageHpGain = Math.floor(parseInt(hitDie.substring(1)) / 2) + 1 + conModifier;
  const newProficiencyBonus = PROFICIENCY_BONUSES[toLevel - 1];

  // Check for ASI/Feat
  const choices: FeatureChoice[] = [];
  if (grantsASI(toLevel, classSlug)) {
    choices.push({
      type: 'asi',
      description: 'Increase ability scores or choose a feat',
      count: 2
    });
  }

  return {
    fromLevel,
    toLevel,
    newProficiencyBonus,
    hitDie,
    conModifier,
    averageHpGain,
    features: [],
    requiresChoices: choices.length > 0,
    choices
  };
}

/**
 * Determine which wizard steps are needed for a level-up
 */
export function getLevelUpSteps(levelUpData: LevelUpData): string[] {
  const steps: string[] = ['overview', 'hp'];

  // Check for ASI/Feat choice
  const hasASI = levelUpData.choices.some(c => c.type === 'asi');
  const hasFeat = levelUpData.choices.some(c => c.type === 'feat');
  if (hasASI || hasFeat) {
    steps.push('asi-feat');
  }

  // Check for subclass choice
  const hasSubclass = levelUpData.choices.some(c => c.type === 'subclass');
  if (hasSubclass) {
    steps.push('subclass');
  }

  if (levelUpData.optionalFeaturePicks) {
    steps.push('optional-features');
  }

  // Check for spell choices - create separate steps for each spell choice
  const spellChoices = levelUpData.choices.filter(c => c.type === 'spells');
  spellChoices.forEach((choice, index) => {
    steps.push(`spells-${index}`);
  });

  // Check for fighting style
  const hasFightingStyle = levelUpData.choices.some(c => c.type === 'fighting-style');
  if (hasFightingStyle) {
    steps.push('fighting-style');
  }

  // Always show features summary (even if automatic)
  if (levelUpData.features.length > 0) {
    steps.push('features');
  }

  steps.push('confirm');

  return steps;
}

/**
 * Apply a level-up to a character
 */
export function applyLevelUp(
  character: Character,
  levelUpData: LevelUpData,
  choices: LevelUpChoices
): Character {
  const updatedCharacter = { ...character };

  // Apply level increase
  updatedCharacter.level = levelUpData.toLevel;

  const classSlug = (levelUpData.classSlug || choices.classSlug || primaryClassSlug(character)).toLowerCase();
  const isPrimaryClass = classSlug === primaryClassSlug(character);
  const multiclass = getClassEntries(character).length > 1 || levelUpData.isNewClass === true;
  const classEntries = nextClassEntries(character, classSlug).map(entry =>
    entry.classSlug === classSlug && choices.subclassChosen ? { ...entry, subclass: choices.subclassChosen } : entry,
  );
  if (multiclass) {
    updatedCharacter.classes = classEntries;
  }

  // Apply HP increase
  let hpGain = choices.hpGained || 0;

  // Feat HP per level (Tough +2) for feats already held
  hpGain += resolveFeatGrants(updatedCharacter.selectedFeats ?? [], {
    edition: updatedCharacter.edition,
    level: updatedCharacter.level,
    walkSpeed: updatedCharacter.speed,
  }).hpPerLevel;

  // Species HP bonus (e.g. Dwarven Toughness: +1 per level)
  hpGain += updatedCharacter.hpPerLevelBonus ?? 0;

  updatedCharacter.maxHitPoints += hpGain;
  updatedCharacter.hitPoints += hpGain; // Also increase current HP

  // Level-gated species grants (e.g. 2024 Draconic Flight at level 5)
  const species = findSpeciesByName(updatedCharacter.species, updatedCharacter.edition);
  if (species) {
    const grants = resolveSpeciesGrants(species, {
      edition: updatedCharacter.edition,
      level: updatedCharacter.level,
      variantSlug: updatedCharacter.selectedSpeciesVariant,
      choices: updatedCharacter.speciesChoices,
      walkSpeed: updatedCharacter.speed,
    });
    updatedCharacter.movement = speciesMovement(grants.movement, species);
  }

  // Apply hit dice
  if (multiclass) {
    const die = classEntries.find(entry => entry.classSlug === classSlug)?.hitDie ?? getHitDieForClass(classSlug);
    const pools = hitDicePools(character);
    const pool = pools.find(item => item.die === die);
    const nextPools = pool
      ? pools.map(item => (item === pool ? { ...item, max: item.max + 1, current: item.current + 1 } : item))
      : [...pools, { die, max: 1, current: 1 }].sort((left, right) => right.die - left.die);
    updatedCharacter.hitDice = withHitDicePools(updatedCharacter, nextPools);
  } else {
    updatedCharacter.hitDice = {
      ...updatedCharacter.hitDice,
      max: updatedCharacter.hitDice.max + 1,
      current: updatedCharacter.hitDice.current + 1,
    };
  }

  // Apply proficiency bonus
  updatedCharacter.proficiencyBonus = levelUpData.newProficiencyBonus;

  if (levelUpData.isNewClass) {
    applyMulticlassProficiencies(updatedCharacter, classSlug, choices);
  }

  // Apply ASI choices
  if (choices.asiChoices) {
    choices.asiChoices.forEach(choice => {
      const ability = choice.ability as keyof Character['abilities'];
      updatedCharacter.abilities[ability].score += choice.increase;
      updatedCharacter.abilities[ability].modifier = Math.floor(
        (updatedCharacter.abilities[ability].score - 10) / 2
      );
    });
  }

  // Apply feat
  if (choices.featChosen) {
    const featSlug = resolveFeatSlug(choices.featChosen, updatedCharacter.edition);
    updatedCharacter.selectedFeats = [...(updatedCharacter.selectedFeats ?? []), featSlug];
    if (choices.featChoices) {
      updatedCharacter.featChoices = { ...(updatedCharacter.featChoices ?? {}), [featSlug]: choices.featChoices };
    }

    applyFeatGrants(updatedCharacter, featSlug);
    // Process feat-granted abilities and spells
    applyFeatEffects(updatedCharacter, featSlug, updatedCharacter.featChoices);
  }

  // Apply subclass (a later class keeps its subclass on its class entry)
  if (choices.subclassChosen && isPrimaryClass) {
    updatedCharacter.subclass = choices.subclassChosen;
  }
  updatedCharacter.srdFeatures = {
    classFeatures: updatedCharacter.srdFeatures?.classFeatures ?? [],
    subclassFeatures: multiclass
      ? classEntries.flatMap(entry => subclassFeaturesUpToLevel(entry.classSlug, entry.subclass, entry.level))
      : subclassFeaturesUpToLevel(updatedCharacter.classSlug, updatedCharacter.subclass, updatedCharacter.level),
  };

  // Apply fighting style
  if (choices.fightingStyleChosen) {
    updatedCharacter.fightingStyle = choices.fightingStyleChosen;
  }

  const optionalPicks = [
    ...(choices.optionalFeaturesChosen ?? []),
    ...(choices.fightingStyleChosen ? [choices.fightingStyleChosen] : []),
  ]
    .map(slug => resolveOptionalFeatureSlug(slug, updatedCharacter.edition))
    .filter(slug => getOptionalFeature(slug, updatedCharacter.edition));
  if (optionalPicks.length > 0) {
    updatedCharacter.optionalFeatures = [...new Set([...(updatedCharacter.optionalFeatures ?? []), ...optionalPicks])];
    const invocationPicks = optionalPicks.filter(slug => getOptionalFeature(slug, updatedCharacter.edition)?.featureTypes.includes('EI'));
    if (invocationPicks.length > 0) {
      updatedCharacter.eldritchInvocations = [...new Set([...(updatedCharacter.eldritchInvocations ?? []), ...invocationPicks])];
    }
    applyOptionalFeatureGrants(updatedCharacter, optionalPicks);
  }

  if (multiclass) {
    applyMulticlassSpellcasting(updatedCharacter, character, classSlug, classEntries);
  }

  // Apply spell slot increases
  if (!multiclass && levelUpData.newSpellSlots && updatedCharacter.spellcasting) {
    const classSlug = character.class.toLowerCase();
    const newSlots = normalizeSpellSlots(classSlug, SPELL_SLOTS_BY_CLASS[classSlug]?.[levelUpData.toLevel]);
    updatedCharacter.spellcasting.spellSlots = newSlots;
    updatedCharacter.spellcasting.usedSpellSlots = new Array(newSlots.length).fill(0);
  }

  // Apply spells learned
  if (choices.spellsLearned && updatedCharacter.spellcasting) {
    // Load spell data to separate cantrips from leveled spells
      const allSpells: AppSpell[] = loadSpells();
      const cantrips = choices.spellsLearned.filter((spellSlug: string) => {
        const spell = allSpells.find((s: AppSpell) => s.slug === spellSlug);
        return spell && spell.level === 0;
      });
      const leveledSpells = choices.spellsLearned.filter((spellSlug: string) => {
        const spell = allSpells.find((s: AppSpell) => s.slug === spellSlug);
        return spell && spell.level > 0;
      });

    // Add cantrips to cantripsKnown
    if (cantrips.length > 0) {
      if (!updatedCharacter.spellcasting.cantripsKnown) {
        updatedCharacter.spellcasting.cantripsKnown = [];
      }
      updatedCharacter.spellcasting.cantripsKnown.push(...cantrips);
    }

    // Add leveled spells based on the casting type of the class that gained the level
    if (leveledSpells.length > 0) {
      const castingType = multiclass
        ? classCastingType(classSlug, updatedCharacter.edition)
        : updatedCharacter.spellcasting.spellcastingType;
      if (castingType === 'known') {
        if (!updatedCharacter.spellcasting.spellsKnown) {
          updatedCharacter.spellcasting.spellsKnown = [];
        }
        updatedCharacter.spellcasting.spellsKnown.push(...leveledSpells);
      } else if (castingType === 'wizard') {
        if (!updatedCharacter.spellcasting.spellbook) {
          updatedCharacter.spellcasting.spellbook = [];
        }
        updatedCharacter.spellcasting.spellbook.push(...leveledSpells);
      } else {
        updatedCharacter.spellcasting.preparedSpells = [
          ...new Set([...(updatedCharacter.spellcasting.preparedSpells ?? []), ...leveledSpells]),
        ];
      }
    }
  }

  // Apply automatic features to class features list
  levelUpData.features
    .filter(f => f.automatic)
    .forEach(feature => {
      if (!updatedCharacter.featuresAndTraits.classFeatures.includes(feature.name)) {
        updatedCharacter.featuresAndTraits.classFeatures.push(feature.name);
      }
    });

  // Update resources (Second Wind, Action Surge, etc.)
  levelUpData.features.forEach(feature => {
    if (feature.resources) {
      if (!updatedCharacter.resources) {
        updatedCharacter.resources = [];
      }

      feature.resources.forEach(newResource => {
        // Find existing resource or add new one
        const existingIndex = updatedCharacter.resources!.findIndex(
          r => r.id === newResource.id
        );

        if (existingIndex >= 0) {
          // Update existing resource (e.g., increase max uses)
          updatedCharacter.resources![existingIndex] = {
            ...updatedCharacter.resources![existingIndex],
            maxUses: newResource.maxUses,
            currentUses: newResource.maxUses // Reset to max on level-up
          };
        } else {
          // Add new resource
          updatedCharacter.resources!.push({
            ...newResource,
            currentUses: newResource.maxUses
          });
        }
      });
    }
  });

  // Record level-up in history
  const levelUpRecord: LevelUpRecord = {
    level: levelUpData.toLevel,
    classSlug,
    classLevel: classEntries.find(entry => entry.classSlug === classSlug)?.level,
    newClass: levelUpData.isNewClass || undefined,
    timestamp: new Date().toISOString(),
    hpRolled: choices.hpRoll,
    hpGained: choices.hpGained || 0,
    asiChoices: choices.asiChoices,
    featChosen: choices.featChosen,
    subclassChosen: choices.subclassChosen,
    spellsLearned: choices.spellsLearned,
    fightingStyleChosen: choices.fightingStyleChosen,
    featuresGained: levelUpData.features.filter(f => f.automatic).map(f => f.name)
  };

  if (!updatedCharacter.levelHistory) {
    updatedCharacter.levelHistory = [];
  }
  updatedCharacter.levelHistory.push(levelUpRecord);

  // Update timestamp
  updatedCharacter.updatedAt = new Date().toISOString();

  return updatedCharacter;
}

/**
 * Roll hit points for level-up (alternative to taking average)
 */
export function rollHitPoints(hitDie: string, conModifier: number): number {
  const dieSize = parseInt(hitDie.substring(1));
  const roll = Math.floor(Math.random() * dieSize) + 1;
  return Math.max(1, roll + conModifier); // Minimum 1 HP
}

/**
 * Get the average HP gain (rounded up) for a level-up
 */
export function getAverageHPGain(hitDie: string, conModifier: number): number {
  const dieSize = parseInt(hitDie.substring(1));
  const average = Math.floor(dieSize / 2) + 1;
  return Math.max(1, average + conModifier); // Minimum 1 HP
}

const unionInto = <T,>(current: T[] | undefined, added: T[]): T[] | undefined =>
  added.length ? Array.from(new Set([...(current ?? []), ...added])) : current;

/** The reduced proficiency list a character gets from the first level of a new class. */
function applyMulticlassProficiencies(character: Character, classSlug: string, choices: LevelUpChoices): void {
  const gained = multiclassProficiencies(classSlug, character.edition);
  character.proficiencies = {
    ...character.proficiencies,
    armor: unionInto(character.proficiencies?.armor, gained.armor) ?? [],
    weapons: unionInto(character.proficiencies?.weapons, gained.weapons) ?? [],
    tools: unionInto(character.proficiencies?.tools, gained.tools) ?? [],
  };

  const pb = character.proficiencyBonus;
  const skills = { ...character.skills };
  (choices.multiclassSkills ?? []).slice(0, gained.skills).forEach(skill => {
    if (skills[skill] && !skills[skill].proficient) {
      skills[skill] = { ...skills[skill], proficient: true, value: skills[skill].value + pb };
    }
  });
  character.skills = skills;

  if (gained.instruments > 0 && choices.multiclassInstrument) {
    character.featuresAndTraits = {
      ...character.featuresAndTraits,
      musicalInstrumentProficiencies: unionInto(
        asList<string>(character.featuresAndTraits?.musicalInstrumentProficiencies),
        [choices.multiclassInstrument],
      ) ?? [],
    };
  }
}

/**
 * Multiclass spellcasting: start spellcasting when the first casting class arrives, track each
 * casting class's ability, and recompute the shared slot table.
 */
function applyMulticlassSpellcasting(
  updated: Character,
  before: Character,
  classSlug: string,
  entries: CharacterClassEntry[],
): void {
  const edition = updated.edition;
  const casts = (entry: CharacterClassEntry) => classCastsAtLevel(entry.classSlug, entry.level, edition, entry.subclass);
  const target = entries.find(entry => entry.classSlug === classSlug);
  const castingBefore = getClassEntries(before).filter(casts);
  const targetCasts = target ? casts(target) : false;

  if (!updated.spellcasting && !targetCasts) return;

  const ability = classCastingAbility(classSlug, edition);
  const modifier = updated.abilities[ability]?.modifier ?? 0;

  if (!updated.spellcasting) {
    updated.spellcasting = {
      ability,
      spellSaveDC: 8 + updated.proficiencyBonus + modifier,
      spellAttackBonus: updated.proficiencyBonus + modifier,
      cantripsKnown: [],
      spellcastingType: classCastingType(classSlug, edition),
      cantripChoicesByLevel: {},
      spellSlots: new Array(10).fill(0),
      usedSpellSlots: new Array(10).fill(0),
    };
  } else if (targetCasts && castingBefore.length === 0) {
    // Feat-only spellcasting so far: the new class becomes the main casting class.
    updated.spellcasting = {
      ...updated.spellcasting,
      ability,
      spellSaveDC: 8 + updated.proficiencyBonus + modifier,
      spellAttackBonus: updated.proficiencyBonus + modifier,
      spellcastingType: classCastingType(classSlug, edition),
    };
  } else {
    updated.spellcasting = { ...updated.spellcasting };
  }

  const casting = updated.spellcasting;
  const listed = asList<NonNullable<typeof casting.classCasting>[number]>(casting.classCasting);
  const classCasting = listed.length > 0
    ? [...listed]
    : castingBefore.map(entry => ({
        classSlug: entry.classSlug,
        className: entry.class,
        ability: entry.classSlug === primaryClassSlug(before) ? casting.ability : classCastingAbility(entry.classSlug, edition),
        spellcastingType: entry.classSlug === primaryClassSlug(before) ? casting.spellcastingType : classCastingType(entry.classSlug, edition),
      }));
  if (target && targetCasts && !classCasting.some(item => item.classSlug === classSlug)) {
    classCasting.push({
      classSlug,
      className: target.class,
      ability,
      spellcastingType: classCastingType(classSlug, edition),
    });
  }
  if (classCasting.length > 0) casting.classCasting = classCasting;

  const slots = multiclassSpellSlots(updated) ?? asNumberList(casting.spellSlots);
  const used = asNumberList(casting.usedSpellSlots);
  casting.spellSlots = slots;
  casting.usedSpellSlots = slots.map((max, level) => Math.min(used[level] ?? 0, max));
}

/**
 * Apply the mechanical grants of a newly gained feat (see Feat.grants and the feat's picks):
 * ability increase, proficiencies, defenses, senses, speed, initiative and Tough-style HP.
 */
export function applyFeatGrants(character: Character, featSlug: string): void {
  const feat = getFeatBySlug(featSlug, character.edition);
  if (!feat) return;

  const scores = Object.fromEntries(
    (Object.keys(character.abilities) as AbilityName[]).map(a => [a, character.abilities[a].score]),
  ) as Record<AbilityName, number>;
  const raised = applyFeatAbilityIncreases(scores, [feat.slug], character.edition, character.featChoices);
  character.abilities = Object.fromEntries((Object.keys(raised) as AbilityName[]).map(a => [
    a, { ...character.abilities[a], score: raised[a], modifier: Math.floor((raised[a] - 10) / 2) },
  ])) as Character['abilities'];

  const g = resolveFeatGrants([feat.slug], {
    edition: character.edition,
    level: character.level,
    walkSpeed: character.speed,
    featChoices: character.featChoices,
  });

  const pb = character.proficiencyBonus;
  const skills = { ...character.skills };
  g.skills.forEach((skill: SkillName) => {
    if (skills[skill] && !skills[skill].proficient) {
      skills[skill] = { ...skills[skill], proficient: true, value: skills[skill].value + pb };
    }
  });
  g.expertise.forEach((skill: SkillName) => {
    if (skills[skill]?.proficient && !character.expertiseSkills?.includes(skill)) {
      skills[skill] = { ...skills[skill], value: skills[skill].value + pb };
      character.expertiseSkills = [...(character.expertiseSkills ?? []), skill];
    }
  });
  character.skills = skills;

  character.proficiencies = {
    ...character.proficiencies,
    armor: unionInto(character.proficiencies?.armor, g.armor) ?? [],
    weapons: unionInto(character.proficiencies?.weapons, g.weapons) ?? [],
    tools: unionInto(character.proficiencies?.tools, g.tools) ?? [],
  };
  character.languages = unionInto(character.languages, g.languages);
  character.damageResistances = unionInto(character.damageResistances, g.resistances);
  character.damageImmunities = unionInto(character.damageImmunities, g.damageImmunities);
  character.conditionImmunities = unionInto(character.conditionImmunities, g.conditionImmunities);
  character.savingThrowProficiencies = unionInto(character.savingThrowProficiencies, g.savingThrows);

  if (Object.keys(g.senses).length) {
    const senses = { ...(character.senses ?? {}) };
    (Object.entries(g.senses) as Array<[keyof typeof senses, number]>).forEach(([sense, range]) => {
      senses[sense] = Math.max(senses[sense] ?? 0, range);
    });
    character.senses = senses;
  }
  character.speed += g.speedBonus;
  character.initiative += g.initiativeBonus + (g.initiativeProficiency ? pb : 0);
  // "When you gain this feat": HP for every level so far (later levels add it in applyLevelUp)
  character.maxHitPoints += g.hpPerLevel * character.level;
  character.hitPoints += g.hpPerLevel * character.level;
}

/**
 * Apply effects granted by a feat to the character
 */
function applyFeatEffects(character: Character, featSlug: string, featChoices?: Character['featChoices']): void {
  const feat = getFeatBySlug(featSlug, character.edition);

  if (!feat) return;
  // The effects below are keyed by the 2014 slug; 2024 versions share them
  featSlug = feat.slug.replace(/-2024$/, '');

  // Initialize feat effects object
  if (!character.featEffects) {
    character.featEffects = {};
  }

  applyFeatSpells(character, featSlug);
  applyFeatCombatEffects(character, featSlug, featChoices);
}

function applyFeatSpells(character: Character, featSlug: string): void {
  // Initialize featGrantedSpells array if it doesn't exist and feat grants spells
  if (!character.spellcasting) {
    // Initialize spellcasting for feats that grant spells to non-casters
    if (['drow-high-magic', 'fey-touched', 'shadow-touched', 'wood-elf-magic', 'metallic-dragon-adept', 'telekinetic', 'telepathic'].includes(featSlug)) {
      character.spellcasting = {
        ability: 'CHA' as const,
        spellSaveDC: 8 + character.proficiencyBonus + Math.floor((character.abilities.CHA.score - 10) / 2),
        spellAttackBonus: character.proficiencyBonus + Math.floor((character.abilities.CHA.score - 10) / 2),
        cantripsKnown: [],
        spellcastingType: 'known' as const,
        cantripChoicesByLevel: {},
        spellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // No spell slots for feat-granted spells
        usedSpellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        featGrantedSpells: []
      };
    } else {
      return;
    }
  }

  if (!character.spellcasting.featGrantedSpells) {
    character.spellcasting.featGrantedSpells = [];
  }

  // Process feats that grant spells
  switch (featSlug) {
    case 'drow-high-magic':
      // Detect Magic - at will
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'detect-magic',
        spellcastingAbility: 'CHA',
        rechargeType: 'at-will',
        featSlug: 'drow-high-magic'
      });

      // Levitate - 1 per long rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'levitate',
        spellcastingAbility: 'CHA',
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'drow-high-magic'
      });

      // Dispel Magic - 1 per long rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'dispel-magic',
        spellcastingAbility: 'CHA',
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'drow-high-magic'
      });
      break;

    case 'fey-touched':
      // Misty Step - 1 per long rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'misty-step',
        spellcastingAbility: 'CHA', // Uses the ability increased by this feat
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'fey-touched'
      });

      // Grant one 1st-level divination/enchantment spell (1/LR) - default to Charm Person
      // In a full implementation, this would require player choice between divination/enchantment spells
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'charm-person', // Enchantment spell
        spellcastingAbility: 'CHA',
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'fey-touched'
      });
      break;

    case 'shadow-touched':
      // Invisibility - 1 per short rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'invisibility',
        spellcastingAbility: 'CHA', // Uses the ability increased by this feat
        usesPerDay: 1,
        rechargeType: 'short-rest',
        featSlug: 'shadow-touched'
      });
      break;

    case 'wood-elf-magic':
      // Longstrider - 1 per long rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'longstrider',
        spellcastingAbility: 'WIS',
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'wood-elf-magic'
      });

      // Pass Without Trace - 1 per long rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'pass-without-trace',
        spellcastingAbility: 'WIS',
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'wood-elf-magic'
      });
      break;

    case 'metallic-dragon-adept':
      // Cure Wounds - 1 per long rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'cure-wounds',
        spellcastingAbility: 'CHA', // Uses the ability increased by this feat
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'metallic-dragon-adept'
      });
      break;

    case 'artificer-initiate':
      // This feat grants player choice of cantrip and 1st-level spell
      // For now, we'll grant a default artificer cantrip and spell
      // In a full implementation, this would require additional UI for spell selection
      if (!character.spellcasting) {
        character.spellcasting = {
          ability: 'INT' as const,
          spellSaveDC: 8 + character.proficiencyBonus + Math.floor((character.abilities.INT.score - 10) / 2),
          spellAttackBonus: character.proficiencyBonus + Math.floor((character.abilities.INT.score - 10) / 2),
          cantripsKnown: [],
          spellcastingType: 'known' as const,
          cantripChoicesByLevel: {},
          spellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          usedSpellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          featGrantedSpells: []
        };
      }

      // Grant Mending cantrip (artificer staple)
      character.spellcasting.featGrantedSpells!.push({
        spellSlug: 'mending',
        spellcastingAbility: 'INT',
        rechargeType: 'at-will',
        featSlug: 'artificer-initiate'
      });

      // Grant one 1st-level artificer spell (1/LR) - default to Identify
      character.spellcasting.featGrantedSpells!.push({
        spellSlug: 'identify',
        spellcastingAbility: 'INT',
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'artificer-initiate'
      });
      break;

    case 'spell-sniper':
      // This feat grants player choice of one attack cantrip
      // For now, we'll grant Fire Bolt as a default
      // In a full implementation, this would require additional UI for cantrip selection
      if (!character.spellcasting) {
        character.spellcasting = {
          ability: 'INT' as const,
          spellSaveDC: 8 + character.proficiencyBonus + Math.floor((character.abilities.INT.score - 10) / 2),
          spellAttackBonus: character.proficiencyBonus + Math.floor((character.abilities.INT.score - 10) / 2),
          cantripsKnown: [],
          spellcastingType: 'known' as const,
          cantripChoicesByLevel: {},
          spellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          usedSpellSlots: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          featGrantedSpells: []
        };
      }

      // Grant Fire Bolt cantrip (attack cantrip)
      character.spellcasting.featGrantedSpells!.push({
        spellSlug: 'fire-bolt',
        spellcastingAbility: 'INT',
        rechargeType: 'at-will',
        featSlug: 'spell-sniper'
      });

      // Apply spell sniper effects
      character.featEffects!.spellSniper = true;
      break;

    case 'telekinetic':
      // Mage Hand cantrip (enhanced)
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'mage-hand',
        spellcastingAbility: 'CHA', // Uses the ability increased by this feat
        rechargeType: 'at-will',
        featSlug: 'telekinetic'
      });
      break;

    case 'telepathic':
      // Detect Thoughts - 1 per long rest
      character.spellcasting.featGrantedSpells.push({
        spellSlug: 'detect-thoughts',
        spellcastingAbility: 'CHA', // Uses the ability increased by this feat
        usesPerDay: 1,
        rechargeType: 'long-rest',
        featSlug: 'telepathic'
      });
      break;

    // Add more feat spell processing logic here as needed

    // Add more feats as needed
    default:
      // No special effects for this feat
      break;
  }
}

function applyFeatCombatEffects(character: Character, featSlug: string, featChoices?: Character['featChoices']): void {
  // Handle non-spell feat effects (ability increases, proficiencies, speed, initiative and HP come
  // from the feat's grants, see applyFeatGrants)
  switch (featSlug) {
    // Combat Feats
    case 'lucky':
      character.featEffects!.luckPoints = {
        current: 3,
        max: 3
      };
      // Add luck points as a resource
      if (!character.resources) {
        character.resources = [];
      }
      character.resources.push({
        id: 'luck-points',
        name: 'Luck Points',
        description: 'Reroll d20s or force rerolls against you',
        maxUses: 3,
        rechargeType: 'long-rest'
      });
      break;

    case 'great-weapon-master':
      character.featEffects!.greatWeaponMaster = true;
      break;

    case 'polearm-master':
      character.featEffects!.polearmMaster = true;
      break;

    case 'crossbow-expert':
      character.featEffects!.crossbowExpert = true;
      break;

    case 'sharpshooter':
      // This is handled through attack bonuses in combat calculations
      break;

    case 'gunner':
      character.featEffects!.gunner = true;
      break;

    // Defensive Feats
    case 'alert':
      character.featEffects!.cantBeSurprised = true;
      character.featEffects!.noAdvantageFromUnseen = true;
      break;

    case 'resilient':
      // Proficiency in chosen saving throw - handled during feat selection
      break;

    case 'war-caster':
      character.featEffects!.warCaster = true;
      break;

    // Skill/Utility Feats
    case 'actor':
      character.featEffects!.mimicryAdvantage = true;
      break;

    case 'athlete':
      character.featEffects!.standUpFree = true;
      character.featEffects!.climbSpeedBonus = 10;
      character.featEffects!.swimSpeedBonus = 10;
      character.featEffects!.jumpDistanceBonus = 10;
      break;

    case 'inspiring-leader':
      character.featEffects!.inspiringLeader = true;
      break;

    case 'linguist':
      character.featEffects!.linguist = true;
      break;

    case 'prodigy':
      // Multiple proficiencies - handled during feat selection
      break;

    case 'skilled':
      // Multiple proficiencies - handled during feat selection
      break;

    case 'tavern-brawler':
      // Grapple bonuses and unarmed damage - handled in combat calculations
      break;

    // Magic-Related Feats (Non-Spell)
    case 'elemental-adept': {
      // Ignore resistance to chosen element
      if (!character.featEffects!.ignoredResistances) {
        character.featEffects!.ignoredResistances = [];
      }
      const choiceValue = featChoices?.[featSlug]?.damageType;
      const chosenDamageType = typeof choiceValue === 'string' ? choiceValue : 'fire'; // Default to fire if no choice made
      if (!character.featEffects!.ignoredResistances.includes(chosenDamageType)) {
        character.featEffects!.ignoredResistances.push(chosenDamageType);
      }
      break;
    }

    case 'spell-sniper':
      character.featEffects!.spellSniper = true;
      break;

    // Movement & Mobility Feats
    // Combat Feats
    case 'dual-wielder':
      // +1 AC when dual wielding - handled in AC calculations
      // Other effects handled in combat system
      break;

    case 'bountiful-luck':
      // Halfling luck sharing - can let allies reroll 1s
      character.featEffects!.bountifulLuck = true;
      break;

    case 'metamagic-adept':
      // Grants 2 sorcery points and metamagic options
      // This requires sorcerer spellcasting mechanics
      if (character.spellcasting) {
        // Add sorcery points resource if it doesn't exist
        if (!character.resources) {
          character.resources = [];
        }
        const existingSorceryPoints = character.resources.find(r => r.id === 'sorcery-points');
        if (existingSorceryPoints) {
          existingSorceryPoints.maxUses += 2;
          existingSorceryPoints.currentUses = (existingSorceryPoints.currentUses || 0) + 2;
        } else {
          character.resources.push({
            id: 'sorcery-points',
            name: 'Sorcery Points',
            description: 'Points for Metamagic options',
            maxUses: 2,
            rechargeType: 'long-rest'
          });
        }
      }
      break;

    case 'grappler':
      // Grapple advantages - handled in combat calculations
      break;

    case 'defensive-duelist':
      // Reaction parry - handled in combat system
      break;

    case 'sentinel':
      // Opportunity attack mechanics - handled in combat system
      break;

    // Armor Feats
    // Skill Feats
    case 'observant':
      // Passive Perception bonus - handled in skill calculations
      break;

    case 'keen-mind':
      // History/Arcana bonuses - handled in skill calculations
      break;

    case 'skill-expert':
      // Additional skill proficiency - handled during feat selection
      break;

    // Utility Feats
    case 'chef':
      // Cooking benefits - flavor feat
      break;

    case 'dungeon-delver':
      // Trap detection - handled in exploration
      break;

    case 'durable':
      // +1 to hit dice maximum
      character.hitDice.max += 1;
      character.hitDice.current += 1;
      break;

    case 'second-chance':
      // Can force creature to reroll attack once per short rest
      character.featEffects!.secondChance = true;
      // Add as a resource
      if (!character.resources) {
        character.resources = [];
      }
      character.resources.push({
        id: 'second-chance',
        name: 'Second Chance',
        description: 'Force creature to reroll attack',
        maxUses: 1,
        rechargeType: 'short-rest'
      });
      break;

    // Dragonborn Feats
    case 'dragon-fear':
      // Frightful presence - handled in combat
      break;

    case 'dragon-hide':
      // AC bonus - handled in AC calculations
      break;

    // Dwarf Feats
    case 'dwarf-fortitude':
      // Poison resistance - handled in saving throws
      break;

    // Elf Feats
    case 'elven-accuracy':
      // Dex skill advantages - handled in skill checks
      break;

    // Orc Feats
    case 'orcish-fury':
      // Rage damage bonus - handled in combat
      break;

    // Specialty Feats
    case 'crusher':
      // Force damage effects on critical hits
      character.featEffects!.crusher = true;
      break;

    case 'piercer':
      // Piercing damage effects on critical hits
      character.featEffects!.piercer = true;
      break;

    case 'slasher':
      // Slashing damage effects on critical hits
      character.featEffects!.slasher = true;
      break;

    case 'savage-attacker':
      // Reroll damage - handled in combat
      break;

    // Weapon Feats
    case 'weapon-master':
      // Weapon proficiencies - handled during feat selection
      break;

    case 'fighting-initiate':
      // Fighting style - handled during feat selection
      break;

    // Spell Feats
    case 'eldritch-adept':
      // Eldritch invocations - handled during feat selection
      break;

    case 'ritual-caster':
      // Ritual casting - handled in spellcasting
      break;

    // Tiefling Feats
    case 'infernal-constitution':
      // Fire resistance - handled in damage calculations
      break;

    // Dragon Feats
    case 'gift-of-the-chromatic-dragon':
      // Breath weapon - acid, cold, fire, lightning, or poison
      character.featEffects!.dragonBreathWeapon = {
        damageType: 'fire', // Default - would need player choice
        damageDice: '3d6',
        saveType: 'DEX',
        range: '15-foot cone'
      };
      break;

    case 'gift-of-the-gem-dragon':
      // Gem breath weapon - force, necrotic, psychic, radiant, or thunder
      character.featEffects!.dragonBreathWeapon = {
        damageType: 'force', // Default - would need player choice
        damageDice: '2d6',
        saveType: 'DEX',
        range: '10-foot cone'
      };
      break;

    case 'gift-of-the-metallic-dragon':
      // Healing breath - healing instead of damage
      character.featEffects!.dragonBreathWeapon = {
        damageType: 'healing', // Special case for healing
        damageDice: '2d6',
        saveType: 'none',
        range: '10-foot cone'
      };
      break;

    // Other Specialty Feats
    case 'fade-away':
      // Invisibility - handled in combat
      break;

    case 'fey-teleportation':
      // Misty step - already implemented as spell
      break;

    case 'flames-of-phlegethos':
      // Fire damage bonus - handled in combat
      break;

    case 'mounted-combatant':
      // Mounted combat bonuses - handled in combat
      break;

    case 'poisoner':
      // Poison weapon effects - handled in combat
      break;

    case 'skulker':
      // Stealth bonuses - handled in skill checks
      break;

    case 'squat-nimbleness':
      // Speed and size benefits - handled in character stats
      break;

    // Epic Boons (rare)
    case 'boon-of-combat-prowess':
      // Combat bonuses - handled in combat system
      break;

    // Default case
    default:
      // No special effects for this feat
      break;
  }
}

/**
 * Check if a character can level up
 */
export function canLevelUp(character: Character): boolean {
  return character.level < 20;
}

/**
 * Get all level-up choices for creating a high-level character
 * (e.g., creating a level 10 character requires 9 level-ups worth of choices)
 */
export function getHighLevelChoices(
  classSlug: string,
  edition: '2014' | '2024',
  targetLevel: number
): LevelUpData[] {
  const progression = getClassProgression(classSlug, edition);
  if (!progression) {
    return [];
  }

  const levelUpDataList: LevelUpData[] = [];

  for (let level = 2; level <= targetLevel; level++) {
    // Create a mock character at the previous level
    const mockCharacter = {
      level: level - 1,
      class: classSlug,
      edition,
      abilities: {
        CON: { score: 10, modifier: 0 }
      }
    } as Character;

    const levelUpData = calculateLevelUpData(mockCharacter);
    if (levelUpData) {
      levelUpDataList.push(levelUpData);
    }
  }

  return levelUpDataList;
}
