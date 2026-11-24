import {
  Shield,
  Wand2,
  Eye,
  Heart,
  Flame,
  Sparkles,
  Skull,
  Shuffle,
  LucideIcon
} from 'lucide-react';
import { AppSpell } from '../services/dataService';

export const schoolIcons: Record<string, LucideIcon> = {
  abjuration: Shield,
  conjuration: Wand2,
  divination: Eye,
  enchantment: Heart,
  evocation: Flame,
  illusion: Sparkles,
  necromancy: Skull,
  transmutation: Shuffle,
};

export const schoolColors: Record<string, string> = {
  abjuration: 'bg-blue-900/40 border-blue-700 text-blue-300',
  conjuration: 'bg-green-900/40 border-green-700 text-green-300',
  divination: 'bg-purple-900/40 border-purple-700 text-purple-300',
  enchantment: 'bg-pink-900/40 border-pink-700 text-pink-300',
  evocation: 'bg-red-900/40 border-red-700 text-red-300',
  illusion: 'bg-indigo-900/40 border-indigo-700 text-indigo-300',
  necromancy: 'bg-gray-800/60 border-gray-600 text-gray-300',
  transmutation: 'bg-amber-900/40 border-amber-700 text-amber-300',
};

export type SpellSort = 'name' | 'level-asc' | 'level-desc' | 'school';
export type SpellCastingFilter = 'action' | 'bonus' | 'reaction' | 'longer';

const SPELL_BOOK_LABELS: Record<string, string> = {
  AAG: "Astral Adventurer's Guide",
  AI: 'Acquisitions Incorporated',
  AU: 'Arcana Unleashed',
  BMT: 'The Book of Many Things',
  EFA: 'Eberron: Forge of the Artificer',
  EGW: "Explorer's Guide to Wildemount",
  FRHOF: 'Forgotten Realms: Heroes of Faerûn',
  FTD: "Fizban's Treasury of Dragons",
  GGR: "Guildmasters' Guide to Ravnica",
  PHB: "Player's Handbook (2014)",
  SATO: 'Sigil and the Outlands',
  SCC: 'Strixhaven: A Curriculum of Chaos',
  TCE: "Tasha's Cauldron of Everything",
  XGE: "Xanathar's Guide to Everything",
  XPHB: "Player's Handbook (2024)",
};

export function spellBookLabel(book?: string): string {
  if (!book) return '';
  return SPELL_BOOK_LABELS[book] ?? book;
}

export interface SpellFilterState {
  searchTerm: string;
  editionFilter: 'all' | '2014' | '2024';
  selectedLevels: number[];
  selectedSchools: string[];
  selectedClasses: string[];
  selectedBooks: string[];
  casting: SpellCastingFilter[];
  sort: SpellSort;
  filterRitual: boolean;
  filterConcentration: boolean;
  filterFavorites: boolean;
  favoriteSlugs: string[];
}

/** Filters beyond the default 2024 list. Search and sort stay on the open row. */
export function spellFilterCount(filters: SpellFilterState): number {
  return (
    (filters.editionFilter !== '2024' ? 1 : 0) +
    filters.selectedLevels.length +
    filters.selectedSchools.length +
    filters.selectedClasses.length +
    filters.selectedBooks.length +
    filters.casting.length +
    (filters.filterRitual ? 1 : 0) +
    (filters.filterConcentration ? 1 : 0) +
    (filters.filterFavorites ? 1 : 0)
  );
}

export function filterAppSpells(spells: AppSpell[], filters: SpellFilterState): AppSpell[] {
  const tokens = filters.searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const classes = filters.selectedClasses.map(name => name.toLowerCase());
  const schools = filters.selectedSchools.map(name => name.toLowerCase());

  const matched = spells.filter(spell => {
    if (filters.editionFilter !== 'all' && spell.source !== filters.editionFilter) return false;
    if (filters.selectedLevels.length > 0 && !filters.selectedLevels.includes(spell.level)) return false;
    if (schools.length > 0 && !schools.includes(spell.school.toLowerCase())) return false;
    if (classes.length > 0 && !spell.classes.some(name => classes.includes(name.toLowerCase()))) return false;
    if (filters.selectedBooks.length > 0 && !filters.selectedBooks.includes(spell.book ?? '')) return false;
    if (filters.casting.length > 0 && !filters.casting.some(mode => matchesCasting(spell.castingTime, mode))) {
      return false;
    }
    if (filters.filterRitual && !spell.ritual) return false;
    if (filters.filterConcentration && !spell.concentration) return false;
    if (filters.filterFavorites && !filters.favoriteSlugs.includes(spell.slug)) return false;
    if (tokens.length === 0) return true;
    const haystack = [
      spell.name,
      spell.school,
      spell.classes.join(' '),
      spell.castingTime,
      spell.damageType ?? '',
      spellBookLabel(spell.book),
    ].join(' ').toLowerCase();
    return tokens.every(token => haystack.includes(token));
  });

  return [...matched].sort(SPELL_SORTERS[filters.sort]);
}

const matchesCasting = (castingTime: string, mode: SpellCastingFilter): boolean => {
  const time = castingTime.toLowerCase();
  if (mode === 'bonus') return time.includes('bonus action');
  if (mode === 'reaction') return time.includes('reaction');
  if (mode === 'longer') return /minute|hour/.test(time);
  return time.includes('action') && !time.includes('bonus') && !time.includes('reaction');
};

const byName = (a: AppSpell, b: AppSpell) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);

const SPELL_SORTERS: Record<SpellSort, (a: AppSpell, b: AppSpell) => number> = {
  name: byName,
  'level-asc': (a, b) => a.level - b.level || byName(a, b),
  'level-desc': (a, b) => b.level - a.level || byName(a, b),
  school: (a, b) => a.school.localeCompare(b.school) || byName(a, b),
};
