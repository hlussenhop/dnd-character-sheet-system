import type { Background } from '../types/dnd'
import { loadChunked } from './contentChunks'

export interface BackgroundFlavor {
  slug: string
  description: string
  personalityTraits: string[]
  ideals: string[]
  bonds: string[]
  flaws: string[]
}

const cache = new Map<string, BackgroundFlavor | undefined>()

/** The book's full description and personality tables, loaded from the background's source chunk. */
export async function loadBackgroundFlavor(
  background: Pick<Background, 'slug' | 'source'>,
): Promise<BackgroundFlavor | undefined> {
  if (cache.has(background.slug)) return cache.get(background.slug)
  if (!background.source) return undefined
  const records = await loadChunked<BackgroundFlavor>('backgrounds', [background.source.toUpperCase()])
  records.forEach(record => cache.set(record.slug, record))
  return cache.get(background.slug)
}

export const peekBackgroundFlavor = (slug: string): BackgroundFlavor | undefined => cache.get(slug)
