import React, { useMemo, useState } from 'react';
import { Character } from '../../types/dnd';
import { characterHasSpellPage, SheetPage, SheetPageContext } from './sheetPageState';

export const SheetPageProvider: React.FC<{ character: Character; children: React.ReactNode }> = ({ character, children }) => {
  const [page, setPage] = useState<SheetPage>('sheet');
  const showSpellsTab = characterHasSpellPage(character);
  const value = useMemo(() => ({
    page: showSpellsTab ? page : 'sheet',
    setPage,
    showSpellsTab,
  }), [page, showSpellsTab]);

  return <SheetPageContext.Provider value={value}>{children}</SheetPageContext.Provider>;
};
