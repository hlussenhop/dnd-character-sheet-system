import React, { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { MagicItem } from '../../types/dnd'
import { getMagicItem } from '../../services/magicItems'
import { magicItemSummary } from '../../utils/magicItemInventory'

interface MagicItemDetailModalProps {
  slug: string | null
  attuned?: boolean
  canAttune?: boolean
  onClose: () => void
  onAttune?: () => void
  onEndAttunement?: () => void
}

export const MagicItemDetailModal: React.FC<MagicItemDetailModalProps> = ({
  slug,
  attuned,
  canAttune,
  onClose,
  onAttune,
  onEndAttunement,
}) => {
  const [loaded, setLoaded] = useState<{ slug: string; item?: MagicItem } | null>(null)

  useEffect(() => {
    if (!slug) return
    let live = true
    getMagicItem(slug).then(found => {
      if (live) setLoaded({ slug, item: found })
    })
    return () => {
      live = false
    }
  }, [slug])

  if (!slug) return null

  const item = loaded?.slug === slug ? loaded.item : undefined
  const loading = loaded?.slug !== slug

  const summary = item ? magicItemSummary(item) : []

  return (
    <div className="fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-theme-secondary border border-theme-primary rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 p-6 border-b border-theme-primary">
          <div>
            <h2 className="text-xl font-bold text-theme-primary flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent-yellow" />
              {item?.name || slug}
            </h2>
            {item && (
              <p className="text-sm text-theme-muted capitalize mt-1">
                {item.rarity} {item.itemType} · {item.edition} · {item.source}
                {item.attunement ? ' · Requires attunement' : ''}
                {item.attunementRequirement ? ` ${item.attunementRequirement}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-theme-tertiary rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {item?.cursed && <span className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-200">Cursed</span>}
            {item?.sentient && <span className="text-xs px-2 py-1 rounded bg-purple-900/40 text-purple-100">Sentient</span>}
            {attuned && <span className="text-xs px-2 py-1 rounded bg-accent-yellow/20 text-accent-yellow-light">Attuned</span>}
          </div>

          {summary.length > 0 && (
            <ul className="text-sm text-theme-primary space-y-1">
              {summary.map(line => <li key={line}>{line}</li>)}
            </ul>
          )}

          {loading && <p className="text-sm text-theme-muted">Loading the item text...</p>}
          {item && !item.description && <p className="text-sm text-theme-muted">This item has no description in its book.</p>}
          {item?.description && (
            <div className="text-sm text-theme-primary whitespace-pre-wrap leading-relaxed">
              {item.description}
            </div>
          )}

          {item?.attunement && (
            <div className="flex justify-end">
              {attuned ? (
                <button
                  onClick={onEndAttunement}
                  className="px-3 py-2 rounded-lg bg-accent-red text-white text-sm"
                >
                  End attunement
                </button>
              ) : (
                <button
                  onClick={onAttune}
                  disabled={!canAttune}
                  className="px-3 py-2 rounded-lg bg-accent-yellow text-cyan-950 text-sm disabled:opacity-40"
                  title={canAttune ? 'Attune to this item' : 'No attunement slots left'}
                >
                  Attune
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
