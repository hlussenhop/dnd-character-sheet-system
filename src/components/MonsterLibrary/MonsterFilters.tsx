import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useMonsterContext } from '../../hooks';
import { MONSTER_TYPE_CATEGORIES } from '../../services/dataService';
import { MonsterSize, MonsterType } from '../../types/dnd';
import { formatChallengeRating, monsterSourceLabel } from '../../utils/monsterUtils';
import {
  CHALLENGE_RATINGS,
  MonsterMovementFilter,
  MonsterSort,
  monsterFiltersAreActive,
} from '../../utils/monsterLibraryFilters';

const MONSTER_SIZES: MonsterSize[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

const MOVEMENTS: { id: MonsterMovementFilter; label: string }[] = [
  { id: 'fly', label: 'Fly' },
  { id: 'swim', label: 'Swim' },
  { id: 'climb', label: 'Climb' },
  { id: 'burrow', label: 'Burrow' },
];

const CR_BANDS = [
  { label: 'Any CR', min: 0, max: 30 },
  { label: '0', min: 0, max: 0 },
  { label: '1/8–1', min: 0.125, max: 1 },
  { label: '2–4', min: 2, max: 4 },
  { label: '5–10', min: 5, max: 10 },
  { label: '11–16', min: 11, max: 16 },
  { label: '17+', min: 17, max: 30 },
];

const SORTS: { id: MonsterSort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'cr-asc', label: 'CR, low to high' },
  { id: 'cr-desc', label: 'CR, high to low' },
  { id: 'hp', label: 'Hit points' },
  { id: 'type', label: 'Type' },
];

const chipClass = (active: boolean) =>
  `px-3 py-1 rounded-lg text-sm transition-colors ${
    active
      ? 'bg-accent-purple text-white'
      : 'bg-theme-tertiary text-theme-tertiary hover:bg-theme-quaternary'
  }`;

