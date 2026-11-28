import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Character } from '../../types/dnd';
import { SPELL_DATABASE, AppSpell } from '../../services/dataService';
import { asList, asNumberList } from '../../utils/normalizeCharacter';
import { SpellDetailModal } from '../SpellDetailModal';
import { SpellBlurb } from '../SpellBlurb';
import { classCastingStats, hasPreparedCasting, type ClassCastingStats } from '../../utils/multiclass';

type FeatGrantedSpell = NonNullable<NonNullable<Character['spellcasting']>['featGrantedSpells']>[number];

type TraitSpellConfig = {
  spellSlug: string;
  minLevel: number;
  rechargeType: 'at-will' | 'long-rest' | 'short-rest';
  usesPerDay?: number;
  spellLevelOverride?: number;
  spellcastingAbility: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
};

const TRAIT_SPELL_MAP: Record<string, TraitSpellConfig[]> = {
  'Infernal Legacy': [
    { spellSlug: 'thaumaturgy', minLevel: 1, rechargeType: 'at-will', spellcastingAbility: 'CHA' },
    { spellSlug: 'hellish-rebuke', minLevel: 3, rechargeType: 'long-rest', usesPerDay: 1, spellLevelOverride: 2, spellcastingAbility: 'CHA' },
    { spellSlug: 'darkness', minLevel: 5, rechargeType: 'long-rest', usesPerDay: 1, spellcastingAbility: 'CHA' },
  ],
};

const getTraitSpells = (character: Character) => {
  const traits = asList<string>(character.featuresAndTraits?.speciesTraits);
  return traits.flatMap((trait) => {
    const configs = TRAIT_SPELL_MAP[trait] || [];
    return configs
      .filter((config) => character.level >= config.minLevel)
      .map((config) => ({ ...config, trait }));
  });
};

// Helper function to get max prepared spells for a character
const preparedLimit = (character: Character, stats: ClassCastingStats[]): number | null => {
  const casting = character.spellcasting;
  if (!casting) return null;
  if (stats.length > 0) {
    const preparing = stats.filter(item => item.spellcastingType !== 'known');
    if (preparing.length === 0) return null;
    return preparing.reduce(
      (total, item) => total + Math.max(1, item.classLevel + (character.abilities[item.ability]?.modifier ?? 0)),
      0,
    );
  }
  if (casting.spellcastingType !== 'prepared' && casting.spellcastingType !== 'wizard') {
    return null;
  }
  const modifier = character.abilities[casting.ability]?.modifier ?? 0;
  return Math.max(1, character.level + modifier);
};

/** Casting styles across all of the character's casting classes. */
const castingTypes = (character: Character): Set<string> => {
  const casting = character.spellcasting;
  if (!casting) return new Set();
  return new Set([
    casting.spellcastingType,
    ...asList<{ spellcastingType: string }>(casting.classCasting).map(item => item.spellcastingType),
  ]);
};

const componentLabel = (spell: AppSpell): string => {
  const parts: string[] = [];
  if (spell.components?.verbal) parts.push('V');
  if (spell.components?.somatic) parts.push('S');
  if (spell.components?.material) parts.push('M');
  return parts.join(' ') || 'None';
};

