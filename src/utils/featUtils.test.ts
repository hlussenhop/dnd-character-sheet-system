import { describe, expect, it } from 'vitest';
import { checkFeatPrerequisites, featsForEdition, getAvailableFeatsForCharacter, getFeatAvailability } from './featUtils';
import { getFeatBySlug, loadFeats } from '../services/dataService';
import type { Feat } from '../types/dnd';

const abilities = (score = 10) => ({ STR: score, DEX: score, CON: score, INT: score, WIS: score, CHA: score });
const feat = (slug: string) => {
  const f = getFeatBySlug(slug);
  if (!f) throw new Error(`missing feat ${slug}`);
  return f;
};
const char2014 = (overrides = {}) => ({ level: 5, edition: '2014' as const, classSlug: 'wizard', abilities: abilities(), ...overrides });
const char2024 = (overrides = {}) => ({ level: 5, edition: '2024' as const, classSlug: 'wizard', abilities: abilities(), ...overrides });

describe('featUtils - species prerequisites', () => {
  it('matches 2014 subraces by species name, not by a fixed slug list', () => {
    const fortitude = feat('dwarven-fortitude');
    expect(checkFeatPrerequisites(fortitude, char2014({ speciesSlug: 'hill-dwarf' }))).toBe(true);
    expect(checkFeatPrerequisites(fortitude, char2014({ speciesSlug: 'mountain-dwarf' }))).toBe(true);
    expect(checkFeatPrerequisites(fortitude, char2014({ speciesSlug: 'dwarf-mark-of-warding' }))).toBe(true);
    expect(checkFeatPrerequisites(fortitude, char2014({ speciesSlug: 'human' }))).toBe(false);
  });

  it('checks the subrace (Elf (Drow), Elf (High))', () => {
    const drowMagic = feat('drow-high-magic');
    expect(checkFeatPrerequisites(drowMagic, char2014({ speciesSlug: 'drow' }))).toBe(true);
    expect(checkFeatPrerequisites(drowMagic, char2014({ speciesSlug: 'high-elf' }))).toBe(false);
    const feyTeleport = feat('fey-teleportation');
    expect(checkFeatPrerequisites(feyTeleport, char2014({ speciesSlug: 'high-elf' }))).toBe(true);
    expect(checkFeatPrerequisites(feyTeleport, char2014({ speciesSlug: 'wood-elf' }))).toBe(false);
  });

  it('treats Half-Elf as its own species: only feats that name it accept it', () => {
    const halfElf = char2014({ speciesSlug: 'half-elf' });
    expect(checkFeatPrerequisites(feat('elven-accuracy'), halfElf)).toBe(true);
    expect(checkFeatPrerequisites(feat('drow-high-magic'), halfElf)).toBe(false);
    expect(checkFeatPrerequisites(feat('prodigy'), halfElf)).toBe(true);
    expect(checkFeatPrerequisites(feat('orcish-fury'), char2014({ speciesSlug: 'orc' }))).toBe(false);
    expect(checkFeatPrerequisites(feat('orcish-fury'), char2014({ speciesSlug: 'half-orc' }))).toBe(true);
  });

  it('matches variants and 2024 lineages', () => {
    expect(checkFeatPrerequisites(feat('flames-of-phlegethos'), char2014({ speciesSlug: 'tiefling', selectedSpeciesVariant: 'zariel' }))).toBe(true);
    expect(checkFeatPrerequisites(feat('dragon-hide'), char2014({ speciesSlug: 'dragonborn-chromatic' }))).toBe(true);
    const drowOnly: Feat = {
      ...feat('alert-2024'),
      slug: 'test-drow',
      prerequisites: { anyOf: [{ species: [{ name: 'Elf', subrace: 'Drow' }] }] },
    };
    expect(checkFeatPrerequisites(drowOnly, char2024({ speciesSlug: 'elf-2024', selectedLineage: 'Drow' }))).toBe(true);
    expect(checkFeatPrerequisites(drowOnly, char2024({ speciesSlug: 'elf-2024', selectedLineage: 'High Elf' }))).toBe(false);
  });

  it('explains why a feat is unavailable', () => {
    const availability = getFeatAvailability(feat('dwarven-fortitude'), char2014({ speciesSlug: 'human' }));
    expect(availability.isAvailable).toBe(false);
    expect(availability.reason).toBe('Requires Dwarf');
  });
});

