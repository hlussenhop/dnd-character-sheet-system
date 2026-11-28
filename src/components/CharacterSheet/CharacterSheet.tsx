import React from 'react';
import { CharacterSheetProps } from '../../types/components';
import { useLayout, useIsMobile } from '../../hooks';
import { ModernStackedLayout, ClassicDndLayout, MobileLayout, PaperSheetLayout } from './layouts';
import { SheetPageProvider } from './sheetPage';

/**
 * CharacterSheet Wrapper
 *
 * This component selects the appropriate layout based on:
 * - Screen size (mobile always uses ModernStackedLayout)
 * - User preference (desktop can choose between layouts)
 */
export const CharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { layoutMode } = useLayout();
  const isMobile = useIsMobile();

  let layout: React.ReactNode;
  if (isMobile) {
    layout = <ModernStackedLayout {...props} />;
  } else {
    switch (layoutMode) {
      case 'classic-dnd':
        layout = <ClassicDndLayout {...props} />;
        break;
      case 'paper-sheet':
        layout = <PaperSheetLayout {...props} />;
        break;
      case 'mobile':
        layout = <MobileLayout {...props} />;
        break;
      case 'modern-stacked':
      default:
        layout = <ModernStackedLayout {...props} />;
        break;
    }
  }

  return (
    <SheetPageProvider key={props.character.id} character={props.character}>
      {layout}
    </SheetPageProvider>
  );
};