const levelTitle = (level: number): string => {
  if (level === 0) return 'Cantrips';
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix} level`;
};

const sheetCardClass = 'p-4 bg-theme-secondary border border-theme-secondary rounded-lg shadow-lg';
const sheetHeadingClass = 'text-sm font-bold text-theme-muted uppercase tracking-wider font-cinzel';

type SpellFilter = 'concentration' | 'ritual' | 'bonus' | 'reaction';
type SpellSource = 'class' | 'trait' | 'feat' | 'spellbook';

interface SpellListEntry {
  key: string;
  spell: AppSpell;
  note?: string;
  source: SpellSource;
}

const FILTERS: { id: SpellFilter; label: string }[] = [
  { id: 'concentration', label: 'Concentration' },
  { id: 'ritual', label: 'Ritual' },
  { id: 'bonus', label: 'Bonus action' },
  { id: 'reaction', label: 'Reaction' },
];

const matchesSpellFilter = (spell: AppSpell, filter: SpellFilter): boolean => {
  if (filter === 'concentration') return spell.concentration;
  if (filter === 'ritual') return spell.ritual;
  if (filter === 'bonus') return spell.castingTime.toLowerCase().includes('bonus');
  return spell.castingTime.toLowerCase().includes('reaction');
};

const chipClass = (active: boolean): string =>
  `px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
    active
      ? 'bg-accent-blue border-accent-blue text-white'
      : 'bg-theme-tertiary border-theme-border text-theme-muted hover:text-theme-primary'
  }`;

const buildSpellEntries = (character: Character, traitSpells: ReturnType<typeof getTraitSpells>): SpellListEntry[] => {
  const bySlug = new Map<string, SpellListEntry>();
  const add = (slug: string, source: SpellSource, note?: string) => {
    const spell = SPELL_DATABASE.find(entry => entry.slug === slug);
    if (!spell) return;
    const existing = bySlug.get(spell.slug);
    if (existing) {
      if (note && !existing.note?.includes(note)) {
        existing.note = existing.note ? `${existing.note} · ${note}` : note;
      }
      return;
    }
    bySlug.set(spell.slug, { key: spell.slug, spell, source, note });
  };

  const casting = character.spellcasting;
  const types = castingTypes(character);
  if (casting) {
    asList<string>(casting.cantripsKnown).forEach(slug => add(slug, 'class'));
    if (types.has('known')) {
      asList<string>(casting.spellsKnown).forEach(slug => add(slug, 'class'));
    }
    if (types.has('prepared') || types.has('wizard')) {
      asList<string>(casting.preparedSpells).forEach(slug => add(slug, 'class'));
    }
    asList<FeatGrantedSpell>(casting.featGrantedSpells).forEach(featSpell => {
      const recharge = featSpell.rechargeType === 'at-will' ? 'At will' : `${featSpell.usesPerDay || 1}/long rest`;
      add(featSpell.spellSlug, 'feat', `${featSpell.featSlug} · ${featSpell.spellcastingAbility} · ${recharge}`);
    });
  }

  traitSpells.forEach(traitSpell => {
    const recharge = traitSpell.rechargeType === 'at-will' ? 'At will' : `${traitSpell.usesPerDay || 1}/long rest`;
    const note = [
      traitSpell.trait,
      traitSpell.spellcastingAbility,
      recharge,
      traitSpell.spellLevelOverride ? `cast as ${levelTitle(traitSpell.spellLevelOverride)}` : '',
    ].filter(Boolean).join(' · ');
    add(traitSpell.spellSlug, 'trait', note);
  });

  if (casting && types.has('wizard')) {
    asList<string>(casting.spellbook).forEach(slug => {
      const spell = SPELL_DATABASE.find(entry => entry.slug === slug);
      const note = spell?.ritual ? 'Ritual from spellbook' : 'Not prepared';
      add(slug, 'spellbook', note);
    });
  }

  return [...bySlug.values()].sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));
};

const SpellRow: React.FC<{
  entry: SpellListEntry;
  open: boolean;
  onToggle: () => void;
  onCard: () => void;
}> = ({ entry, open, onToggle, onCard }) => {
  const { spell, note } = entry;
  return (
    <div className={`rounded-lg border ${open ? 'border-accent-blue/70 bg-theme-tertiary/50' : 'border-theme-border/60 bg-theme-tertiary/40'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-3 py-2 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-sm text-theme-primary">{spell.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-theme-muted">{spell.school}</span>
          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-theme-muted">
            <span>{spell.castingTime}</span>
            <span>{spell.range}</span>
            <span>{spell.duration}</span>
            <span>{componentLabel(spell)}</span>
            {spell.concentration && <span className="text-accent-yellow-light">Concentration</span>}
            {spell.ritual && <span className="text-accent-purple-light">Ritual</span>}
            {spell.damageType && <span className="capitalize">{spell.damageType}</span>}
            {spell.saveType && <span>{spell.saveType} save</span>}
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {spell.components?.material && spell.components.materialDescription && (
            <p className="text-xs text-theme-muted">Material: {spell.components.materialDescription}</p>
          )}
          {note && <p className="mt-1 text-[11px] uppercase tracking-wide text-theme-muted">{note}</p>}
          <SpellBlurb spell={spell} higher className="mt-2 text-sm text-theme-tertiary leading-relaxed" />
          <button
            type="button"
            onClick={onCard}
            className="mt-2 text-xs text-accent-purple-light hover:underline"
          >
            Open spell card
          </button>
        </div>
      )}
    </div>
  );
};