describe('featUtils - other prerequisites', () => {
  it('accepts any of the ability alternatives', () => {
    const athlete = feat('athlete-2024');
    expect(checkFeatPrerequisites(athlete, char2024())).toBe(false);
    expect(checkFeatPrerequisites(athlete, char2024({ abilities: { ...abilities(), DEX: 13 } }))).toBe(true);
    expect(getFeatAvailability(athlete, char2024()).reason).toBe('Requires Strength 13+ or Dexterity 13+');
  });

  it('checks level, feats held and feat categories', () => {
    const greater = feat('greater-mark-of-detection-2024');
    expect(checkFeatPrerequisites(greater, char2024())).toBe(false);
    expect(checkFeatPrerequisites(greater, char2024({ selectedFeats: ['mark-of-detection-2024'] }))).toBe(true);
    expect(checkFeatPrerequisites(greater, char2024({ level: 3, selectedFeats: ['mark-of-detection-2024'] }))).toBe(false);
    const potent = feat('potent-dragonmark-2024');
    expect(checkFeatPrerequisites(potent, char2024({ selectedFeats: ['mark-of-healing-2024'] }))).toBe(true);
    expect(checkFeatPrerequisites(potent, char2024({ selectedFeats: ['alert-2024'] }))).toBe(false);
  });

  it('allows only one Dragonmark feat', () => {
    const mark = feat('mark-of-shadow-2024');
    expect(checkFeatPrerequisites(mark, char2024())).toBe(true);
    expect(getFeatAvailability(mark, char2024({ selectedFeats: ['mark-of-healing-2024'] })).reason).toBe('Only one dragonmark feat allowed');
  });

  it('checks spellcasting, armor proficiency and the Fighting Style feature', () => {
    expect(checkFeatPrerequisites(feat('war-caster'), char2014({ classSlug: 'wizard' }))).toBe(true);
    expect(checkFeatPrerequisites(feat('war-caster'), char2014({ classSlug: 'barbarian' }))).toBe(false);
    expect(checkFeatPrerequisites(feat('heavy-armor-master'), char2014({ classSlug: 'fighter' }))).toBe(true);
    expect(checkFeatPrerequisites(feat('heavy-armor-master'), char2014({ classSlug: 'rogue' }))).toBe(false);
    expect(checkFeatPrerequisites(feat('archery-2024'), char2024({ classSlug: 'fighter', level: 1 }))).toBe(true);
    expect(checkFeatPrerequisites(feat('archery-2024'), char2024({ classSlug: 'ranger', level: 1 }))).toBe(false);
  });

  it('keeps feats to their own edition', () => {
    expect(getFeatAvailability(feat('alert'), char2024()).reason).toBe('2014 rules feat');
    expect(checkFeatPrerequisites(feat('alert-2024'), char2024())).toBe(true);
    expect(featsForEdition(loadFeats(), '2014').every(f => f.edition === '2014')).toBe(true);
  });
});

describe('featUtils - feat lists per context', () => {
  it('offers General, Origin and Dragonmark feats in an ASI slot, and Epic Boons from level 19', () => {
    const at8 = getAvailableFeatsForCharacter(loadFeats(), char2024({ level: 8, abilities: abilities(13) }), 'asi');
    const categories = new Set(at8.map(f => f.category));
    expect([...categories].sort()).toEqual(['dragonmark', 'general', 'origin']);
    expect(at8.every(f => f.edition === '2024')).toBe(true);
    const at19 = getAvailableFeatsForCharacter(loadFeats(), char2024({ level: 19, abilities: abilities(13) }), 'asi');
    expect(at19.some(f => f.category === 'epic_boon')).toBe(true);
  });

  it('filters species feats out for the wrong species', () => {
    const humanFeats = getAvailableFeatsForCharacter(loadFeats(), char2014({ speciesSlug: 'human' }), 'asi').map(f => f.slug);
    expect(humanFeats).not.toContain('dwarven-fortitude');
    expect(humanFeats).not.toContain('dragon-hide');
    expect(humanFeats).toContain('prodigy');
  });

  it('lists Origin feats for a background and Fighting Style feats for fighters', () => {
    const origin = getAvailableFeatsForCharacter(loadFeats(), char2024({ level: 1 }), 'background');
    expect(origin.map(f => f.slug)).toEqual(expect.arrayContaining(['alert-2024', 'tough-2024', 'magic-initiate-cleric-2024']));
    const styles = getAvailableFeatsForCharacter(loadFeats(), char2024({ level: 1, classSlug: 'fighter' }), 'fighting_style');
    expect(styles.map(f => f.slug)).toContain('archery-2024');
  });
});
