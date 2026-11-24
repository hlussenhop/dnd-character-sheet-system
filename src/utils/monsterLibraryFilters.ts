import type { Edition, Monster, MonsterSize, MonsterSpeed, MonsterType, UserMonster } from '../types/dnd';

export type MonsterMovementFilter = 'fly' | 'swim' | 'climb' | 'burrow';
export type MonsterSort = 'name' | 'cr-asc' | 'cr-desc' | 'hp' | 'type';

export const CHALLENGE_RATINGS = [
  0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
] as const;

export interface MonsterListFilters {
  search: string;
  types: MonsterType[];
  sizes: MonsterSize[];
  crMin: number;
  crMax: number;
  movement: MonsterMovementFilter[];
  sort: MonsterSort;
  hasLegendaryActions: boolean | null;
  showFavoritesOnly: boolean;
  showCustomOnly: boolean;
  showSRDOnly: boolean;
  edition: 'all' | Edition;
  source: string;
}

export const monsterFiltersAreActive = (filters: MonsterListFilters): boolean =>
  filters.search !== '' ||
  filters.types.length > 0 ||
  filters.sizes.length > 0 ||
  filters.movement.length > 0 ||
  filters.crMin !== 0 ||
  filters.crMax !== 30 ||
  filters.hasLegendaryActions !== null ||
  filters.showFavoritesOnly ||
  filters.showCustomOnly ||
  filters.showSRDOnly ||
  filters.edition !== 'all' ||
  filters.source !== '';

const isCustom = (monster: Monster | UserMonster): monster is UserMonster =>
  'isCustom' in monster && monster.isCustom;

/** Catalog rows plus custom monsters, one card per slug. */
export const applyMonsterFilters = (
  monsters: (Monster | UserMonster)[],
  filters: MonsterListFilters,
  favoriteIds: string[],
  srdIndexes: Set<string>,
): (Monster | UserMonster)[] => {
  let result = monsters;

  if (filters.search.trim()) {
    const tokens = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
    result = result.filter(monster => {
      const haystack = `${monster.name} ${monster.subtype ?? ''} ${monster.type}`.toLowerCase();
      return tokens.every(token => haystack.includes(token));
    });
  }

  if (filters.types.length > 0) {
    result = result.filter(monster => filters.types.includes(monster.type));
  }

  if (filters.sizes.length > 0) {
    result = result.filter(monster => filters.sizes.includes(monster.size));
  }

  if (filters.movement.length > 0) {
    result = result.filter(monster =>
      filters.movement.some(mode => hasSpeed(monster.speed, mode)),
    );
  }

  result = result.filter(
    monster => monster.challenge_rating >= filters.crMin && monster.challenge_rating <= filters.crMax,
  );

  if (filters.hasLegendaryActions !== null) {
    result = result.filter(monster => {
      const hasLegendary = !!monster.legendary_actions && monster.legendary_actions.length > 0;
      return hasLegendary === filters.hasLegendaryActions;
    });
  }

  if (filters.showFavoritesOnly) {
    result = result.filter(monster => favoriteIds.includes(monster.index));
  }

  if (filters.showCustomOnly) {
    if (filters.showSRDOnly) return [];
    result = result.filter(isCustom);
  } else {
    if (filters.edition !== 'all') {
      result = result.filter(monster => !isCustom(monster) && monster.edition === filters.edition);
    }

    if (filters.source) {
      result = result.filter(monster => !isCustom(monster) && monster.source === filters.source);
    }

    if (filters.showSRDOnly) {
      result = result.filter(monster => !isCustom(monster) && srdIndexes.has(monster.index));
    }
  }

  return [...result].sort(sorters[filters.sort]);
};

const hasSpeed = (speed: MonsterSpeed | undefined, mode: MonsterMovementFilter): boolean => {
  const value = speed?.[mode];
  return typeof value === 'string' ? value.trim().length > 0 : !!value;
};

const byName = (a: Monster | UserMonster, b: Monster | UserMonster) =>
  a.name.localeCompare(b.name) || a.index.localeCompare(b.index);

const sorters: Record<MonsterSort, (a: Monster | UserMonster, b: Monster | UserMonster) => number> = {
  name: byName,
  'cr-asc': (a, b) => a.challenge_rating - b.challenge_rating || byName(a, b),
  'cr-desc': (a, b) => b.challenge_rating - a.challenge_rating || byName(a, b),
  hp: (a, b) => b.hit_points - a.hit_points || byName(a, b),
  type: (a, b) => a.type.localeCompare(b.type) || byName(a, b),
};
