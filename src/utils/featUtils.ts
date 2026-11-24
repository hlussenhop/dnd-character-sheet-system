import { Feat, FeatPrerequisiteGroup, CharacterCreationData, Edition, AbilityName } from '../types/dnd';
import { getBackground, findSpeciesBySlug, getFeatBySlug, loadClasses, resolveFeatSlug, resolveSpeciesSlug } from '../services/dataService';
import { getSelectedVariant } from './speciesVariantUtils';

export interface FeatAvailability {
  isAvailable: boolean;
  reason?: string;
}

/** What a character has, for checking feat prerequisites. */
export interface FeatCharacterFacts {
  level?: number;
  edition?: Edition;
  classSlug?: string;
  subclassSlug?: string | null;
  abilities?: Partial<Record<AbilityName, number>>;
  speciesSlug?: string;
  selectedSpeciesVariant?: string;
  selectedLineage?: string;
  background?: string;
  selectedFeats?: string[];
  /** Armor/weapon/tool proficiencies beyond the class's own */
  proficiencies?: string[];
}

type FactsInput = FeatCharacterFacts | Partial<CharacterCreationData>;

const ABILITY_NAMES: Record<AbilityName, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};

/** Subclasses that bring the Spellcasting feature to a non-casting class at level 3. */
const CASTER_SUBCLASSES = ['eldritch-knight', 'arcane-trickster'];

/** Classes whose Fighting Style feature comes at level 1 (Fighter) or 2 (Paladin, Ranger). */
const FIGHTING_STYLE_LEVEL: Record<string, number> = { fighter: 1, paladin: 2, ranger: 2 };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Name words, keeping hyphenated names whole ("Half-Elf" is not an "Elf"). */
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim().split(' ').filter(Boolean));

const asFacts = (input: FactsInput): FeatCharacterFacts => {
  const legacy = input as { species?: string; feats?: string[] };
  return {
    ...(input as FeatCharacterFacts),
    speciesSlug: resolveSpeciesSlug(input.speciesSlug || legacy.species || '', input.edition),
    selectedFeats: (input.selectedFeats || legacy.feats || []).map(s => resolveFeatSlug(s, input.edition)),
  };
};

/**
 * Words naming the character's species, for matching "Elf", "Elf (Drow)", "Dwarf" prerequisites
 * against every record shape: 2014 subraces ("High Elf", "Drow (Dark Elf)", "Dwarf (Mark of Warding)"),
 * 2014 variants (Tiefling bloodlines) and 2024 lineages ("Elf" + lineage "Drow").
 */
export const speciesWords = (facts: FeatCharacterFacts): Set<string> => {
  const species = findSpeciesBySlug(facts.speciesSlug);
  const out = new Set<string>();
  if (!species) return out;
  const add = (name?: string) => name && words(name).forEach(w => out.add(w));
  add(species.name);
  add(getSelectedVariant(species, facts.selectedSpeciesVariant)?.name);
  add(facts.selectedLineage);
  return out;
};

const speciesMatches = (facts: FeatCharacterFacts, req: { name: string; subrace?: string }): boolean => {
  const have = speciesWords(facts);
  const needed = [...words(req.name), ...(req.subrace ? words(req.subrace) : [])];
  return needed.every(w => have.has(w));
};

const hasSpellcasting = (facts: FeatCharacterFacts): boolean => {
  const level = facts.level ?? 1;
  const cls = loadClasses(facts.edition).find(c => c.slug === facts.classSlug);
  if (cls?.spellcasting && level >= (cls.spellcasting.level ?? 1)) return true;
  return !!facts.subclassSlug && CASTER_SUBCLASSES.includes(facts.subclassSlug) && level >= 3;
};

const hasFeature = (facts: FeatCharacterFacts, feature: string): boolean => {
  const f = norm(feature);
  if (f === 'spellcasting' || f === 'pact magic') return hasSpellcasting(facts);
  if (f === 'fighting style') {
    const at = FIGHTING_STYLE_LEVEL[facts.classSlug ?? ''];
    return at !== undefined && (facts.level ?? 1) >= at;
  }
  // Other class features are not tracked; do not block on them.
  return true;
};

const proficiencyList = (facts: FeatCharacterFacts): string[] => {
  const cls = loadClasses(facts.edition).find(c => c.slug === facts.classSlug);
  return [
    ...(cls?.proficiencies?.armor ?? []),
    ...(cls?.proficiencies?.weapons ?? []),
    ...(cls?.proficiencies?.tools ?? []),
    ...(facts.proficiencies ?? []),
  ].map(norm);
};

