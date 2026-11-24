import type { Feat } from '../types/dnd';
import { loadChunked } from './contentChunks';

interface FeatDescriptionRecord {
  slug: string;
  description: string;
}

type DescribedFeat = Pick<Feat, 'slug' | 'source' | 'description'>;

const cache = new Map<string, string>();

/** Full text of a feat: inline when the record has it, otherwise from its source's lazy chunk. */
export async function loadFeatDescription(feat: DescribedFeat): Promise<string | undefined> {
  if (feat.description) return feat.description;
  const cached = cache.get(feat.slug);
  if (cached !== undefined) return cached;
  const records = await loadChunked<FeatDescriptionRecord>('feats', [feat.source.toUpperCase()]);
  records.forEach(r => cache.set(r.slug, r.description));
  return cache.get(feat.slug);
}

/** The description if it is already available without loading. */
export const peekFeatDescription = (feat: DescribedFeat): string | undefined =>
  feat.description ?? cache.get(feat.slug);
