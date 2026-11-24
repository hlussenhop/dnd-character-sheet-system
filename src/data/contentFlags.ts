/**
 * DMG monstrous player species (Bullywug, Gnoll, Grimlock, Kuo-Toa, Merfolk,
 * Skeleton, Troglodyte, Zombie). On, they appear in the species lists.
 * Turn this off to hide them from creation. Saved characters still resolve.
 */
export const SHOW_MONSTROUS_PLAYER_SPECIES = true

export function isPlayerSpeciesOffered(
  species: { monstrousOption?: boolean },
  showMonstrousPlayerSpecies = SHOW_MONSTROUS_PLAYER_SPECIES,
): boolean {
  return showMonstrousPlayerSpecies || !species.monstrousOption
}