const hasProficiency = (facts: FeatCharacterFacts, req: { armor?: string; weapon?: string; tool?: string }): boolean => {
  const have = proficiencyList(facts);
  if (req.armor) {
    const armor = norm(req.armor);
    return have.includes(armor) || have.includes('all armor') || (armor === 'shields' && have.includes('shield'));
  }
  if (req.weapon) {
    const weapon = norm(req.weapon);
    // "Martial Weapons (Finesse or Light)" still counts as proficiency with a martial weapon
    return have.some(p => p.startsWith(weapon) || (weapon === 'martial weapons' && p.includes('martial')));
  }
  // Tool proficiencies come from many places the wizard does not collect yet; do not block on them.
  return true;
};

const featCategoriesHeld = (facts: FeatCharacterFacts, except: string) =>
  new Set((facts.selectedFeats ?? []).filter(s => s !== except).map(s => getFeatBySlug(s, facts.edition)?.category));

const backgroundMatches = (facts: FeatCharacterFacts, names: string[]): boolean => {
  const bg = getBackground(facts.background);
  const have = norm(bg?.name ?? facts.background ?? '');
  return names.some(n => norm(n) === have);
};

/** The first unmet condition of one prerequisite group, as a reason; undefined when the group is met. */
const unmetInGroup = (feat: Feat, g: FeatPrerequisiteGroup, facts: FeatCharacterFacts): string | undefined => {
  const level = facts.level ?? 1;
  if (g.level !== undefined) {
    if (g.className) {
      if (facts.classSlug !== norm(g.className).replace(/ /g, '-') || level < g.level) {
        return `Requires level ${g.level} ${g.className}`;
      }
    } else if (level < g.level) {
      return `Requires level ${g.level}+`;
    }
  }
  if (g.abilities?.length) {
    const ok = g.abilities.some(alt =>
      (Object.entries(alt) as Array<[AbilityName, number]>).every(([a, min]) => (facts.abilities?.[a] ?? 10) >= min));
    if (!ok) {
      const alternatives = g.abilities.map(alt =>
        (Object.entries(alt) as Array<[AbilityName, number]>).map(([a, min]) => `${ABILITY_NAMES[a]} ${min}+`).join(' and '));
      return `Requires ${alternatives.join(' or ')}`;
    }
  }
  if (g.species?.length && !g.species.some(s => speciesMatches(facts, s))) {
    return `Requires ${g.species.map(s => (s.subrace ? `${s.name} (${s.subrace})` : s.name)).join(' or ')}`;
  }
  if (g.spellcasting && !hasSpellcasting(facts)) {
    return 'Requires the Spellcasting or Pact Magic feature';
  }
  if (g.features?.length && !g.features.some(f => hasFeature(facts, f))) {
    return `Requires the ${g.features.join(' or ')} feature`;
  }
  if (g.feats?.length && !g.feats.some(s => facts.selectedFeats?.includes(s))) {
    return `Requires the ${g.feats.map(s => getFeatBySlug(s)?.name ?? s).join(' or ')} feat`;
  }
  if (g.proficiencies?.length && !g.proficiencies.some(p => hasProficiency(facts, p))) {
    return `Requires proficiency with ${g.proficiencies.map(p => p.armor ?? p.weapon ?? p.tool).join(' or ')}`;
  }
  if (g.backgrounds?.length && !backgroundMatches(facts, g.backgrounds)) {
    return `Requires the ${g.backgrounds.join(' or ')} background`;
  }
  if (g.featCategories?.length) {
    const held = featCategoriesHeld(facts, feat.slug);
    if (!g.featCategories.some(c => held.has(c))) {
      return `Requires a ${g.featCategories.map(c => c.replace('_', ' ')).join(' or ')} feat`;
    }
  }
  if (g.exclusiveFeatCategories?.length) {
    const held = featCategoriesHeld(facts, feat.slug);
    const clash = g.exclusiveFeatCategories.find(c => held.has(c));
    if (clash) return `Only one ${clash.replace('_', ' ')} feat allowed`;
  }
  return undefined;
};

/**
 * Calculate how many feats a character can take based on their level and edition
 * Feats are available at levels 4, 8, 12, 16, 19 (every 4 levels starting at 4)
 * For 2024 Human and 2014 Custom Lineage, gain an additional feat at Level 1.
 */
export const calculateFeatAvailability = (
  data: CharacterCreationData | number,
  edition?: Edition,
  speciesSlug?: string
): number => {
  const level = typeof data === 'number' ? data : data.level;
  const effectiveEdition = typeof data === 'number' ? edition : data.edition;
  const effectiveSpecies = typeof data === 'number' ? speciesSlug : data.speciesSlug;
  let baseFeats = Math.floor((level - 1) / 4); // Standard feat progression from level 4

  // 2024 Human additional feat at Level 1
  if (effectiveEdition === '2024' && effectiveSpecies === 'human-2024') {
    baseFeats += 1; // 2024 Humans get an extra feat at Level 1
  }

  // 2014 Custom Lineage (TCE) grants one feat at Level 1
  if (effectiveEdition === '2014' && effectiveSpecies === 'custom-lineage') {
    baseFeats += 1;
  }

  // Ensure minimum of 0 feats
  return Math.max(0, baseFeats);
};

