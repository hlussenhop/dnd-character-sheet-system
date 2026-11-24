import subclassFeaturesByLevel from '../data/subclassFeaturesByLevel.json'

interface CatalogFeature {
  level: number
  name: string
  description: string
}

interface CatalogSubclass {
  features?: CatalogFeature[]
}

const catalog = subclassFeaturesByLevel as Record<string, Record<string, CatalogSubclass>>

const featureSlug = (name: string, level: number) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base}-${level}`
}

const featuresOf = (classSlug?: string | null, subclassSlug?: string | null): CatalogFeature[] => {
  if (!classSlug || !subclassSlug) return []
  return catalog[classSlug]?.[subclassSlug]?.features ?? []
}

/** Subclass features the character has at this level, in the sheet's feature shape. */
export function subclassFeaturesUpToLevel(
  classSlug: string | undefined,
  subclassSlug: string | null | undefined,
  level: number,
): Array<{ name: string; slug: string; level: number; source: 'subclass' }> {
  return featuresOf(classSlug, subclassSlug)
    .filter(feature => feature.level <= level)
    .map(feature => ({
      name: feature.name,
      slug: featureSlug(feature.name, feature.level),
      level: feature.level,
      source: 'subclass' as const,
    }))
}

/** Book text for one feature of the character's subclass, when the catalog has it. */
export function subclassFeatureDescription(
  classSlug: string | undefined,
  subclassSlug: string | null | undefined,
  name: string,
): string | undefined {
  return featuresOf(classSlug, subclassSlug).find(feature => feature.name === name)?.description
}
