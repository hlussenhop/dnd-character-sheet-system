import type { CharacterCreationData, Edition, Species, SpeciesVariant } from '../types/dnd'

type VariantSpecies = Pick<Species, 'slug' | 'variants' | 'variantOptional' | 'species_traits'>

/** Human has its own dedicated selector (HumanVariantSelector) and is not offered the generic picker. */
const HAS_DEDICATED_VARIANT_UI = new Set(['human'])

/**
 * Variants the generic Step 2 picker should offer for a species, or undefined if it
 * does not apply. 2024 species also carry `variants`, but those are lineage metadata
 * driven by the 2024 lineage UI, so only 2014 species use this picker.
 */
export function getVariantPickerOptions(
  species: Pick<Species, 'slug' | 'variants'> | undefined,
  edition: Edition,
): SpeciesVariant[] | undefined {
  if (!species || edition !== '2014') return undefined
  if (HAS_DEDICATED_VARIANT_UI.has(species.slug)) return undefined
  return species.variants && species.variants.length > 0 ? species.variants : undefined
}

/** True when the player must pick a variant before leaving Step 2. */
export function isVariantChoiceRequired(
  species: Pick<Species, 'slug' | 'variants' | 'variantOptional'> | undefined,
  edition: Edition,
): boolean {
  return !!getVariantPickerOptions(species, edition) && !species?.variantOptional
}

/** The variant selected in the creation data, if it exists on the species. */
export function getSelectedVariant(
  species: Pick<Species, 'variants'> | undefined,
  variantSlug: string | undefined,
): SpeciesVariant | undefined {
  if (!species || !variantSlug) return undefined
  return species.variants?.find(v => v.slug === variantSlug)
}

/** Whether the creation data holds a valid variant selection for the species' picker. */
export function hasValidVariantSelection(
  species: Pick<Species, 'slug' | 'variants'> | undefined,
  data: Pick<CharacterCreationData, 'edition' | 'selectedSpeciesVariant'>,
): boolean {
  const options = getVariantPickerOptions(species, data.edition)
  return !!options && options.some(v => v.slug === data.selectedSpeciesVariant)
}

/**
 * Trait names a character gets from its species: the base traits (minus any the selected
 * variant replaces) plus the selected variant's traits (de-duplicated, order preserved).
 */
export function getEffectiveSpeciesTraits(
  species: VariantSpecies | undefined,
  variantSlug: string | undefined,
): string[] {
  if (!species) return []
  const variant = getSelectedVariant(species, variantSlug)
  const replaced = new Set(variant?.replacesTraits ?? [])
  const base = (species.species_traits ?? []).filter(trait => !replaced.has(trait))
  return Array.from(new Set([...base, ...(variant?.species_traits ?? [])]))
}