/**
 * Check if a feat's prerequisites are met by the character
 */
export const checkFeatPrerequisites = (feat: Feat, character: FactsInput): boolean => {
  return getFeatAvailability(feat, character).isAvailable;
};

/**
 * Return availability state and a human-readable reason if unavailable.
 * Feats belong to one edition; a character only sees the feats of its own edition.
 */
export const getFeatAvailability = (
  feat: Feat,
  character: FactsInput
): FeatAvailability => {
  const facts = asFacts(character);
  if (facts.edition && feat.edition && feat.edition !== facts.edition) {
    return { isAvailable: false, reason: `${feat.edition} rules feat` };
  }
  const groups = feat.prerequisites?.anyOf ?? [];
  if (groups.length === 0) {
    const level = feat.prerequisites?.level;
    return level && (facts.level ?? 1) < level
      ? { isAvailable: false, reason: `Requires level ${level}+` }
      : { isAvailable: true };
  }
  const reasons = groups.map(g => unmetInGroup(feat, g, facts));
  if (reasons.some(r => r === undefined)) return { isAvailable: true };
  const unique = Array.from(new Set(reasons as string[]));
  const reason = unique.every(r => r.startsWith('Requires '))
    ? `Requires ${unique.map(r => r.slice('Requires '.length)).join(' or ')}`
    : unique[0];
  return { isAvailable: false, reason };
};

/**
 * Filter feats based on character data and prerequisites
 */
export const filterAvailableFeats = (allFeats: Feat[], character: FactsInput): Feat[] => {
  return allFeats.filter(feat => checkFeatPrerequisites(feat, character));
};

/** Feats of one edition (all feats when no edition is given). */
export const featsForEdition = (allFeats: Feat[], edition?: Edition): Feat[] =>
  edition ? allFeats.filter(f => f.edition === edition) : allFeats;

/**
 * Check if a feat provides ability score increases
 */
export const featProvidesAbilityIncrease = (feat: Feat): boolean => {
  return !!feat.abilityScoreIncrease;
};

/**
 * Get the source information for a feat
 */
export const getFeatSourceInfo = (feat: Feat): string => {
  return `${feat.source} ${feat.year}`;
};

/**
 * Check if the character has reached the maximum number of feats for their level
 */
export const canSelectMoreFeats = (currentFeats: string[], data: CharacterCreationData | number): boolean => {
  const maxFeats = calculateFeatAvailability(data);
  return currentFeats.length < maxFeats;
};

/**
 * Feats a character can pick in a context:
 * - background: Origin feats (2024)
 * - fighting_style: Fighting Style feats, for classes with the Fighting Style feature
 * - asi: an Ability Score Improvement slot (General, Origin and Dragonmark feats; Epic Boons at 19+);
 *   for 2014 characters every feat is a general feat
 */
export const getAvailableFeatsForCharacter = (
  allFeats: Feat[],
  character: FactsInput,
  context: 'asi' | 'fighting_style' | 'background' = 'asi'
): Feat[] => {
  const level = character.level || 1;
  const classSlug = character.classSlug || '';

  return featsForEdition(allFeats, character.edition).filter(feat => {
    switch (context) {
      case 'background':
        return feat.category === 'origin';

      case 'fighting_style':
        if (!['fighter', 'paladin', 'ranger'].includes(classSlug)) return false;
        return feat.category === 'fighting_style';

      case 'asi':
      default:
        if (level < 4) return false;
        if (feat.category === 'epic_boon') return level >= 19;
        return ['general', 'origin', 'dragonmark'].includes(feat.category);
    }
  }).filter(feat => getFeatAvailability(feat, character).isAvailable);
};

/**
 * Enhanced prerequisite checking for 2024 system
 */
export const checkFeatPrerequisites2024 = (feat: Feat, character: FactsInput): boolean => {
  return getFeatAvailability(feat, character).isAvailable;
};

/**
 * Validate feat selection for a character
 */
export const validateFeatSelection = (selectedFeats: string[], allFeats: Feat[], character: Partial<CharacterCreationData>): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  const maxFeats = calculateFeatAvailability(
    character.level || 1,
    character.edition,
    character.speciesSlug
  );

  if (selectedFeats.length > maxFeats) {
    errors.push(`Too many feats selected. Maximum ${maxFeats} allowed at level ${character.level}.`);
  }

  // Duplicates are only allowed for repeatable feats
  const seen = new Set<string>();
  const duplicate = selectedFeats.some(slug => {
    const repeated = seen.has(slug) && !allFeats.find(f => f.slug === slug)?.repeatable;
    seen.add(slug);
    return repeated;
  });
  if (duplicate) errors.push('Duplicate feats selected.');

  selectedFeats.forEach(featSlug => {
    const feat = allFeats.find(f => f.slug === featSlug);
    if (feat && !checkFeatPrerequisites2024(feat, character)) {
      errors.push(`Prerequisites not met for feat: ${feat.name}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};