export const MonsterFilters: React.FC = () => {
  const { filters, setFilters, clearFilters, catalogMonsters } = useMonsterContext();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (searchInput === filters.search) return;
    const timer = setTimeout(() => setFilters({ search: searchInput }), 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, setFilters]);

  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    catalogMonsters.forEach(monster => {
      if (!monster.source) return;
      if (filters.edition !== 'all' && monster.edition !== filters.edition) return;
      seen.set(monster.source, monsterSourceLabel(monster.source));
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [catalogMonsters, filters.edition]);

  const toggleType = (type: MonsterType) => {
    const types = filters.types.includes(type)
      ? filters.types.filter(item => item !== type)
      : [...filters.types, type];
    setFilters({ types });
  };

  const toggleSize = (size: MonsterSize) => {
    const sizes = filters.sizes.includes(size)
      ? filters.sizes.filter(item => item !== size)
      : [...filters.sizes, size];
    setFilters({ sizes });
  };

  const toggleMovement = (mode: MonsterMovementFilter) => {
    const movement = filters.movement.includes(mode)
      ? filters.movement.filter(item => item !== mode)
      : [...filters.movement, mode];
    setFilters({ movement });
  };

  const setCrMin = (crMin: number) => {
    setFilters({ crMin, crMax: Math.max(filters.crMax, crMin) });
  };

  const setCrMax = (crMax: number) => {
    setFilters({ crMax, crMin: Math.min(filters.crMin, crMax) });
  };

  const clearSearch = () => {
    setSearchInput('');
    setFilters({ search: '' });
  };

  const reset = () => {
    clearFilters();
    setSearchInput('');
  };

  const active = monsterFiltersAreActive(filters);
  const crLimited = filters.crMin !== 0 || filters.crMax !== 30;
  const filterCount =
    (filters.edition !== 'all' ? 1 : 0) +
    (filters.source ? 1 : 0) +
    (crLimited ? 1 : 0) +
    filters.types.length +
    filters.sizes.length +
    filters.movement.length +
    (filters.hasLegendaryActions === true ? 1 : 0) +
    (filters.showFavoritesOnly ? 1 : 0) +
    (filters.showSRDOnly ? 1 : 0) +
    (filters.showCustomOnly ? 1 : 0);

  return (
    <div className="bg-theme-secondary rounded-xl p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted w-5 h-5" />
          <input
            type="search"
            aria-label="Search monsters by name, type, or subtype"
            placeholder="Search name, type, or subtype — try “red dragon” or “bird”"
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-theme-tertiary text-white rounded-lg border border-theme-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-theme-tertiary whitespace-nowrap">
          Sort
          <select
            aria-label="Sort monsters"
            value={filters.sort}
            onChange={event => setFilters({ sort: event.target.value as MonsterSort })}
            className="px-3 py-2 rounded-lg text-sm bg-theme-tertiary text-white border border-theme-primary"
          >
            {SORTS.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(current => !current)}
          className="px-4 py-2 bg-theme-tertiary text-white rounded-lg hover:bg-theme-quaternary transition-colors inline-flex items-center gap-2 whitespace-nowrap"
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {open ? 'Hide filters' : 'Filters'}
          {filterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-accent-purple text-xs">{filterCount}</span>
          )}
        </button>

        {active && (
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-accent-red text-white rounded-lg hover:bg-accent-red-dark transition-colors whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>

      {open && (
      <div className="space-y-4 pt-4 border-t border-theme-primary">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', '2014', '2024'] as const).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => setFilters({ edition: value, source: '' })}
            className={chipClass(filters.edition === value)}
          >
            {value === 'all' ? 'Both editions' : value}
          </button>
        ))}
        <select
          value={filters.source}
          onChange={event => setFilters({ source: event.target.value })}
          className="px-3 py-1 rounded-lg text-sm bg-theme-tertiary text-white border border-theme-primary"
          aria-label="Source book"
        >
          <option value="">Any source</option>
          {sources.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-theme-tertiary">
            CR from
            <select
              aria-label="Minimum challenge rating"
              value={String(filters.crMin)}
              onChange={event => setCrMin(Number(event.target.value))}
              className="px-3 py-1 rounded-lg text-sm bg-theme-tertiary text-white border border-theme-primary"
            >
              {CHALLENGE_RATINGS.map(cr => (
                <option key={cr} value={String(cr)}>
                  {formatChallengeRating(cr)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-theme-tertiary">
            to
            <select
              aria-label="Maximum challenge rating"
              value={String(filters.crMax)}
              onChange={event => setCrMax(Number(event.target.value))}
              className="px-3 py-1 rounded-lg text-sm bg-theme-tertiary text-white border border-theme-primary"
            >
              {CHALLENGE_RATINGS.map(cr => (
                <option key={cr} value={String(cr)}>
                  {formatChallengeRating(cr)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {CR_BANDS.map(band => (
            <button
              key={band.label}
              type="button"
              onClick={() => setFilters({ crMin: band.min, crMax: band.max })}
              className={chipClass(filters.crMin === band.min && filters.crMax === band.max)}
            >
              {band.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-theme-tertiary">Creature type</div>
        <div className="flex flex-wrap gap-2">
          {MONSTER_TYPE_CATEGORIES.map(category => (
            <button
              key={category.type}
              type="button"
              onClick={() => toggleType(category.type)}
              title={category.description}
              className={`${chipClass(filters.types.includes(category.type))} inline-flex items-center gap-1`}
            >
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <div className="mb-2 text-sm font-semibold text-theme-tertiary">Size</div>
          <div className="flex flex-wrap gap-2">
            {MONSTER_SIZES.map(size => (
              <button
                key={size}
                type="button"
                onClick={() => toggleSize(size)}
                className={chipClass(filters.sizes.includes(size))}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-theme-tertiary">Movement</div>
          <div className="flex flex-wrap gap-2">
            {MOVEMENTS.map(mode => (
              <button
                key={mode.id}
                type="button"
                onClick={() => toggleMovement(mode.id)}
                className={chipClass(filters.movement.includes(mode.id))}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilters({ hasLegendaryActions: filters.hasLegendaryActions === true ? null : true })}
          className={chipClass(filters.hasLegendaryActions === true)}
        >
          Legendary actions
        </button>
        <button
          type="button"
          onClick={() => setFilters({ showFavoritesOnly: !filters.showFavoritesOnly })}
          className={chipClass(filters.showFavoritesOnly)}
        >
          Favorites
        </button>
        <button
          type="button"
          onClick={() => setFilters({ showSRDOnly: !filters.showSRDOnly })}
          className={chipClass(filters.showSRDOnly)}
        >
          SRD only
        </button>
        <button
          type="button"
          onClick={() => setFilters({ showCustomOnly: !filters.showCustomOnly })}
          className={chipClass(filters.showCustomOnly)}
        >
          Custom only
        </button>
      </div>
      </div>
      )}

      {active && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-theme-primary">
          {filters.search && (
            <ActiveChip label={`“${filters.search}”`} onRemove={clearSearch} />
          )}
          {filters.edition !== 'all' && (
            <ActiveChip
              label={filters.edition}
              onRemove={() => setFilters({ edition: 'all', source: '' })}
            />
          )}
          {filters.source && (
            <ActiveChip
              label={monsterSourceLabel(filters.source)}
              onRemove={() => setFilters({ source: '' })}
            />
          )}
          {crLimited && (
            <ActiveChip
              label={`CR ${formatChallengeRating(filters.crMin)}–${formatChallengeRating(filters.crMax)}`}
              onRemove={() => setFilters({ crMin: 0, crMax: 30 })}
            />
          )}
          {filters.types.map(type => (
            <ActiveChip
              key={type}
              label={MONSTER_TYPE_CATEGORIES.find(category => category.type === type)?.name ?? type}
              onRemove={() => toggleType(type)}
            />
          ))}
          {filters.sizes.map(size => (
            <ActiveChip key={size} label={size} onRemove={() => toggleSize(size)} />
          ))}
          {filters.movement.map(mode => (
            <ActiveChip
              key={mode}
              label={MOVEMENTS.find(item => item.id === mode)?.label ?? mode}
              onRemove={() => toggleMovement(mode)}
            />
          ))}
          {filters.hasLegendaryActions === true && (
            <ActiveChip
              label="Legendary actions"
              onRemove={() => setFilters({ hasLegendaryActions: null })}
            />
          )}
          {filters.showFavoritesOnly && (
            <ActiveChip label="Favorites" onRemove={() => setFilters({ showFavoritesOnly: false })} />
          )}
          {filters.showSRDOnly && (
            <ActiveChip label="SRD only" onRemove={() => setFilters({ showSRDOnly: false })} />
          )}
          {filters.showCustomOnly && (
            <ActiveChip label="Custom only" onRemove={() => setFilters({ showCustomOnly: false })} />
          )}
        </div>
      )}
    </div>
  );
};

const ActiveChip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <button
    type="button"
    onClick={onRemove}
    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-theme-tertiary text-white hover:bg-theme-quaternary"
  >
    {label}
    <X className="w-3 h-3" />
    <span className="sr-only">Remove {label}</span>
  </button>
);
