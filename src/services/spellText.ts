import type { AppSpell } from './dataService';
import { loadChunked } from './contentChunks';

export interface SpellText {
  description: string;
  atHigherLevels?: string;
}

interface SpellTextRecord {
  slug: string;
  description?: string;
  atHigherLevels?: string;
}

type DescribedSpell = Pick<AppSpell, 'slug' | 'book' | 'description' | 'atHigherLevels'>;

const cache = new Map<string, SpellText>();

const inline = (spell: DescribedSpell): SpellText | undefined =>
  spell.description ? { description: spell.description, atHigherLevels: spell.atHigherLevels } : undefined;

/** Full spell text: inline when the record has it, otherwise from its book's lazy chunk. */
export async function loadSpellText(spell: DescribedSpell): Promise<SpellText | undefined> {
  const ready = inline(spell);
  if (ready) return ready;
  const cached = cache.get(spell.slug);
  if (cached) return cached;
  if (!spell.book) return undefined;
  const records = await loadChunked<SpellTextRecord>('spells', [spell.book]);
  records.forEach(record => {
    if (record.description) {
      cache.set(record.slug, { description: record.description, atHigherLevels: record.atHigherLevels });
    }
  });
  return cache.get(spell.slug);
}

/** The text if it is already available without loading. */
export const peekSpellText = (spell: DescribedSpell): SpellText | undefined =>
  inline(spell) ?? cache.get(spell.slug);
