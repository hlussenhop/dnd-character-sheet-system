import { describe, it, expect } from 'vitest';
import {
  getHitDieForClass,
  getSpellsForClass,
  getCantripsByClass,
  getLeveledSpellsByClass,
  aggregateProficiencies,
  getRaceProficiencies,
  getClassProficiencies,
  loadRaces,
  loadClasses,
  SPELL_DATABASE,
  resolveSpeciesSlug,
  SPECIES_CATEGORIES,
  SPECIES_LANGUAGE_MAP
} from '../services/dataService';
import nameData from '../data/nameData.json';

describe('Data Service Functions', () => {
  describe('getHitDieForClass', () => {
    it('should return correct hit die for each class', () => {
      expect(getHitDieForClass('barbarian')).toBe(12);
      expect(getHitDieForClass('fighter')).toBe(10);
      expect(getHitDieForClass('paladin')).toBe(10);
      expect(getHitDieForClass('ranger')).toBe(10);
      expect(getHitDieForClass('bard')).toBe(8);
      expect(getHitDieForClass('cleric')).toBe(8);
      expect(getHitDieForClass('druid')).toBe(8);
      expect(getHitDieForClass('monk')).toBe(8);
      expect(getHitDieForClass('rogue')).toBe(8);
      expect(getHitDieForClass('sorcerer')).toBe(6);
      expect(getHitDieForClass('warlock')).toBe(8);
      expect(getHitDieForClass('wizard')).toBe(6);
    });

    it('should handle class name variations', () => {
      expect(getHitDieForClass('wizard-evocation')).toBe(6); // Subclass
      expect(getHitDieForClass('fighter-champion')).toBe(10); // Subclass
    });

    it('should return default d8 for unknown classes', () => {
      expect(getHitDieForClass('unknown-class')).toBe(8);
      expect(getHitDieForClass('')).toBe(8);
    });
  });

  describe('Spell Functions', () => {
    it('should return spells for wizard class', () => {
      const spells = getSpellsForClass('wizard');
      expect(spells.length).toBeGreaterThan(0);
      expect(spells.some(spell => spell.name.includes('Magic Missile'))).toBe(true);
    });

    it('should return cantrips for cleric class', () => {
      const cantrips = getCantripsByClass('cleric');
      expect(cantrips.length).toBeGreaterThan(0);
      expect(cantrips.every(spell => spell.level === 0)).toBe(true);
    });

    it('should return leveled spells for wizard class', () => {
      const spells = getLeveledSpellsByClass('wizard', 1);
      expect(spells.length).toBeGreaterThan(0);
      expect(spells.every(spell => spell.level === 1)).toBe(true);
    });

    it('should include source information in spells', () => {
      const spells = SPELL_DATABASE;
      expect(spells.length).toBeGreaterThan(300); // Should have merged spells

      // Check that all spells have source field
      expect(spells.every(spell => spell.source === '2014' || spell.source === '2024')).toBe(true);

      // Check that we have both sources
      const sources = [...new Set(spells.map(s => s.source))];
      expect(sources.length).toBeGreaterThan(1); // Should have both 2014 and 2024
      expect(sources).toContain('2014');
      expect(sources).toContain('2024');
    });

    it('should have unique slugs across both editions', () => {
      const slugs = SPELL_DATABASE.map(s => s.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });

    it('should keep shared-name spells for both editions', () => {
      const fireballs = SPELL_DATABASE.filter(s => s.name === 'Fireball');
      expect(fireballs.map(s => s.source).sort()).toEqual(['2014', '2024']);
    });

    it('should resolve the legacy slugs that saved characters and trait data reference', () => {
      // TRAIT_SPELL_MAP (Infernal Legacy) and saved characters use un-suffixed slugs
      ['thaumaturgy', 'hellish-rebuke', 'darkness', 'fireball'].forEach(slug => {
        const spell = SPELL_DATABASE.find(s => s.slug === slug);
        expect(spell, slug).toBeDefined();
        expect(spell?.source).toBe('2024');
      });
    });

    it('should never list the same spell twice when no edition is given', () => {
      ['wizard', 'cleric', 'warlock'].forEach(cls => {
        const names = getSpellsForClass(cls).map(s => s.name);
        expect(new Set(names).size).toBe(names.length);
      });
    });

    it('should filter by edition when one is given', () => {
      const wizard2014 = getSpellsForClass('wizard', '2014');
      const wizard2024 = getSpellsForClass('wizard', '2024');
      expect(wizard2014.length).toBeGreaterThan(0);
      expect(wizard2014.every(s => s.source === '2014')).toBe(true);
      expect(wizard2024.every(s => s.source === '2024')).toBe(true);
    });
  });

  describe('Proficiency Functions', () => {
    it('should return race proficiencies for dwarf', () => {
      const proficiencies = getRaceProficiencies('mountain-dwarf');
      expect(proficiencies).toHaveProperty('armor');
      expect(proficiencies).toHaveProperty('weapons');
      expect(proficiencies).toHaveProperty('tools');
    });

    it('should return class proficiencies for fighter', () => {
      const proficiencies = getClassProficiencies('fighter');
      expect(proficiencies).toHaveProperty('armor');
      expect(proficiencies).toHaveProperty('weapons');
    });

    it('should aggregate proficiencies correctly', () => {
      const proficiencies = aggregateProficiencies('mountain-dwarf', 'fighter', 'soldier');
      expect(proficiencies.armor).toBeDefined();
      expect(proficiencies.weapons).toBeDefined();
      expect(Array.isArray(proficiencies.armor)).toBe(true);
      expect(Array.isArray(proficiencies.weapons)).toBe(true);
    });
  });

  describe('Data Loading', () => {
    it('should load races successfully', () => {
      const races = loadRaces();
      expect(races.length).toBeGreaterThan(0);
      expect(races[0]).toHaveProperty('slug');
      expect(races[0]).toHaveProperty('name');
      expect(races[0]).toHaveProperty('speed');
    });

    it('should load classes successfully', () => {
      const classes = loadClasses();
      expect(classes.length).toBeGreaterThan(0);
      expect(classes[0]).toHaveProperty('slug');
      expect(classes[0]).toHaveProperty('name');
      expect(classes[0]).toHaveProperty('hit_die');
    });

    it('should resolve legacy species slugs to canonical', () => {
      // 2024 characters carrying an old unsuffixed slug migrate to the 2024 record
      expect(resolveSpeciesSlug('mountain-dwarf', '2024')).toBe('dwarf-2024');
      expect(resolveSpeciesSlug('human', '2024')).toBe('human-2024');
      expect(resolveSpeciesSlug('Aasimar', '2024')).toBe('aasimar-2024');
      // renamed species keep resolving
      expect(resolveSpeciesSlug('yuan-ti-pureblood')).toBe('yuan-ti');
      expect(resolveSpeciesSlug('fire-genasi')).toBe('genasi');
    });

    it('keeps 2014 slugs on their 2014 species', () => {
      ['human', 'mountain-dwarf', 'high-elf', 'aasimar', 'goliath', 'orc', 'half-orc'].forEach(slug => {
        expect(resolveSpeciesSlug(slug)).toBe(slug);
        expect(resolveSpeciesSlug(slug, '2014')).toBe(slug);
      });
      expect(resolveSpeciesSlug('Human', '2014')).toBe('human');
      expect(resolveSpeciesSlug('human-2024', '2024')).toBe('human-2024');
    });

    it('should provide core and expanded categories', () => {
      expect(SPECIES_CATEGORIES.length).toBe(2);
      const coreCat = SPECIES_CATEGORIES.find(c => c.name.includes('Core'));
      const expandedCat = SPECIES_CATEGORIES.find(c => c.name.includes('Expanded'));
      expect(coreCat).toBeDefined();
      expect(expandedCat).toBeDefined();
      expect(coreCat?.species.every(s => s.core)).toBe(true);
      expect(expandedCat?.species.every(s => s.expanded)).toBe(true);
    });

    it('should have names and languages for canonical species', () => {
      const required = ['human-2024','elf-2024','dwarf-2024','halfling-2024','gnome-2024','dragonborn-2024','orc-2024','tiefling-2024','aasimar-2024','goliath-2024'];
      required.forEach(slug => {
        expect((nameData as any).species[slug]).toBeDefined();
        expect(SPECIES_LANGUAGE_MAP[slug]).toBeDefined();
      });
    });
  });
});
