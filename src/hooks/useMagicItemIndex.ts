import { useEffect, useState } from 'react'
import { getMagicItemIndexSync, loadMagicItemIndex } from '../services/magicItems'
import type { MagicItem } from '../types/dnd'

type MagicItemIndex = Omit<MagicItem, 'description'>

/** The magic-item catalog. The first render can be empty while the chunk loads. */
export const useMagicItemIndex = (): MagicItemIndex[] | null => {
  const [items, setItems] = useState<MagicItemIndex[] | null>(() => getMagicItemIndexSync())

  useEffect(() => {
    if (items) return
    let live = true
    loadMagicItemIndex().then(list => {
      if (live) setItems(list)
    })
    return () => {
      live = false
    }
  }, [items])

  return items
}
