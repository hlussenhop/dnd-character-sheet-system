import React from 'react'
import type { Edition } from '../types/dnd'
import {
  type OptionalFeatureAllowance,
  getOptionalFeature,
  optionalFeatureNotes,
  optionalFeaturesForPick,
} from '../utils/optionalFeatures'

interface OptionalFeaturePickerProps {
  groups: OptionalFeatureAllowance[]
  edition: Edition
  level: number
  classSlug: string
  pact?: string | null
  /** Slugs already known. They satisfy prerequisites and are not picked again. */
  locked?: string[]
  selected: string[]
  onChange: (slugs: string[]) => void
}

const ofType = (slug: string, featureType: string, edition: Edition): boolean =>
  !!getOptionalFeature(slug, edition)?.featureTypes.includes(featureType)

/**
 * Pick a fixed number of optional class features for each group.
 * A group with count 1 replaces the current pick. A larger group fills until it is full.
 */
export const OptionalFeaturePicker: React.FC<OptionalFeaturePickerProps> = ({
  groups,
  edition,
  level,
  classSlug,
  pact,
  locked = [],
  selected,
  onChange,
}) => {
  const context = [...locked, ...selected]

  const toggle = (slug: string, featureType: string, count: number, required: string[]) => {
    if (required.includes(slug)) return
    const inGroup = selected.filter(item => ofType(item, featureType, edition))
    if (selected.includes(slug)) {
      onChange(selected.filter(item => item !== slug))
      return
    }
    if (inGroup.length < count) {
      onChange([...selected, slug])
      return
    }
    if (count === 1) {
      const drop = inGroup.find(item => !required.includes(item))
      if (!drop) return
      onChange([...selected.filter(item => item !== drop), slug])
    }
  }

  return (
    <div className="space-y-6">
      {groups.map(group => {
        const options = optionalFeaturesForPick(group.featureType, edition, level, classSlug, context, pact)
          .filter(feature => !locked.includes(feature.slug))
        const chosen = selected.filter(slug => ofType(slug, group.featureType, edition))
        const full = chosen.length >= group.known

        return (
          <section key={group.featureType} className="space-y-3">
            <div>
              <h4 className="text-lg font-bold text-accent-yellow-light">{group.name}</h4>
              <p className="text-sm text-theme-muted">
                Choose {group.known}. {chosen.length} selected.
              </p>
            </div>
            {options.length < group.known && (
              <p className="text-sm text-accent-yellow-light">
                Fewer options are available than this level asks for.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {options.map(feature => {
                const isSelected = selected.includes(feature.slug)
                const isRequired = group.required.includes(feature.slug)
                const notes = optionalFeatureNotes(feature)
                return (
                  <button
                    key={feature.slug}
                    type="button"
                    disabled={!isSelected && full && group.known !== 1}
                    onClick={() => toggle(feature.slug, group.featureType, group.known, group.required)}
                    className={`p-4 rounded-lg text-left border-2 transition-all disabled:opacity-50 ${
                      isSelected
                        ? 'bg-orange-800 border-orange-500 shadow-md'
                        : 'bg-theme-tertiary border-theme-primary hover:bg-theme-quaternary'
                    }`}
                  >
                    <p className="text-base font-bold text-accent-yellow-light">
                      {feature.name}
                      {isRequired && <span className="ml-2 text-xs text-theme-muted">Included</span>}
                    </p>
                    <p className="text-sm text-theme-tertiary mt-2 line-clamp-4">{feature.description}</p>
                    {notes.length > 0 && (
                      <p className="text-xs text-theme-muted mt-2">{notes.join(' · ')}</p>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}