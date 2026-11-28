import { describe, expect, it } from 'vitest';
import { personalitySpeciesOptions, resolvePersonalitySpecies } from './personalitySpecies';

describe('resolvePersonalitySpecies', () => {
  it('maps quiz labels onto a species that exists for the edition', () => {
    expect(resolvePersonalitySpecies('Human', '2024')?.slug).toBe('human-2024');
    expect(resolvePersonalitySpecies('Half-Elf', '2024')?.slug).toBe('elf-2024');
    expect(resolvePersonalitySpecies('Half-Orc', '2024')?.slug).toBe('orc-2024');
    expect(resolvePersonalitySpecies('Human (Variant)', '2024')?.slug).toBe('human-2024');
    expect(resolvePersonalitySpecies('Tabaxi', '2014')?.slug).toBe('tabaxi');
    expect(resolvePersonalitySpecies('Elf', '2014')?.name).toBe('High Elf');
    expect(resolvePersonalitySpecies('Dwarf', '2014')?.name).toBe('Hill Dwarf');
    expect(resolvePersonalitySpecies('Halfling', '2014')?.name).toBe('Lightfoot Halfling');
    expect(resolvePersonalitySpecies('Gnome', '2014')?.name).toBe('Forest Gnome');
  });

  it('always offers a playable species when every recommendation is from the other edition', () => {
    const options = personalitySpeciesOptions(
      [
        { race: 'Halfling', reason: 'small and lucky' },
        { race: 'Gnome', reason: 'clever' },
        { race: 'Dwarf', reason: 'tough' },
      ],
      '2014',
    );
    expect(options.map(option => option.name)).toEqual([
      'Lightfoot Halfling',
      'Forest Gnome',
      'Hill Dwarf',
    ]);
  });
});
