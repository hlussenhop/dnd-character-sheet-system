import type { Edition, Monster, MonsterSize, MonsterSpeed, MonsterType, UserMonster } from '../types/dnd';
import { loadChunked } from './contentChunks';

export interface MonsterIndexEntry {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  sources: string[];
  challenge_rating: number;
  xp: number;
  proficiency_bonus: number;
  type: string;
  size: string;
  subtype?: string;
  hit_points: number;
  armor_class: number;
  speed: MonsterSpeed;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  traits: string[];
  actions: string[];
  reactions: string[];
  legendary: string[];
}

let indexPromise: Promise<MonsterIndexEntry[]> | null = null;
const loaded = new Map<string, Monster>();

const named = (names: string[] | undefined) =>
  names && names.length > 0 ? names.map(name => ({ name, desc: '' })) : undefined;

/** A list row. Descriptions stay in the book chunk until a stat block is opened. */
export const monsterFromIndex = (entry: MonsterIndexEntry): Monster => ({
  index: entry.slug,
  name: entry.name,
  size: entry.size as MonsterSize,
  type: entry.type as MonsterType,
  subtype: entry.subtype,
  alignment: '',
  armor_class: [{ type: 'dex', value: entry.armor_class }],
  hit_points: entry.hit_points,
  hit_dice: '',
  hit_points_roll: '',
  speed: entry.speed ?? {},
  strength: entry.strength,
  dexterity: entry.dexterity,
  constitution: entry.constitution,
  intelligence: entry.intelligence,
  wisdom: entry.wisdom,
  charisma: entry.charisma,
  proficiencies: [],
  damage_vulnerabilities: [],
  damage_resistances: [],
  damage_immunities: [],
  condition_immunities: [],
  senses: {},
  languages: '',
  challenge_rating: entry.challenge_rating,
  proficiency_bonus: entry.proficiency_bonus,
  xp: entry.xp,
  special_abilities: named(entry.traits),
  actions: named(entry.actions),
  reactions: named(entry.reactions),
  legendary_actions: named(entry.legendary),
  edition: entry.edition,
  source: entry.source,
  sources: entry.sources,
});

/** Names, challenge, type, and the card stats. The stat block stays in the book chunk. */
export const loadMonsterIndex = (): Promise<MonsterIndexEntry[]> => {
  indexPromise ??= import('../data/monsterIndex.json').then(mod => mod.default as MonsterIndexEntry[]);
  return indexPromise;
};

/** Full stat blocks, one source chunk at a time. Omit sources to read every book. */
export const loadMonsters = async (sources?: string[]): Promise<Monster[]> => {
  const monsters = await loadChunked<Monster>('monsters', sources);
  monsters.forEach(monster => loaded.set(monster.index, monster));
  return monsters;
};

/** A 2024 reprint keeps the unsuffixed slug only when that creature was not reprinted. */
export const resolveMonsterSlug = async (slug: string, edition?: Edition): Promise<string> => {
  if (edition !== '2024') return slug;
  const index = await loadMonsterIndex();
  return index.some(monster => monster.slug === `${slug}-2024`) ? `${slug}-2024` : slug;
};

/** One creature, including its actions and traits. */
export const getMonster = async (slug: string): Promise<Monster | undefined> => {
  const cached = loaded.get(slug);
  if (cached) return cached;
  const index = await loadMonsterIndex();
  const hit = index.find(monster => monster.slug === slug);
  if (!hit) return undefined;
  await loadMonsters([hit.source]);
  return loaded.get(slug);
};

/** The book stat block for a catalog row. Custom monsters are already complete. */
export const resolveMonster = async (monster: Monster | UserMonster): Promise<Monster | UserMonster> => {
  if ('isCustom' in monster && monster.isCustom) return monster;
  return (await getMonster(monster.index)) ?? monster;
};
