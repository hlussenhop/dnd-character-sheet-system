import { useEffect, useState } from 'react';
import type { Feat } from '../types/dnd';
import { loadFeatDescription, peekFeatDescription } from '../services/featDescriptions';

/** A feat's full text, loaded on demand. Undefined while loading (or for an unknown feat). */
export function useFeatDescription(feat: Pick<Feat, 'slug' | 'source' | 'description'> | undefined): string | undefined {
  const [loaded, setLoaded] = useState<{ slug: string; text: string | undefined }>();

  useEffect(() => {
    if (!feat || peekFeatDescription(feat) !== undefined) return;
    let active = true;
    loadFeatDescription(feat)
      .then(text => { if (active) setLoaded({ slug: feat.slug, text }); })
      .catch(() => { if (active) setLoaded({ slug: feat.slug, text: undefined }); });
    return () => { active = false; };
  }, [feat]);

  if (!feat) return undefined;
  return peekFeatDescription(feat) ?? (loaded?.slug === feat.slug ? loaded.text : undefined);
}