interface SpellcastingSectionProps {
  character: Character;
  onUpdateCharacter: (character: Character) => void;
  onSpellPreparation: () => void;
}

export const SpellcastingSection: React.FC<SpellcastingSectionProps> = ({
  character,
  onUpdateCharacter: _onUpdateCharacter,
  onSpellPreparation,
}) => {
  const [selectedSpell, setSelectedSpell] = useState<AppSpell | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SpellFilter | null>(null);
  const [showSpellbook, setShowSpellbook] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const traitSpells = getTraitSpells(character);
  const entries = buildSpellEntries(character, traitSpells);
  const hasHiddenSpellbook = entries.some(entry => entry.source === 'spellbook' && !entry.spell.ritual);
  const visible = entries.filter(entry => {
    if (entry.source === 'spellbook' && !entry.spell.ritual && !showSpellbook) return false;
    const needle = query.trim().toLowerCase();
    if (needle && !entry.spell.name.toLowerCase().includes(needle)) return false;
    if (filter && !matchesSpellFilter(entry.spell, filter)) return false;
    return true;
  });
  const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(level => visible.some(entry => entry.spell.level === level));
  const castingStats = classCastingStats(character);
  const limit = preparedLimit(character, castingStats);
  const classSpells = entries.filter(entry => entry.source === 'class');
  const leveledCount = (slugs: unknown) =>
    asList<string>(slugs).filter(slug => (SPELL_DATABASE.find(spell => spell.slug === slug)?.level ?? 0) > 0).length;
  const summary = castingStats.length > 0
    ? [
        castingTypes(character).has('known') ? `${leveledCount(character.spellcasting?.spellsKnown)} known` : '',
        limit !== null ? `${leveledCount(character.spellcasting?.preparedSpells)} / ${limit} prepared` : '',
      ].filter(Boolean).join(' · ')
    : limit !== null
    ? `${classSpells.filter(entry => entry.spell.level > 0).length} / ${limit} prepared`
    : character.spellcasting?.spellcastingType === 'known'
      ? `${classSpells.filter(entry => entry.spell.level === 0).length} cantrips · ${classSpells.filter(entry => entry.spell.level > 0).length} spells`
      : `${entries.filter(entry => entry.source !== 'spellbook' || entry.spell.ritual).length} spells`;

  if (!character.spellcasting && traitSpells.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className={sheetHeadingClass}>Spellcasting</h2>
        <div className={`${sheetCardClass} text-center`}>
          <p className="text-theme-muted text-sm">No spellcasting abilities available for this character.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {character.spellcasting && (
        <div className={`${sheetCardClass} sticky top-0 z-20`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={sheetHeadingClass}>Spellcasting</h2>
            {hasPreparedCasting(character) && (
              <button
                onClick={onSpellPreparation}
                className="px-3 py-1 bg-theme-tertiary hover:bg-theme-quaternary border border-theme-border rounded text-sm text-theme-primary transition-colors"
                title="Prepare spells for the day"
              >
                Prepare
              </button>
            )}
          </div>
          {castingStats.length > 1 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm max-w-3xl">
              {castingStats.map(item => (
                <div
                  key={item.classSlug}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg bg-theme-quaternary/40 border border-theme-border/40"
                >
                  <div>
                    <div className="font-semibold text-theme-primary">{item.className} {item.classLevel}</div>
                    <div className="text-[11px] uppercase tracking-wide text-theme-muted">{item.ability} · {item.spellcastingType === 'wizard' ? 'spellbook' : item.spellcastingType}</div>
                  </div>
                  <div className="flex gap-3 text-right">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-theme-muted">Save DC</div>
                      <div className="font-bold text-accent-yellow-light">{item.spellSaveDC}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-theme-muted">Attack</div>
                      <div className="font-bold text-accent-yellow-light">+{item.spellAttackBonus}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-3 gap-2 text-sm max-w-xl">
            <div className="flex flex-col items-start p-2 rounded-lg bg-theme-quaternary/40 border border-theme-border/40">
              <span className="text-[11px] uppercase tracking-wide text-theme-muted">Ability</span>
              <span className="text-base font-bold text-theme-primary">{character.spellcasting.ability}</span>
            </div>
            <div className="flex flex-col items-start p-2 rounded-lg bg-theme-quaternary/40 border border-theme-border/40">
              <span className="text-[11px] uppercase tracking-wide text-theme-muted">Save DC</span>
              <span className="text-base font-bold text-accent-yellow-light">{character.spellcasting.spellSaveDC}</span>
            </div>
            <div className="flex flex-col items-start p-2 rounded-lg bg-theme-quaternary/40 border border-theme-border/40">
              <span className="text-[11px] uppercase tracking-wide text-theme-muted">Attack</span>
              <span className="text-base font-bold text-accent-yellow-light">+{character.spellcasting.spellAttackBonus}</span>
            </div>
          </div>
          )}
          {asNumberList(character.spellcasting.spellSlots).slice(1).some(maxSlots => Number.isInteger(maxSlots) && maxSlots > 0 && maxSlots <= 20) && (
            <>
              <h3 className={`${sheetHeadingClass} mt-4 mb-3`}>Spell Slots</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {asNumberList(character.spellcasting.spellSlots).slice(1).map((maxSlots, index) => {
                  if (!Number.isInteger(maxSlots) || maxSlots <= 0 || maxSlots > 20) return null;
                  const spellLevel = index + 1;
                  const usedSlots = character.spellcasting?.usedSpellSlots?.[index + 1] || 0;
                  const availableSlots = maxSlots - usedSlots;
                  return (
                    <div key={spellLevel} className="flex items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wide text-theme-muted">{levelTitle(spellLevel)}</span>
                      <span className="text-xs font-bold text-theme-primary">{availableSlots}/{maxSlots}</span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: maxSlots }, (_, slotIndex) => (
                          <button
                            key={slotIndex}
                            onClick={() => {
                              const newUsedSlots = slotIndex < usedSlots ? slotIndex : slotIndex + 1;
                              const updatedCharacter = {
                                ...character,
                                spellcasting: {
                                  ...character.spellcasting!,
                                  usedSpellSlots: {
                                    ...character.spellcasting!.usedSpellSlots,
                                    [index + 1]: Math.min(newUsedSlots, maxSlots)
                                  }
                                }
                              };
                              _onUpdateCharacter(updatedCharacter);
                            }}
                            className={`w-4 h-4 rounded-full border-2 transition-colors ${
                              slotIndex < usedSlots
                                ? 'bg-accent-red-light border-red-400 cursor-pointer hover:bg-red-400'
                                : 'bg-blue-400 border-blue-300 cursor-pointer hover:bg-blue-300'
                            }`}
                            title={`${slotIndex < usedSlots ? 'Used' : 'Available'} slot - Click to toggle`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className={sheetCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className={sheetHeadingClass}>Spells</h3>
          <span className="text-sm text-theme-muted">{summary}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Find a spell"
            aria-label="Find a spell"
            className="w-full sm:max-w-xs px-3 py-1.5 rounded-lg bg-theme-tertiary border border-theme-border text-sm text-theme-primary placeholder:text-theme-muted"
          />
          {FILTERS.map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(current => current === item.id ? null : item.id)}
              className={chipClass(filter === item.id)}
            >
              {item.label}
            </button>
          ))}
          {hasHiddenSpellbook && (
            <button
              type="button"
              aria-pressed={showSpellbook}
              onClick={() => setShowSpellbook(current => !current)}
              className={chipClass(showSpellbook)}
            >
              Spellbook
            </button>
          )}
        </div>
        {levels.length === 0 ? (
          <p className="text-sm text-theme-muted">No spells match.</p>
        ) : (
          <div className="space-y-4">
            {levels.map(level => (
              <div key={level}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-theme-muted">
                  {levelTitle(level)}
                </div>
                <div className="space-y-1.5">
                  {visible.filter(entry => entry.spell.level === level).map(entry => (
                    <SpellRow
                      key={entry.key}
                      entry={entry}
                      open={openKey === entry.key}
                      onToggle={() => setOpenKey(current => current === entry.key ? null : entry.key)}
                      onCard={() => setSelectedSpell(entry.spell)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>



      {/* Spell Detail Modal */}
      <SpellDetailModal
        spell={selectedSpell}
        isOpen={selectedSpell !== null}
        onClose={() => setSelectedSpell(null)}
      />
    </div>
  );
};
