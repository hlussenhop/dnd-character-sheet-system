import React from 'react';
import { Dice6 } from 'lucide-react';
import { Character } from '../../types/dnd';
import { getModifier } from '../../services/dataService';
import { hitDicePools, restoreHitDice, spendHitDieOfSize } from '../../utils/multiclass';

interface HitDiceProps {
  character: Character;
  onUpdateCharacter: (character: Character) => void;
  layoutMode?: 'paper-sheet' | 'classic-dnd' | 'modern';
}

export const HitDice: React.FC<HitDiceProps> = ({
  character,
  onUpdateCharacter,
  layoutMode = 'paper-sheet',
}) => {
  // Calculate hit dice based on class and level
  const getHitDiceInfo = () => {
    const hitDieType = character.hitDice.dieType;
    const maxHitDice = character.level;

    return {
      dieType: hitDieType,
      max: maxHitDice,
      current: character.hitDice.current,
      available: character.hitDice.current
    };
  };

  const hitDiceInfo = getHitDiceInfo();
  const pools = hitDicePools(character);
  const multiclassPools = pools.length > 1;

  const spendHitDie = (die = hitDiceInfo.dieType) => {
    const hitDice = multiclassPools
      ? spendHitDieOfSize(character, die)
      : hitDiceInfo.available > 0 ? { ...character.hitDice, current: character.hitDice.current - 1 } : null;
    if (!hitDice) return;

    // Calculate healing: (hit die / 2) + CON modifier, minimum 1
    const conMod = getModifier(character.abilities.CON.score);
    const avgRoll = Math.floor(die / 2);
    const healing = Math.max(1, avgRoll + conMod);

    // Update character
    const updatedCharacter = {
      ...character,
      hitDice,
      hitPoints: Math.min(character.maxHitPoints, character.hitPoints + healing)
    };

    onUpdateCharacter(updatedCharacter);
  };

  const resetHitDice = () => {
    // Reset on long rest
    const updatedCharacter = {
      ...character,
      hitDice: restoreHitDice(character),
    };

    onUpdateCharacter(updatedCharacter);
  };

  // Determine color scheme based on layout mode
  const isPaperSheet = layoutMode === 'paper-sheet';
  const bgClass = isPaperSheet ? 'bg-[#f5ebd2]' : 'bg-theme-tertiary/50';
  const borderClass = isPaperSheet ? 'border-[#1e140a]/20' : 'border-theme-secondary';
  const textPrimaryClass = isPaperSheet ? 'text-[#1e140a]' : 'text-theme-primary';
  const textSecondaryClass = isPaperSheet ? 'text-[#3d2817]' : 'text-theme-tertiary';
  const buttonBgClass = isPaperSheet ? 'bg-[#8b4513] hover:bg-[#a0522d]' : 'bg-accent-blue hover:bg-blue-600';
  const disabledBgClass = isPaperSheet ? 'bg-[#ebe1c8]' : 'bg-theme-quaternary';
  const disabledTextClass = isPaperSheet ? 'text-[#3d2817]/50' : 'text-theme-muted';

  return (
    <div className={`${bgClass} border ${borderClass} rounded-sm p-3`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-xs font-cinzel font-bold ${textSecondaryClass} uppercase tracking-wider flex items-center gap-1`}>
          <Dice6 className="w-3 h-3" />
          Hit Dice
        </h3>
      </div>

      {multiclassPools ? (
        <div className="space-y-2">
          {pools.map(pool => (
            <div key={pool.die} className="flex items-center justify-between">
              <div>
                <div className={`text-lg font-cinzel font-bold ${textPrimaryClass}`}>
                  {pool.current} / {pool.max} <span className={`text-xs font-normal ${textSecondaryClass}`}>d{pool.die}</span>
                </div>
                <div className={`text-xs font-cinzel ${textSecondaryClass}`}>
                  Heals {Math.max(1, Math.floor(pool.die / 2) + getModifier(character.abilities.CON.score))} HP (avg + CON)
                </div>
              </div>
              <button
                onClick={() => spendHitDie(pool.die)}
                disabled={pool.current <= 0}
                className={`px-2 py-1 ${buttonBgClass} disabled:${disabledBgClass} disabled:${disabledTextClass} text-white rounded text-xs transition-colors`}
                title={`Spend a d${pool.die} (short rest)`}
              >
                Spend
              </button>
            </div>
          ))}
          <div className={`flex justify-end pt-2 border-t ${borderClass}`}>
            <button
              onClick={resetHitDice}
              className="px-2 py-1 bg-accent-green hover:bg-green-600 text-white rounded text-xs transition-colors"
              title="Reset hit dice (long rest)"
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
      <div className="space-y-2">
        {/* Current Hit Dice Display */}
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-xs font-cinzel ${textSecondaryClass}`}>Available</div>
            <div className={`text-lg font-cinzel font-bold ${textPrimaryClass}`}>
              {hitDiceInfo.current} / {hitDiceInfo.max}
            </div>
            <div className={`text-xs font-cinzel ${textSecondaryClass}`}>d{hitDiceInfo.dieType}</div>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => spendHitDie()}
              disabled={hitDiceInfo.available <= 0}
              className={`px-2 py-1 ${buttonBgClass} disabled:${disabledBgClass} disabled:${disabledTextClass} text-white rounded text-xs transition-colors`}
              title="Spend hit die (short rest)"
            >
              Spend
            </button>
            <button
              onClick={resetHitDice}
              className="px-2 py-1 bg-accent-green hover:bg-green-600 text-white rounded text-xs transition-colors"
              title="Reset hit dice (long rest)"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Hit Die Healing Preview */}
        {hitDiceInfo.available > 0 && (
          <div className={`pt-2 border-t ${borderClass}`}>
            <div className={`text-xs font-cinzel ${textSecondaryClass}`}>Next healing:</div>
            <div className={`text-sm font-cinzel ${textPrimaryClass}`}>
              {Math.max(1, Math.floor(hitDiceInfo.dieType / 2) + getModifier(character.abilities.CON.score))} HP
              <span className={`${textSecondaryClass} text-xs ml-1`}>
                (avg + CON)
              </span>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};