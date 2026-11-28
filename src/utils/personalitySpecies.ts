import { getAllSpecies } from '../services/dataService';
import type { Edition, Species } from '../types/dnd';

/** Names the personality quiz uses that are not species records in every edition. */
const ALIASES: Record<string, string[]> = {
  'Human (Variant)': ['Human'],
  'Half-Elf': ['Half-Elf', 'Elf', 'High Elf'],
  'Half-Orc': ['Half-Orc', 'Orc'],
  Elf: ['Elf', 'High Elf', 'Wood Elf'],
  Dwarf: ['Dwarf', 'Hill Dwarf', 'Mountain Dwarf'],
  Halfling: ['Halfling', 'Lightfoot Halfling', 'Stout Halfling'],
  Gnome: ['Gnome', 'Forest Gnome', 'Rock Gnome'],
  'High Elf': ['High Elf', 'Elf'],
  'Wood Elf': ['Wood Elf', 'Elf'],
  'Elf (Wood Elf)': ['Wood Elf', 'Elf'],
  'Gnome (Forest Gnome)': ['Forest Gnome', 'Gnome'],
};

export function resolvePersonalitySpecies(label: string, edition: Edition): Species | null {
  const pool = getAllSpecies(edition);
  const stripped = label.replace(/ \([^)]*\)$/, '').trim();
  const candidates = [label, stripped, ...(ALIASES[label] ?? []), ...(ALIASES[stripped] ?? [])];
  const seen = new Set<string>();
  for (const name of candidates) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const match = pool.find(species => species.name === name);
    if (match) return match;
  }
  return null;
}

export function personalitySpeciesOptions(
  recommendations: Array<{ race: string; reason: string }>,
  edition: Edition,
): Array<{ name: string; reason: string }> {
  const seen = new Set<string>();
  const options: Array<{ name: string; reason: string }> = [];
  for (const recommendation of recommendations) {
    const species = resolvePersonalitySpecies(recommendation.race, edition);
    if (!species || seen.has(species.name)) continue;
    seen.add(species.name);
    options.push({ name: species.name, reason: recommendation.reason });
  }
  if (options.length === 0) {
    for (const species of getAllSpecies(edition).slice(0, 3)) {
      options.push({ name: species.name, reason: 'Available in this edition' });
    }
  }
  return options;
}
