import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import {
  SpellCastingFilter,
  SpellFilterState,
  SpellSort,
  spellBookLabel,
  spellFilterCount,
} from '../../utils/spellbookAdapter';

interface SpellFilterBarProps {
  filters: SpellFilterState;
  onChangeFilters: (updated: Partial<SpellFilterState>) => void;
  onResetFilters: () => void;
  availableSchools: string[];
  availableClasses: string[];
  availableBooks: string[];
}

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const CASTING: { id: SpellCastingFilter; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'bonus', label: 'Bonus action' },
  { id: 'reaction', label: 'Reaction' },
  { id: 'longer', label: 'Longer' },
];

const SORTS: { id: SpellSort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'level-asc', label: 'Level, low to high' },
  { id: 'level-desc', label: 'Level, high to low' },
  { id: 'school', label: 'School' },
];

const chipClass = (active: boolean) =>
  `px-2.5 py-1 rounded-md border text-xs font-semibold capitalize transition-colors ${
    active
      ? 'bg-accent-blue-dark text-white border-accent-blue-light'
      : 'bg-theme-primary/40 text-theme-muted border-theme-tertiary/30 hover:border-theme-tertiary'
  }`;

export const SpellFilterBar: React.FC<SpellFilterBarProps> = ({
  filters,
  onChangeFilters,
  onResetFilters,
  availableSchools,
  availableClasses,
  availableBooks,
}) => {
  const [open, setOpen] = useState(false);
  const count = spellFilterCount(filters);
  const active = count > 0 || filters.searchTerm.trim() !== '' || filters.sort !== 'name';

  const toggle = <T,>(list: T[], value: T, key: keyof SpellFilterState) => {
    const next = list.includes(value) ? list.filter(item => item !== value) : [...list, value];
    onChangeFilters({ [key]: next });
  };

  return (
    <div className="bg-theme-secondary/80 rounded-xl p-4 border border-theme-primary/40 space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-grow">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
          <input
            type="search"
            aria-label="Search spells by name, class, school, or book"
            value={filters.searchTerm}
            onChange={event => onChangeFilters({ searchTerm: event.target.value })}
            placeholder="Search name, class, school, or book — try “wizard fire”"
            className="w-full pl-9 pr-9 py-2 bg-theme-primary/60 border border-theme-tertiary/40 rounded-lg text-sm text-theme-primary placeholder-theme-muted focus:outline-none focus:border-accent-blue-light"
          />
          {filters.searchTerm && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChangeFilters({ searchTerm: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(['all', '2014', '2024'] as const).map(edition => (
            <button
              key={edition}
              type="button"
              onClick={() => onChangeFilters({ editionFilter: edition, selectedBooks: [] })}
              className={chipClass(filters.editionFilter === edition)}
            >
              {edition === 'all' ? 'Both editions' : edition}
            </button>
          ))}

          <label className="flex items-center gap-2 text-xs text-theme-muted">
            Sort
            <select
              aria-label="Sort spells"
              value={filters.sort}
              onChange={event => onChangeFilters({ sort: event.target.value as SpellSort })}
              className="bg-theme-primary/60 border border-theme-tertiary/40 rounded-md px-2 py-1 text-theme-primary focus:outline-none"
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
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-primary/60 border border-theme-tertiary/40 text-theme-primary hover:text-white inline-flex items-center gap-1.5"
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {open ? 'Hide filters' : 'Filters'}
            {count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-accent-blue-dark text-white text-[10px]">{count}</span>
            )}
          </button>

          {active && (
            <button
              type="button"
              onClick={onResetFilters}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-red text-white hover:bg-accent-red-dark"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 pt-3 border-t border-theme-tertiary/30">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-theme-muted">Level</div>
            <div className="flex flex-wrap gap-1.5">
              {LEVELS.map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggle(filters.selectedLevels, level, 'selectedLevels')}
                  className={chipClass(filters.selectedLevels.includes(level))}
                >
                  {level === 0 ? 'Cantrip' : level}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-theme-muted">Class</div>
            <div className="flex flex-wrap gap-1.5">
              {availableClasses.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(filters.selectedClasses, name, 'selectedClasses')}
                  className={chipClass(filters.selectedClasses.includes(name))}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-theme-muted">School</div>
            <div className="flex flex-wrap gap-1.5">
              {availableSchools.map(school => (
                <button
                  key={school}
                  type="button"
                  onClick={() => toggle(filters.selectedSchools, school.toLowerCase(), 'selectedSchools')}
                  className={chipClass(filters.selectedSchools.includes(school.toLowerCase()))}
                >
                  {school}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-theme-muted">Casting time</div>
              <div className="flex flex-wrap gap-1.5">
                {CASTING.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => toggle(filters.casting, mode.id, 'casting')}
                    className={chipClass(filters.casting.includes(mode.id))}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-theme-muted">Book</div>
              <select
                aria-label="Source book"
                value=""
                onChange={event => {
                  const book = event.target.value;
                  if (book && !filters.selectedBooks.includes(book)) {
                    onChangeFilters({ selectedBooks: [...filters.selectedBooks, book] });
                  }
                }}
                className="bg-theme-primary/60 border border-theme-tertiary/40 rounded-md px-2 py-1 text-xs text-theme-primary focus:outline-none"
              >
                <option value="" style={{ backgroundColor: '#ffffff', color: '#111827' }}>
                  Add a book
                </option>
                {availableBooks
                  .filter(book => !filters.selectedBooks.includes(book))
                  .map(book => (
                    <option key={book} value={book} style={{ backgroundColor: '#ffffff', color: '#111827' }}>
                      {spellBookLabel(book)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onChangeFilters({ filterRitual: !filters.filterRitual })}
              className={chipClass(filters.filterRitual)}
            >
              Ritual
            </button>
            <button
              type="button"
              onClick={() => onChangeFilters({ filterConcentration: !filters.filterConcentration })}
              className={chipClass(filters.filterConcentration)}
            >
              Concentration
            </button>
            <button
              type="button"
              onClick={() => onChangeFilters({ filterFavorites: !filters.filterFavorites })}
              className={chipClass(filters.filterFavorites)}
            >
              Favorites
            </button>
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-theme-tertiary/30">
          {filters.editionFilter !== '2024' && (
            <ActiveChip
              label={filters.editionFilter === 'all' ? 'Both editions' : filters.editionFilter}
              onRemove={() => onChangeFilters({ editionFilter: '2024', selectedBooks: [] })}
            />
          )}
          {filters.selectedLevels.map(level => (
            <ActiveChip
              key={level}
              label={level === 0 ? 'Cantrip' : `Level ${level}`}
              onRemove={() => toggle(filters.selectedLevels, level, 'selectedLevels')}
            />
          ))}
          {filters.selectedClasses.map(name => (
            <ActiveChip
              key={name}
              label={name}
              onRemove={() => toggle(filters.selectedClasses, name, 'selectedClasses')}
            />
          ))}
          {filters.selectedSchools.map(school => (
            <ActiveChip
              key={school}
              label={school}
              onRemove={() => toggle(filters.selectedSchools, school, 'selectedSchools')}
            />
          ))}
          {filters.selectedBooks.map(book => (
            <ActiveChip
              key={book}
              label={spellBookLabel(book)}
              onRemove={() => toggle(filters.selectedBooks, book, 'selectedBooks')}
            />
          ))}
          {filters.casting.map(mode => (
            <ActiveChip
              key={mode}
              label={CASTING.find(item => item.id === mode)?.label ?? mode}
              onRemove={() => toggle(filters.casting, mode, 'casting')}
            />
          ))}
          {filters.filterRitual && (
            <ActiveChip label="Ritual" onRemove={() => onChangeFilters({ filterRitual: false })} />
          )}
          {filters.filterConcentration && (
            <ActiveChip label="Concentration" onRemove={() => onChangeFilters({ filterConcentration: false })} />
          )}
          {filters.filterFavorites && (
            <ActiveChip label="Favorites" onRemove={() => onChangeFilters({ filterFavorites: false })} />
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
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] capitalize bg-theme-primary/60 text-theme-primary hover:text-white"
  >
    {label}
    <X className="w-3 h-3" />
    <span className="sr-only">Remove {label}</span>
  </button>
);
