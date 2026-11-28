import type { Character } from '../types/dnd';

/** Firebase turns an empty array into `{}` and a sparse array into an object. Both crash `.map`. */
export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, T>;
  const keys = Object.keys(record);
  if (keys.length === 0) return [];
  if (!keys.every(key => /^\d+$/.test(key))) return [];
  return keys
    .map(Number)
    .sort((left, right) => left - right)
    .map(key => record[String(key)])
    .filter((item): item is T => item !== undefined && item !== null);
}

/** Spell slot tables are number lists. A missing index reads as 0, and the length stays bounded. */
export function asNumberList(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(entry => (typeof entry === 'number' && Number.isFinite(entry) ? entry : 0));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const indexes = Object.keys(record)
    .map(Number)
    .filter(index => Number.isInteger(index) && index >= 0 && index < 20);
  if (indexes.length === 0) return [];
  const length = Math.max(...indexes) + 1;
  return Array.from({ length }, (_, index) => {
    const entry = record[String(index)];
    return typeof entry === 'number' && Number.isFinite(entry) ? entry : 0;
  });
}

const listOrSame = <T>(value: T[] | undefined): T[] | undefined =>
  value === undefined ? undefined : asList<T>(value);

/** Put list fields back into arrays so the sheet can render a character that just round-tripped through the cloud. */
export function normalizeCharacter(character: Character): Character {
  const features = character.featuresAndTraits;
  const spell = character.spellcasting;
  const proficiencies = character.proficiencies;
  const srd = character.srdFeatures;
  return {
    ...character,
    languages: listOrSame(character.languages),
    expertiseSkills: listOrSame(character.expertiseSkills),
    weaponMastery: listOrSame(character.weaponMastery),
    eldritchInvocations: listOrSame(character.eldritchInvocations),
    optionalFeatures: listOrSame(character.optionalFeatures),
    damageResistances: listOrSame(character.damageResistances),
    conditionImmunities: listOrSame(character.conditionImmunities),
    damageImmunities: listOrSame(character.damageImmunities),
    savingThrowProficiencies: listOrSame(character.savingThrowProficiencies),
    selectedFeats: listOrSame(character.selectedFeats),
    feats: listOrSame(character.feats),
    inventory: listOrSame(character.inventory),
    equippedWeapons: listOrSame(character.equippedWeapons),
    conditions: listOrSame(character.conditions),
    resources: listOrSame(character.resources),
    levelHistory: listOrSame(character.levelHistory),
    classes: listOrSame(character.classes),
    hitDice: character.hitDice ?? {
      current: character.level || 1,
      max: character.level || 1,
      dieType: 8,
    },
    proficiencies: proficiencies
      ? {
          armor: asList(proficiencies.armor),
          weapons: asList(proficiencies.weapons),
          tools: asList(proficiencies.tools),
        }
      : proficiencies,
    featuresAndTraits: features
      ? {
          ...features,
          classFeatures: asList(features.classFeatures),
          speciesTraits: asList(features.speciesTraits),
          backgroundFeatures: asList(features.backgroundFeatures),
          musicalInstrumentProficiencies: asList(features.musicalInstrumentProficiencies),
        }
      : features,
    spellcasting: spell
      ? {
          ...spell,
          cantripsKnown: asList(spell.cantripsKnown),
          spellsKnown: listOrSame(spell.spellsKnown),
          spellbook: listOrSame(spell.spellbook),
          preparedSpells: listOrSame(spell.preparedSpells),
          spellSlots: asNumberList(spell.spellSlots),
          usedSpellSlots: asNumberList(spell.usedSpellSlots),
          featGrantedSpells: listOrSame(spell.featGrantedSpells),
          classCasting: listOrSame(spell.classCasting),
        }
      : spell,
    srdFeatures: srd
      ? {
          classFeatures: asList(srd.classFeatures),
          subclassFeatures: asList(srd.subclassFeatures),
        }
      : srd,
  };
}
