import React, { useEffect } from 'react'
import { ArrowLeft, ArrowRight, Shuffle } from 'lucide-react'
import { StepProps } from '../types/wizard.types'
import {
  getOptionalFeature,
  optionalFeatureAllowance,
  optionalFeatureSelectionComplete,
  optionalFeaturesForPick,
  resolveOptionalFeatureSlug,
} from '../../../utils/optionalFeatures'
import { OptionalFeaturePicker } from '../../OptionalFeaturePicker'

const RandomizeButton: React.FC<{ onClick: () => void; title: string }> = ({ onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="p-2 bg-accent-yellow-dark hover:bg-accent-yellow rounded-lg text-white transition-colors"
  >
    <Shuffle className="w-4 h-4" />
  </button>
)

const storedSlugs = (data: StepProps['data'], edition: StepProps['data']['edition']): string[] => {
  if (data.optionalFeatures) return data.optionalFeatures
  return [data.fightingStyle, data.selectedFightingStyle, ...(data.eldritchInvocations ?? [])]
    .filter((slug): slug is string => !!slug)
    .map(slug => resolveOptionalFeatureSlug(slug, edition))
    .filter(slug => getOptionalFeature(slug, edition))
}

/**
 * Every optional class feature the character knows at the level they are created:
 * fighting styles, invocations, metamagic, maneuvers, infusions, and the rest.
 */
export const Step3point5FightingStyle: React.FC<StepProps> = ({ data, updateData, nextStep, prevStep, getNextStepLabel }) => {
  const edition = data.edition || '2014'
  const stored = storedSlugs(data, edition)
  const provisional = data.classSlug
    ? optionalFeatureAllowance(data.classSlug, edition, data.level, data.subclassSlug, stored)
    : []
  const selected = [...new Set([...stored, ...provisional.flatMap(group => group.required)])]
  const groups = data.classSlug
    ? optionalFeatureAllowance(data.classSlug, edition, data.level, data.subclassSlug, selected)
    : []
  const hasProcessedAutoAdvance = React.useRef(false)

  const commit = (slugs: string[]) => {
    const features = slugs.map(slug => getOptionalFeature(slug, edition)).filter(feature => !!feature)
    const update: Parameters<typeof updateData>[0] = { optionalFeatures: slugs }
    if (groups.some(group => group.featureType.startsWith('FS:'))) {
      const fighting = features.find(feature => feature.featureTypes.some(type => type.startsWith('FS:')))
      update.fightingStyle = fighting?.slug
      update.selectedFightingStyle = fighting?.slug ?? null
    }
    if (groups.some(group => group.featureType === 'EI')) {
      update.eldritchInvocations = features.filter(feature => feature.featureTypes.includes('EI')).map(feature => feature.slug)
    }
    updateData(update)
  }

  useEffect(() => {
    if (!hasProcessedAutoAdvance.current && groups.length === 0) {
      hasProcessedAutoAdvance.current = true
      nextStep()
    }
  }, [groups.length, nextStep])

  const randomize = () => {
    const context = [...selected]
    const next: string[] = []
    for (const group of groups) {
      const pool = optionalFeaturesForPick(group.featureType, edition, data.level, data.classSlug, context, data.pactBoon)
        .map(feature => feature.slug)
      const required = group.required.filter(slug => pool.includes(slug))
      const shuffled = pool.filter(slug => !required.includes(slug)).sort(() => Math.random() - 0.5)
      const picks = [...required, ...shuffled].slice(0, group.known)
      next.push(...picks)
      context.push(...picks)
    }
    commit([...new Set(next)])
  }

  if (groups.length === 0) {
    return <div className="text-center text-theme-muted">This class has no options at level {data.level}. Advancing...</div>
  }

  const title = groups.length === 1 ? `Choose ${groups[0].name}` : 'Choose Class Options'
  const ready = optionalFeatureSelectionComplete(groups, selected, edition)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold text-red-300">{title}</h3>
          <p className="text-sm text-theme-muted mt-2">
            These are the options your class knows at level {data.level}.
          </p>
        </div>
        <RandomizeButton onClick={randomize} title="Randomize class options" />
      </div>

      <OptionalFeaturePicker
        groups={groups}
        edition={edition}
        level={data.level}
        classSlug={data.classSlug}
        pact={data.pactBoon}
        selected={selected}
        onChange={commit}
      />

      <div className="flex justify-between">
        <button type="button" onClick={prevStep} className="px-4 py-2 bg-theme-quaternary hover:bg-theme-hover rounded-lg text-white flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </button>
        <button
          type="button"
          onClick={() => {
            commit(selected)
            nextStep()
          }}
          disabled={!ready}
          className="px-4 py-2 bg-accent-red hover:bg-accent-red-light rounded-lg text-white flex items-center disabled:bg-theme-quaternary disabled:cursor-not-allowed"
        >
          Next: {getNextStepLabel?.() || 'Continue'} <ArrowRight className="w-4 h-4 ml-2" />
        </button>
      </div>
    </div>
  )
}
