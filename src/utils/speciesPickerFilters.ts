import type { Edition } from '../types/dnd';
import { monsterSourceLabel } from './monsterUtils';

export type SpeciesGroupFilter = 'core' | 'expanded';
export type SpeciesPickerSort = 'name' | 'source' | 'speed';

const SPECIES_SOURCE_LABELS: Record<string, string> = {
  'PHB 2024': "Player's Handbook (2024)",
  SCAG: "Sword Coast Adventurer's Guide",
};

export const SPECIES_PICKER_TAGS: { id: string; label: string }[] = [
  { id: 'monstrous', label: 'Monstrous' },
  { id: 'fey', label: 'Fey' },
  { id: 'planar', label: 'Planar' },
  { id: 'elemental', label: 'Elemental' },
  { id: 'undead', label: 'Undead' },
  { id: 'construct', label: 'Construct' },
  { id: 'draconic', label: 'Draconic' },
  { id: 'dragonmark', label: 'Dragonmark' },
  { id: 'eberron', label: 'Eberron' },
  { id: 'ravenloft', label: 'Ravenloft' },
  { id: 'lorwyn', label: 'Lorwyn' },
  { id: 'wildemount', label: 'Wildemount' },
  { id: 'exotic', label: 'Exotic' },
];

export function speciesSourceLabel(source?: string): string {
  if (!source) return '';
  return SPECIES_SOURCE_LABELS[source] ?? monsterSourceLabel(source);
}

export interface SpeciesPickerEntry {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  speed: number;
  core?: boolean;
  expanded?: boolean;
  tags?: string[];
  creatureType?: string;
  species_traits?: string[];
}

export interface SpeciesPickerFilters {
  search: string;
  groups: SpeciesGroupFilter[];
  sources: string[];
  tags: string[];
  sort: SpeciesPickerSort;
}

export const EMPTY_SPECIES_PICKER_FILTERS: SpeciesPickerFilters = {
  search: '',
  groups: [],
  sources: [],
  tags: [],
  sort: 'name',
};

/** Chosen filters beyond search and sort. */
export function speciesFilterCount(filters: SpeciesPickerFilters): number {
  return filters.groups.length + filters.sources.length + filters.tags.length;
}

export function filterPickerSpecies<T extends SpeciesPickerEntry>(
  species: T[],
  filters: SpeciesPickerFilters,
): T[] {
  const tokens = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = species.filter(entry => {
    if (filters.groups.length > 0) {
      const group = entry.core ? 'core' : 'expanded';
      if (!filters.groups.includes(group)) return false;
    }
    if (filters.sources.length > 0 && !filters.sources.includes(entry.source)) return false;
    if (filters.tags.length > 0 && !filters.tags.some(tag => entry.tags?.includes(tag))) return false;
    if (tokens.length === 0) return true;
    const haystack = [
      entry.name,
      entry.edition,
      speciesSourceLabel(entry.source),
      entry.creatureType ?? '',
      (entry.tags ?? []).join(' '),
      (entry.species_traits ?? []).join(' '),
    ].join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
  });

  return [...matched].sort(SORTERS[filters.sort]);
}

const byName = (a: SpeciesPickerEntry, b: SpeciesPickerEntry) =>
  a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);

const SORTERS: Record<SpeciesPickerSort, (a: SpeciesPickerEntry, b: SpeciesPickerEntry) => number> = {
  name: byName,
  source: (a, b) => speciesSourceLabel(a.source).localeCompare(speciesSourceLabel(b.source)) || byName(a, b),
  speed: (a, b) => b.speed - a.speed || byName(a, b),
};
