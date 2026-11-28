import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, Grid, List, Trash2 } from 'lucide-react';
import { Monster, UserMonster } from '../../types/dnd';
import { useMonsterContext } from '../../hooks';
import { EncounterGrid } from './EncounterGrid';
import { EncounterTabs } from './EncounterTabs';
import { SaveEncounterModal } from './SaveEncounterModal';

interface EncounterViewProps {
  onBack: () => void;
  onStartCombat?: () => void;
}

export const EncounterView: React.FC<EncounterViewProps> = ({ onBack, onStartCombat }) => {
  const {
    selectedEncounterMonsters,
    encounterViewMode,
    setEncounterViewMode,
    clearSelection,
    allMonsters,
    resolveMonster,
  } = useMonsterContext();

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; monsters: (Monster | UserMonster)[] } | null>(null);

  const selectionKey = Object.entries(selectedEncounterMonsters)
    .map(([monsterId, quantity]) => `${monsterId}:${quantity}`)
    .sort()
    .join('|');

  useEffect(() => {
    let live = true;
    const key = selectionKey;
    const load = async () => {
      const ids = Object.keys(selectedEncounterMonsters);
      if (ids.length > 0 && allMonsters.length === 0) return;
      const rows = await Promise.all(
        Object.entries(selectedEncounterMonsters).map(async ([monsterId, quantity]) => {
          const monster = allMonsters.find(entry => entry.index === monsterId);
          if (!monster) return null;
          const full = await resolveMonster(monster).catch(() => monster);
          return { full, quantity };
        }),
      );
      if (!live) return;
      const monsters: (Monster | UserMonster)[] = [];
      rows.forEach(row => {
        if (!row) return;
        for (let i = 0; i < row.quantity; i++) monsters.push(row.full);
      });
      setLoaded({ key, monsters });
    };
    void load();
    return () => {
      live = false;
    };
  }, [selectionKey, selectedEncounterMonsters, allMonsters, resolveMonster]);

  const encounterMonsters = loaded?.key === selectionKey ? loaded.monsters : null;
  const selectedCount = Object.values(selectedEncounterMonsters).reduce((sum, quantity) => sum + quantity, 0);
  const uniqueMonsters = Object.keys(selectedEncounterMonsters).length;

  const handleClear = () => {
    if (window.confirm('Clear this encounter? This will remove all selected monsters.')) {
      clearSelection();
      onBack();
    }
  };

  if (selectedCount === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">No Monsters Selected</h2>
          <p className="text-theme-muted mb-6">Select monsters from the library to create an encounter</p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-accent-purple hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 bg-theme-secondary hover:bg-theme-tertiary rounded-lg transition-colors"
              title="Back to library"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-4xl font-bold">Encounter</h1>
              <p className="text-theme-muted mt-1">
                {selectedCount} monster{selectedCount !== 1 ? 's' : ''}
                {uniqueMonsters !== selectedCount && (
                  <span className="ml-1">({uniqueMonsters} unique)</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-4 py-2 bg-accent-green hover:bg-accent-green-dark text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Encounter
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 bg-accent-red hover:bg-accent-red-dark text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Clear
            </button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="bg-theme-secondary rounded-lg p-1 inline-flex">
          <button
            onClick={() => setEncounterViewMode('grid')}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              encounterViewMode === 'grid'
                ? 'bg-accent-purple text-white'
                : 'text-theme-muted hover:text-white'
            }`}
          >
            <Grid className="w-5 h-5" />
            Grid View
          </button>
          <button
            onClick={() => setEncounterViewMode('tabs')}
            className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              encounterViewMode === 'tabs'
                ? 'bg-accent-purple text-white'
                : 'text-theme-muted hover:text-white'
            }`}
          >
            <List className="w-5 h-5" />
            Tab View
          </button>
        </div>
      </div>

      {/* Encounter Content */}
      {!encounterMonsters ? (
        <div className="text-center p-12 text-theme-muted">Loading stat blocks...</div>
      ) : encounterViewMode === 'grid' ? (
        <EncounterGrid monsters={encounterMonsters} />
      ) : (
        <EncounterTabs monsters={encounterMonsters} />
      )}

      {/* Save Encounter Modal */}
      <SaveEncounterModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={() => {
          setShowSaveModal(false);
          onBack();
        }}
        onStartCombat={onStartCombat}
      />
    </div>
  );
};
