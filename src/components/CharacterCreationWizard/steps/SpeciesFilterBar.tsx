import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import {
  SPECIES_PICKER_TAGS,
  SpeciesGroupFilter,
  SpeciesPickerFilters,
  SpeciesPickerSort,
  speciesFilterCount,
  speciesSourceLabel,
} from '../../../utils/speciesPickerFilters';

interface SpeciesFilterBarProps {
  filters: SpeciesPickerFilters;
  onChange: (updated: Partial<SpeciesPickerFilters>) => void;
  onReset: () => void;
  sources: string[];
  tags: string[];
}

const SORTS: { id: SpeciesPickerSort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'source', label: 'Book' },
  { id: 'speed', label: 'Speed' },
];

const chipClass = (active: boolean) =>
  `px-3 py-1 rounded-lg text-sm transition-colors ${
    active
      ? 'bg-accent-red-darker text-white border border-red-500'
      : 'bg-theme-tertiary text-theme-muted border border-theme-primary hover:bg-theme-quaternary'
  }`;

export const SpeciesFilterBar: React.FC<SpeciesFilterBarProps> = ({
  filters,
  onChange,
  onReset,
  sources,
  tags,
}) => {
  const [open, setOpen] = useState(false);
  const count = speciesFilterCount(filters);
  const active = count > 0 || filters.search.trim() !== '' || filters.sort !== 'name';
  const tagLabels = new Map(SPECIES_PICKER_TAGS.map(tag => [tag.id, tag.label]));

  const toggle = <T,>(list: T[], value: T, key: 'groups' | 'sources' | 'tags') => {
    const next = list.includes(value) ? list.filter(item => item !== value) : [...list, value];
    onChange({ [key]: next });
  };

  return (
    <div className="bg-theme-secondary rounded-xl p-4 space-y-3 border border-theme-primary">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative flex-grow">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
          <input
            type="search"
            aria-label="Search species by name, book, or trait"
            value={filters.search}
            onChange={event => onChange({ search: event.target.value })}
            placeholder="Search name, book, or trait — try “elf” or “amphibious”"
            className="w-full pl-9 pr-9 py-2 bg-theme-tertiary text-white rounded-lg border border-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {filters.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-theme-muted">
            Sort
            <select
              aria-label="Sort species"
              value={filters.sort}
              onChange={event => onChange({ sort: event.target.value as SpeciesPickerSort })}
              className="px-3 py-1 rounded-lg text-sm bg-theme-tertiary text-white border border-theme-primary"
            >
              {SORTS.map(option => (
                <option key={option.id} value={option.id} style={{ backgroundColor: '#ffffff', color: '#111827' }}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(current => !current)}
            className="px-3 py-1.5 rounded-lg text-sm bg-theme-tertiary text-white border border-theme-primary hover:bg-theme-quaternary inline-flex items-center gap-1.5"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {open ? 'Hide filters' : 'Filters'}
            {count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-accent-red-darker text-xs">{count}</span>
            )}
          </button>

          {active && (
            <button
              type="button"
              onClick={onReset}
              className="px-3 py-1.5 rounded-lg text-sm bg-accent-red text-white hover:bg-accent-red-dark"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 pt-3 border-t border-theme-primary">
          <div>
            <div className="mb-1.5 text-sm font-semibold text-theme-muted">List</div>
            <div className="flex flex-wrap gap-2">
              {(['core', 'expanded'] as SpeciesGroupFilter[]).map(group => (
                <button
                  key={group}
                  type="button"
                  onClick={() => toggle(filters.groups, group, 'groups')}
                  className={chipClass(filters.groups.includes(group))}
                >
                  {group === 'core' ? 'Core' : 'Expanded'}
                </button>
              ))}
            </div>
          </div>

          {tags.length > 0 && (
            <div>
              <div className="mb-1.5 text-sm font-semibold text-theme-muted">Tags</div>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggle(filters.tags, tag, 'tags')}
                    className={chipClass(filters.tags.includes(tag))}
                  >
                    {tagLabels.get(tag) ?? tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-sm font-semibold text-theme-muted">Book</div>
            <div className="flex flex-wrap gap-2">
              {sources.map(source => (
                <button
                  key={source}
                  type="button"
                  onClick={() => toggle(filters.sources, source, 'sources')}
                  className={chipClass(filters.sources.includes(source))}
                >
                  {speciesSourceLabel(source)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {count > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-theme-primary">
          {filters.groups.map(group => (
            <ActiveChip
              key={group}
              label={group === 'core' ? 'Core' : 'Expanded'}
              onRemove={() => toggle(filters.groups, group, 'groups')}
            />
          ))}
          {filters.sources.map(source => (
            <ActiveChip
              key={source}
              label={speciesSourceLabel(source)}
              onRemove={() => toggle(filters.sources, source, 'sources')}
            />
          ))}
          {filters.tags.map(tag => (
            <ActiveChip
              key={tag}
              label={tagLabels.get(tag) ?? tag}
              onRemove={() => toggle(filters.tags, tag, 'tags')}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ActiveChip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <button
    type="button"
    onClick={onRemove}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-theme-tertiary text-white hover:bg-theme-quaternary"
  >
    {label}
    <X className="w-3 h-3" />
    <span className="sr-only">Remove {label}</span>
  </button>
);
