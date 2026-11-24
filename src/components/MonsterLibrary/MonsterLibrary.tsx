import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMonsterContext } from '../../hooks';
import { MonsterList } from './MonsterList';
import { MonsterFilters } from './MonsterFilters';
import { CreateMonsterModal } from './CreateMonsterModal';
import { SavedEncountersList } from './SavedEncountersList';
import { Monster, UserMonster } from '../../types/dnd';
import { monsterFiltersAreActive } from '../../utils/monsterLibraryFilters';

interface MonsterLibraryProps {
  onSelectMonster: (monster: Monster | UserMonster) => void;
  onViewEncounter?: () => void;
  onStartCombat?: (encounterId: string) => void;
}

export const MonsterLibrary: React.FC<MonsterLibraryProps> = ({ onSelectMonster, onViewEncounter, onStartCombat }) => {
  const {
    filteredMonsters,
    loading,
    error,
    selectedEncounterMonsters,
    toggleMonsterSelection,
    setMonsterQuantity,
    clearSelection,
    encounters,
    filters,
    resolveMonster,
  } = useMonsterContext();

  const PAGE = 60;
  const filterKey = [
    filters.search,
    filters.edition,
    filters.source,
    filters.types.join(','),
    filters.sizes.join(','),
    filters.crMin,
    filters.crMax,
    filters.movement.join(','),
    filters.sort,
    filters.hasLegendaryActions,
    filters.showFavoritesOnly,
    filters.showCustomOnly,
    filters.showSRDOnly,
  ].join('|');
  const [page, setPage] = useState({ key: '', extra: 0 });
  const extra = page.key === filterKey ? page.extra : 0;
  const visibleMonsters = filteredMonsters.slice(0, PAGE + extra);

  const [selectionMode, setSelectionMode] = useState(false);
  const [showCreateMonster, setShowCreateMonster] = useState(false);
  const [editingMonster, setEditingMonster] = useState<UserMonster | null>(null);
  const [showSavedEncounters, setShowSavedEncounters] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // Calculate total monsters selected (considering quantities)
  const totalMonstersSelected = Object.values(selectedEncounterMonsters).reduce(
    (sum, quantity) => sum + quantity,
    0
  );
  const uniqueMonstersSelected = Object.keys(selectedEncounterMonsters).length;

  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      clearSelection();
    }
    setSelectionMode(!selectionMode);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">🐉</div>
          <div className="text-xl">Loading Monster Library...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <div className="text-xl text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-4xl font-bold text-theme-primary">Monster Library</h1>
            <p className="text-gray-600 mt-2">
              {filteredMonsters.length} monster{filteredMonsters.length !== 1 ? 's' : ''}{' '}
              {monsterFiltersAreActive(filters) ? 'match' : 'in the library'}
            </p>
          </div>

          <div className="flex gap-3">
            {!selectionMode && (
              <button
                onClick={() => setShowCreateMonster(true)}
                className="px-4 py-2 bg-accent-green text-white rounded-lg hover:bg-accent-green-dark transition-colors"
              >
                + Create Custom Monster
              </button>
            )}

            <button
              onClick={handleToggleSelectionMode}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectionMode
                  ? 'bg-accent-red text-white hover:bg-accent-red-dark'
                  : 'bg-accent-blue text-white hover:bg-blue-700'
              }`}
            >
              {selectionMode ? 'Exit Selection Mode' : 'Select for Encounter'}
            </button>
          </div>
        </div>

        {selectionMode && (
          <div className="bg-theme-secondary border border-theme-primary rounded-lg p-4 flex justify-between items-center">
            <div>
              <span className="font-semibold text-theme-primary">
                {totalMonstersSelected} monster{totalMonstersSelected !== 1 ? 's' : ''} selected
                {uniqueMonstersSelected > 0 && uniqueMonstersSelected !== totalMonstersSelected && (
                  <span className="text-theme-muted ml-1">
                    ({uniqueMonstersSelected} unique)
                  </span>
                )}
              </span>
              {uniqueMonstersSelected > 0 && (
                <button
                  onClick={clearSelection}
                  className="ml-4 text-sm text-accent-blue hover:text-accent-blue-light underline transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>
            {uniqueMonstersSelected > 0 && onViewEncounter && (
              <button
                className="px-4 py-2 bg-accent-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
                onClick={onViewEncounter}
              >
                View Encounter →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saved Encounters Section */}
      <div className="mb-6">
        <button
          onClick={() => setShowSavedEncounters(!showSavedEncounters)}
          className="w-full flex items-center justify-between p-4 bg-theme-secondary hover:bg-gray-750 rounded-lg transition-colors mb-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-theme-primary">Saved Encounters</span>
            <span className="px-2 py-0.5 bg-accent-purple text-white text-xs rounded-full">
              {encounters.length}
            </span>
          </div>
          {showSavedEncounters ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
        {showSavedEncounters && (
          <div className="mb-4">
            <SavedEncountersList onStartCombat={onStartCombat} />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6">
        <MonsterFilters />
      </div>

      {openError && (
        <p className="mb-4 rounded-lg bg-theme-secondary px-4 py-3 text-sm text-accent-red-light">{openError}</p>
      )}

      {/* Monster List */}
      <MonsterList
        monsters={visibleMonsters}
        onSelectMonster={monster => {
          setOpenError(null);
          void resolveMonster(monster).then(onSelectMonster).catch(() => {
            setOpenError(`Couldn't load ${monster.name}. Open it again in a moment.`);
          });
        }}
        selectionMode={selectionMode}
        selectedMonsters={selectedEncounterMonsters}
        onToggleSelection={toggleMonsterSelection}
        onSetQuantity={setMonsterQuantity}
        onEditMonster={(monster) => {
          setEditingMonster(monster as UserMonster);
          setShowCreateMonster(true);
        }}
      />

      {visibleMonsters.length < filteredMonsters.length && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setPage({ key: filterKey, extra: extra + PAGE })}
            className="px-4 py-2 bg-theme-tertiary text-white rounded-lg hover:bg-theme-quaternary transition-colors"
          >
            Show {Math.min(PAGE, filteredMonsters.length - visibleMonsters.length)} more
            <span className="text-theme-muted"> ({filteredMonsters.length - visibleMonsters.length} left)</span>
          </button>
        </div>
      )}

      {/* Create/Edit Monster Modal */}
      <CreateMonsterModal
        isOpen={showCreateMonster || editingMonster !== null}
        onClose={() => {
          setShowCreateMonster(false);
          setEditingMonster(null);
        }}
        editingMonster={editingMonster}
      />

      {/* Floating selection toggle to avoid scrolling back to top */}
      <div className="fixed right-4 bottom-20 z-40 hidden lg:block">
        <button
          onClick={handleToggleSelectionMode}
          className={`px-4 py-3 rounded-full shadow-lg border transition-colors ${
            selectionMode
              ? 'bg-accent-red text-white border-accent-red-dark hover:bg-accent-red-dark'
              : 'bg-accent-blue text-white border-blue-700 hover:bg-blue-700'
          }`}
        >
          {selectionMode ? 'Exit Selection Mode' : 'Select for Encounter'}
        </button>
      </div>
    </div>
  );
};
