import { useEffect, useState } from 'react';
import type { AppSpell } from '../services/dataService';
import { loadSpellText, peekSpellText, type SpellText } from '../services/spellText';

/** A spell's description, loaded on demand. Undefined while the chunk is loading. */
export function useSpellText(spell: Pick<AppSpell, 'slug' | 'book' | 'description' | 'atHigherLevels'> | undefined): SpellText | undefined {
  const [loaded, setLoaded] = useState<{ slug: string; text: SpellText | undefined }>();

  useEffect(() => {
    if (!spell || peekSpellText(spell)) return;
    let active = true;
    loadSpellText(spell)
      .then(text => { if (active) setLoaded({ slug: spell.slug, text }); })
      .catch(() => { if (active) setLoaded({ slug: spell.slug, text: undefined }); });
    return () => { active = false; };
  }, [spell]);

  if (!spell) return undefined;
  return peekSpellText(spell) ?? (loaded?.slug === spell.slug ? loaded.text : undefined);
}
