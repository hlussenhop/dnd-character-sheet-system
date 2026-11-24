/**
 * Utility functions for monster-related operations
 */

/**
 * Generates a URL-friendly slug from a monster name
 * Converts to lowercase, replaces spaces with hyphens, removes special characters
 */
export function generateMonsterSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim()
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Determines if a monster ID is for a custom monster
 */
export function isCustomMonsterId(monsterId: string): boolean {
  return monsterId.startsWith('custom-');
}

/**
 * Extracts the database ID from a custom monster ID
 */
export function getCustomMonsterDbId(monsterId: string): string {
  if (isCustomMonsterId(monsterId)) {
    return monsterId.replace('custom-', '');
  }
  return monsterId;
}

/** Book titles for the monster source filter. Unknown codes fall back to the abbreviation. */
export const MONSTER_SOURCE_LABELS: Record<string, string> = {
  ABH: "Astarion's Book of Hungers",
  AI: 'Acquisitions Incorporated',
  AU: 'Arcana Unleashed',
  BAM: "Boo's Astral Menagerie",
  BGG: 'Bigby Presents: Glory of the Giants',
  BMT: 'The Book of Many Things',
  DMG: "Dungeon Master's Guide (2014)",
  EFA: 'Eberron: Forge of the Artificer',
  EGW: "Explorer's Guide to Wildemount",
  ERLW: 'Eberron: Rising from the Last War',
  FRAIF: 'Forgotten Realms: Adventures in Faerûn',
  FTD: "Fizban's Treasury of Dragons",
  GGR: "Guildmasters' Guide to Ravnica",
  LFL: 'Lorwyn: First Light',
  MABJOV: "Minsc and Boo's Journal of Villainy",
  MCV1SC: 'Monstrous Compendium Vol. 1: Spelljammer Creatures',
  MCV4EC: 'Monstrous Compendium Vol. 4: Eldraine Creatures',
  MM: 'Monster Manual (2014)',
  MOT: 'Mythic Odysseys of Theros',
  MPMM: 'Mordenkainen Presents: Monsters of the Multiverse',
  MPP: "Morte's Planar Parade",
  MTF: "Mordenkainen's Tome of Foes",
  NF: "Netheril's Fall",
  PHB: "Player's Handbook (2014)",
  PL: 'Project Lamordia',
  RHW: 'Ravenloft: The Horrors Within',
  SCC: 'Strixhaven: A Curriculum of Chaos',
  TCE: "Tasha's Cauldron of Everything",
  VGM: "Volo's Guide to Monsters",
  VRGR: "Van Richten's Guide to Ravenloft",
  XDMG: "Dungeon Master's Guide (2024)",
  XGE: "Xanathar's Guide to Everything",
  XMM: 'Monster Manual (2025)',
  XPHB: "Player's Handbook (2024)",
};

const CR_FRACTIONS: Record<string, string> = { '0.125': '1/8', '0.25': '1/4', '0.5': '1/2' }

/** Challenge rating as a DM reads it: 1/8, 1/4, 1/2, or a whole number. */
export function formatChallengeRating(cr: number): string {
  return CR_FRACTIONS[String(cr)] ?? String(cr)
}

export function monsterSourceLabel(source?: string): string {
  if (!source) return '';
  return MONSTER_SOURCE_LABELS[source] ?? source;
}

/** Share path segment. Catalog creatures use their slug, so a 2024 reprint does not collide with 2014. */
export function monsterShareSlug(monster: { index: string; isCustom?: boolean }): string {
  if (monster.isCustom) return `custom-${monster.index}`;
  return monster.index;
}

/**
 * Resolve a /monster/:id path. An exact slug wins. A name-based link from before
 * the catalog prefers the 2014 creature when both editions exist.
 */
export function pickCatalogSlug(
  entries: Array<{ slug: string; name: string; edition: '2014' | '2024' }>,
  monsterId: string,
): string | undefined {
  if (entries.some(entry => entry.slug === monsterId)) return monsterId;
  const named = entries.filter(entry => generateMonsterSlug(entry.name) === monsterId);
  return (named.find(entry => entry.edition === '2014') ?? named[0])?.slug;
}