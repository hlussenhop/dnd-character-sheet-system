import { createContext, useContext } from 'react';
import { Character } from '../../types/dnd';
import { asList } from '../../utils/normalizeCharacter';

export type SheetPage = 'sheet' | 'spells';

const TRAIT_SPELLS = new Set(['Infernal Legacy']);

export function characterHasSpellPage(character: Character): boolean {
  if (character.spellcasting) return true;
  return asList<string>(character.featuresAndTraits?.speciesTraits).some(trait => TRAIT_SPELLS.has(trait));
}

export interface SheetPageContextValue {
  page: SheetPage;
  setPage: (page: SheetPage) => void;
  showSpellsTab: boolean;
}

export const SheetPageContext = createContext<SheetPageContextValue | null>(null);

export function useSheetPage(): SheetPageContextValue {
  const value = useContext(SheetPageContext);
  if (!value) {
    return { page: 'sheet', setPage: () => {}, showSpellsTab: false };
  }
  return value;
}
