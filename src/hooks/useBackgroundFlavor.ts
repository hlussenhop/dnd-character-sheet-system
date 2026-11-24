import { useEffect, useState } from 'react'
import type { Background } from '../types/dnd'
import { loadBackgroundFlavor, type BackgroundFlavor } from '../services/backgroundFlavor'

/** The book's full background text and personality tables, loaded on demand. */
export function useBackgroundFlavor(
  background: Pick<Background, 'slug' | 'source'> | undefined,
): BackgroundFlavor | undefined {
  const [flavor, setFlavor] = useState<BackgroundFlavor | undefined>()
  const slug = background?.slug
  const source = background?.source

  useEffect(() => {
    if (!slug) return undefined
    let active = true
    loadBackgroundFlavor({ slug, source })
      .then(next => { if (active) setFlavor(next) })
      .catch(() => { if (active) setFlavor(undefined) })
    return () => { active = false }
  }, [slug, source])

  return flavor?.slug === slug ? flavor : undefined
}
