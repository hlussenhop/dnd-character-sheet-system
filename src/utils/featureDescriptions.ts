import featureDescriptionsData from '../data/featureDescriptions.json';
import type { Edition } from '../types/dnd';

export type FeatureDescription = { description: string; source?: string };

export const featureDescriptions: Record<string, FeatureDescription> = featureDescriptionsData;

/**
 * Descriptions are keyed by trait name and shared by every edition. When the 2024 text of a
 * trait differs from the 2014 text, the 2024 text is stored under `<name> [2024]`; the plain
 * name always holds the 2014 text (or the only text, for traits that exist in one edition).
 */
export const editionKey = (name: string, edition: Edition): string =>
  edition === '2024' ? `${name} [2024]` : name;

/** The description of a trait for the given edition (2014 when no edition is given). */
export const getFeatureDescription = (name: string, edition?: Edition): FeatureDescription | undefined =>
  (edition === '2024' ? featureDescriptions[editionKey(name, edition)] : undefined) ?? featureDescriptions[name];
