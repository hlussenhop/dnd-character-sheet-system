import React, { useMemo, useState } from 'react'
import { Search, Sparkles, X } from 'lucide-react'
import type { Character, Edition, MagicItem } from '../../types/dnd'
import { useMagicItemIndex } from '../../hooks/useMagicItemIndex'

type MagicItemIndex = Omit<MagicItem, 'description'>

const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact']

interface MagicItemPickerModalProps {
  isOpen: boolean
  character: Character
  onClose: () => void
  onAdd: (item: MagicItemIndex) => void
}

export const MagicItemPickerModal: React.FC<MagicItemPickerModalProps> = ({
  isOpen,
  character,
  onClose,
  onAdd,
}) => {
  const index = useMagicItemIndex()
  const [search, setSearch] = useState('')
  const [edition, setEdition] = useState<Edition | 'all'>(character.edition || '2024')
  const [rarity, setRarity] = useState('all')
  const [added, setAdded] = useState('')

  const results = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!index || query.length < 2) return []
    return index
      .filter(item => edition === 'all' || item.edition === edition)
      .filter(item => rarity === 'all' || item.rarity === rarity)
      .filter(item => item.name.toLowerCase().includes(query))
      .slice(0, 40)
  }, [index, search, edition, rarity])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-theme-secondary border border-theme-primary rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-theme-primary">
          <h2 className="text-xl font-bold text-theme-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent-yellow" />
            Add Magic Item
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-theme-tertiary rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 border-b border-theme-primary">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
            <input
              type="text"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search by name..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-theme-border bg-theme-tertiary text-theme-primary"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['2014', '2024', 'all'] as const).map(value => (
              <button
                key={value}
                onClick={() => setEdition(value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${
                  edition === value ? 'bg-accent-blue text-white' : 'bg-theme-tertiary text-theme-muted'
                }`}
              >
                {value === 'all' ? 'Both editions' : value}
              </button>
            ))}
            <select
              value={rarity}
              onChange={event => setRarity(event.target.value)}
              className="px-3 py-1 rounded-lg text-xs bg-theme-tertiary text-theme-primary border border-theme-border"
              aria-label="Rarity"
            >
              <option value="all">Any rarity</option>
              {RARITIES.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
          {added && <p className="text-sm text-accent-green">Added {added}</p>}
        </div>

        <div className="overflow-y-auto p-5 space-y-2">
          {!index && <p className="text-theme-muted text-sm">Loading the catalog...</p>}
          {index && search.trim().length < 2 && (
            <p className="text-theme-muted text-sm">Type at least two letters to search the catalog.</p>
          )}
          {index && search.trim().length >= 2 && results.length === 0 && (
            <p className="text-theme-muted text-sm">No items match.</p>
          )}
          {results.map(item => (
            <button
              key={item.slug}
              onClick={() => {
                onAdd(item)
                setAdded(item.name)
              }}
              className="w-full text-left p-3 rounded-lg bg-theme-tertiary/60 hover:bg-theme-tertiary border border-theme-border"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-theme-primary">{item.name}</span>
                <span className="text-xs text-theme-muted capitalize">{item.edition}</span>
              </div>
              <div className="text-xs text-theme-muted mt-1 capitalize">
                {item.rarity} {item.itemType}
                {item.attunement ? ' · Attunement' : ''}
                {item.attunementRequirement ? ` (${item.attunementRequirement})` : ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
