import React from 'react';
import type { AppSpell } from '../services/dataService';
import { useSpellText } from '../hooks/useSpellText';

interface SpellBlurbProps {
  spell: AppSpell;
  className?: string;
  /** Include the "at higher levels" paragraph, as the spell modals do. */
  higher?: boolean;
}

/** Spell description, loaded from the book's text chunk. */
export const SpellBlurb: React.FC<SpellBlurbProps> = ({ spell, className, higher }) => {
  const text = useSpellText(spell);
  if (!text) return null;
  return (
    <div className={className}>
      <p className="whitespace-pre-line">{text.description}</p>
      {higher && text.atHigherLevels && (
        <p className="whitespace-pre-line mt-3">
          <span className="font-semibold">At Higher Levels: </span>
          {text.atHigherLevels}
        </p>
      )}
    </div>
  );
};
