import React, { useMemo, useState } from 'react';
import { Shuffle, ArrowLeft } from 'lucide-react';
import { StepProps } from '../types/wizard.types';
import { getAllSpecies, getBackground } from '../../../services/dataService';
import { SpeciesFilterBar } from './SpeciesFilterBar';
import {
  EMPTY_SPECIES_PICKER_FILTERS,
  SPECIES_PICKER_TAGS,
  filterPickerSpecies,
  speciesSourceLabel,
  type SpeciesPickerFilters,
} from '../../../utils/speciesPickerFilters';
import { grantedBackgroundSkills } from '../../../utils/backgroundUtils';
import { HumanVariantSelector, OriginFeatSelector, SmartNavigationButton, SpeciesAbilityChoiceWidget, SpeciesGrantChoices, SpeciesVariantSelector } from '../components';
import { getVariantPickerOptions, hasValidVariantSelection, isVariantChoiceRequired } from '../../../utils/speciesVariantUtils';
import { getSpeciesAbilityRules, formatAbilityPattern, formatSignedBonus, getChoosableAbilities } from '../../../utils/speciesAbilityUtils';
import { resolveSpeciesGrants, SPECIES_CHOICE_RESET } from '../../../utils/speciesGrantUtils';
import { randomSpeciesSelections } from '../../../utils/randomizeCreation';
import { useStepValidation } from '../hooks';

interface RandomizeButtonProps {
  onClick: () => void;
  title: string;
}

const RandomizeButton: React.FC<RandomizeButtonProps> = ({ onClick, title }) => (
  <button
    onClick={onClick}
    title={title}
    className="p-2 bg-accent-yellow-dark hover:bg-accent-yellow rounded-lg text-white transition-colors"
  >
    <Shuffle className="w-4 h-4" />
  </button>
);

const randomSpecies = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const SpeciesLore: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  if (!text) return null;
  return (
    <div>
      <p className={`text-sm text-theme-tertiary ${open || !long ? '' : 'line-clamp-4'}`}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          className="mt-1 text-xs text-accent-yellow-light hover:underline"
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
};

export const Step2Species: React.FC<StepProps> = ({ data, updateData, nextStep, prevStep, getNextStepLabel, openTraitModal }) => {
  const [filters, setFilters] = useState<SpeciesPickerFilters>(EMPTY_SPECIES_PICKER_FILTERS);
  const [filtersForEdition, setFiltersForEdition] = useState(data.edition);
  if (filtersForEdition !== data.edition) {
    setFiltersForEdition(data.edition);
    setFilters(EMPTY_SPECIES_PICKER_FILTERS);
  }

  // The ruleset is chosen before the wizard starts, so this step only offers that edition.
  const visibleSpecies = useMemo(() => getAllSpecies(data.edition), [data.edition]);
  const selectedSpecies = visibleSpecies.find(species => species.slug === data.speciesSlug);
  const abilityRules = getSpeciesAbilityRules(selectedSpecies, data.selectedSpeciesVariant);
  const variantOptions = getVariantPickerOptions(selectedSpecies, data.edition);
  // A species whose variant must be picked doesn't show its ability choice until it is
  const awaitingVariant = isVariantChoiceRequired(selectedSpecies, data.edition) && !hasValidVariantSelection(selectedSpecies, data);

  // Skills already granted elsewhere (background, fixed species proficiencies) are not offered as species picks
  const backgroundSkills = grantedBackgroundSkills(getBackground(data.background), data);
  const unavailableSkills = [
    ...backgroundSkills,
    ...resolveSpeciesGrants(selectedSpecies, {
      edition: data.edition,
      level: data.level,
      variantSlug: data.selectedSpeciesVariant,
      walkSpeed: selectedSpecies?.speed ?? 30,
    }).skills,
  ];

  // Validation hook
  const { canProceed, missingItems, nextAction } = useStepValidation(2, data);





  const shownSpecies = useMemo(
    () => filterPickerSpecies(visibleSpecies, filters),
    [visibleSpecies, filters],
  );
  const sources = useMemo(() => {
    const codes = new Set(visibleSpecies.map(species => species.source).filter(Boolean));
    return [...codes].sort((a, b) => speciesSourceLabel(a).localeCompare(speciesSourceLabel(b)));
  }, [visibleSpecies]);
  const tags = useMemo(() => {
    const present = new Set(visibleSpecies.flatMap(species => species.tags ?? []));
    return SPECIES_PICKER_TAGS.map(tag => tag.id).filter(tag => present.has(tag));
  }, [visibleSpecies]);

  const updateFilters = (updated: Partial<SpeciesPickerFilters>) => {
    setFilters(current => ({ ...current, ...updated }));
  };

  return (
    <div className='space-y-6'>
      <div className='flex justify-between items-center'>
        <h3 className='text-xl font-bold text-red-300'>Select Species (Species Bonuses will be applied automatically)</h3>
        <RandomizeButton
          onClick={() => {
            if (visibleSpecies.length === 0) return;
            const pick = randomSpecies(visibleSpecies);
            const selections = randomSpeciesSelections(pick, data.edition, backgroundSkills);
            const { featChoices, ...rest } = selections;
            updateData({
              speciesSlug: pick.slug,
              ...rest,
              featChoices: { ...(data.featChoices ?? {}), ...(featChoices ?? {}) },
            });
          }}
          title="Randomize species selection"
        />
      </div>

      <SpeciesFilterBar
        filters={filters}
        onChange={updateFilters}
        onReset={() => setFilters(EMPTY_SPECIES_PICKER_FILTERS)}
        sources={sources}
        tags={tags}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5">
          <p className="mb-2 text-sm text-theme-muted">
            {shownSpecies.length} species
          </p>
          {shownSpecies.length === 0 ? (
            <div className="p-8 text-center rounded-lg border border-dashed border-theme-primary text-theme-muted">
              No species match these filters.
            </div>
          ) : (
            <div className="max-h-72 lg:max-h-[36rem] overflow-y-auto rounded-lg border border-theme-primary divide-y divide-theme-primary">
              {shownSpecies.map(species => (
                <button
                  key={species.slug}
                  onClick={() => updateData({ speciesSlug: species.slug, ...SPECIES_CHOICE_RESET })}
                  className={`w-full px-3 py-2 text-left transition-colors ${
                    data.speciesSlug === species.slug
                      ? 'bg-accent-red-darker'
                      : 'bg-theme-tertiary hover:bg-theme-quaternary'
                  }`}
                >
                  <span className="block text-sm font-semibold text-accent-yellow-light truncate">{species.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 lg:sticky lg:top-4 lg:max-h-[36rem] lg:overflow-y-auto">
      {!selectedSpecies ? (
        <div className="p-8 text-center rounded-lg border border-dashed border-theme-primary text-theme-muted">
          Choose a species to see its traits and any choices it asks for.
        </div>
      ) : (
        <div className="bg-theme-tertiary/50 border border-theme-primary rounded-lg p-4 space-y-3">
          <div>
            <h4 className="text-lg font-bold text-accent-yellow-light">{selectedSpecies.name}</h4>
            <p className="text-xs text-theme-disabled">
              {selectedSpecies.edition} · {speciesSourceLabel(selectedSpecies.source)}
              {selectedSpecies.speed ? ` · ${selectedSpecies.speed} ft.` : ''}
              {selectedSpecies.swimSpeed ? ` · swim ${selectedSpecies.swimSpeed} ft.` : ''}
            </p>
          </div>

          <SpeciesLore key={selectedSpecies.slug} text={selectedSpecies.detailedDescription || selectedSpecies.description} />

           <div className="space-y-3 text-sm">
             {/* 2024 Traits */}
              {data.edition === '2024' && selectedSpecies.traits && (
                <div>
                  <h5 className="font-semibold text-accent-green-light mb-2">Traits:</h5>
                  <ul className="space-y-1">
                    {selectedSpecies.traits.map((trait: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <span className="text-accent-yellow-light mr-2">•</span>
                        <span className="text-theme-primary">{trait}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

             {/* 2014 Ability Bonuses */}
             {data.edition === '2014' && (Object.keys(abilityRules.fixed).length > 0 || abilityRules.choice) && (
               <div>
                 <h5 className="font-semibold text-accent-red-light mb-2">Ability Bonuses:</h5>
                 <div className="flex flex-wrap gap-2">
                   {Object.entries(abilityRules.fixed).map(([ability, bonus]) => (
                     <span key={ability} className="px-2 py-1 bg-blue-700 text-white text-xs rounded">
                       {ability} {formatSignedBonus(bonus)}
                     </span>
                   ))}
                   {abilityRules.choice && (
                     <span className="px-2 py-1 bg-blue-900 text-white text-xs rounded">
                       Your choice: {abilityRules.choice.patterns.map(formatAbilityPattern).join(' or ')}
                       {abilityRules.choice.from && getChoosableAbilities(abilityRules.choice, abilityRules.fixed).length < 6
                         ? ` (from ${getChoosableAbilities(abilityRules.choice, abilityRules.fixed).join(', ')})`
                         : ''}
                     </span>
                   )}
                 </div>
               </div>
             )}

              {/* Lineage Choices for 2024 */}
              {data.edition === '2024' && selectedSpecies.lineages && (
                <div>
                  <h5 className="font-semibold text-accent-blue-light mb-2">Choose Lineage:</h5>
                  <div className="space-y-2">
                    {Object.entries(selectedSpecies.lineages).map(([lineageName, lineageData]) => (
                      <button
                        key={lineageName}
                        className={`w-full text-left border rounded p-3 transition-all ${
                          data.selectedLineage === lineageName
                            ? 'border-accent-blue-light bg-theme-quaternary'
                            : 'border-theme-primary bg-theme-secondary/30 hover:bg-theme-quaternary/40'
                        }`}
                        onClick={() => updateData({ selectedLineage: lineageName })}
                      >
                        <h6 className="font-medium text-theme-primary mb-1">{lineageName}</h6>
                        {lineageData.traits && (
                          <div className="text-xs text-theme-muted mb-1">
                            <strong>Traits:</strong> {lineageData.traits.join(', ')}
                          </div>
                        )}
                        {lineageData.spells && (
                          <div className="text-xs text-theme-muted">
                            <strong>Spells:</strong> {lineageData.spells.join(', ')}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Celestial Revelation Choices for Aasimar */}
              {data.edition === '2024' && selectedSpecies.slug === 'aasimar' && selectedSpecies.celestialRevelationOptions && (
                <div>
                  <h5 className="font-semibold text-accent-gold-light mb-2">Celestial Revelation (Level 3):</h5>
                  <div className="space-y-2">
                    {selectedSpecies.celestialRevelationOptions.map((option: string, index: number) => (
                      <div key={index} className="border border-theme-primary rounded p-3">
                        <div className="text-xs text-theme-muted">{option}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            {data.edition === '2024' && (
              <div>
                <span className="font-semibold text-accent-red-light">Ability Score Increases: </span>
                <p className="text-theme-tertiary mt-1">
                  Your Ability Score Increases are determined by your chosen Background.
                </p>
              </div>
            )}
             <div>
               <span className="font-semibold text-accent-red-light">Species Traits: </span>
               <div className="flex flex-wrap gap-2 mt-1">
                 {selectedSpecies.species_traits
                   .filter(trait => !selectedSpecies.variants?.find(v => v.slug === data.selectedSpeciesVariant)?.replacesTraits?.includes(trait))
                   .map((trait, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const position = {
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2
                        };
                        openTraitModal?.(trait, position);
                      }}
                      className="px-2 py-1 bg-accent-green-dark hover:bg-accent-green text-white text-xs rounded transition-colors cursor-pointer"
                      title={`Click to learn more about ${trait}`}
                    >
                      {trait}
                    </button>
                 ))}
               </div>
             </div>

            {selectedSpecies.typicalRoles.length > 0 && (
              <div className="pt-2 border-t border-theme-primary">
                <div className="font-semibold text-accent-yellow-light mb-1">Typical Roles:</div>
                <p className="text-xs text-theme-muted">{selectedSpecies.typicalRoles.join(', ')}</p>
              </div>
            )}

      {/* Generic variant picker (subraces, Dragonmarks, ...). Human has its own selector. */}
      {selectedSpecies && variantOptions && (
        <SpeciesVariantSelector
          species={selectedSpecies}
          variants={variantOptions}
          selectedSlug={data.selectedSpeciesVariant}
          onSelect={variantSlug => updateData({ selectedSpeciesVariant: variantSlug, speciesAbilityChoices: undefined, speciesPicks: undefined })}
        />
      )}

      {/* Flexible species ability score increases (2014). Human is handled by its own variant selector. */}
      {selectedSpecies && selectedSpecies.slug !== 'human' && data.edition === '2014' && abilityRules.choice && !awaitingVariant && (
        <SpeciesAbilityChoiceWidget
          key={`${selectedSpecies.slug}:${data.selectedSpeciesVariant ?? ''}`}
          choice={abilityRules.choice}
          fixed={abilityRules.fixed}
          selection={data.speciesAbilityChoices}
          onChange={selection => updateData({ speciesAbilityChoices: selection })}
        />
      )}

      {/* Species choices (draconic ancestry, fiendish legacy, giant ancestry) and trait skill/tool picks */}
      {selectedSpecies && !awaitingVariant && (
        <SpeciesGrantChoices
          key={`grants:${selectedSpecies.slug}:${data.selectedSpeciesVariant ?? ''}`}
          species={selectedSpecies}
          data={data}
          unavailableSkills={unavailableSkills}
          onChange={patch => updateData(patch)}
        />
      )}

      {/* Human Variant Selection */}
      {selectedSpecies?.slug === 'human' && data.edition === '2014' && (
        <HumanVariantSelector
          data={data}
          updateData={updateData}
        />
       )}

       {/* 2024 Species Feat Selection */}
        {data.edition === '2024' && selectedSpecies && selectedSpecies.speciesFeatOptions && (
          <div className="bg-theme-secondary/50 border border-theme-primary rounded-lg p-4">
            <h5 className="font-semibold text-accent-yellow-light mb-3">Choose Species Feat</h5>
            <select
              value={data.speciesFeat || ''}
              onChange={(e) => updateData({ speciesFeat: e.target.value })}
              className="w-full p-3 bg-theme-tertiary text-white rounded-lg"
            >
              <option value="">Select a feat...</option>
              {selectedSpecies.speciesFeatOptions.map((feat) => (
                <option key={feat} value={feat}>
                  {feat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        )}

        {data.edition === '2024' && selectedSpecies && selectedSpecies.speciesFeat && (
          <div className="bg-accent-yellow/10 border border-accent-yellow rounded-lg p-3">
            <p className="text-theme-primary">Your species grants you the <strong>{selectedSpecies.speciesFeat}</strong> feat.</p>
          </div>
        )}

        {selectedSpecies?.slug === 'human-2024' && data.edition === '2024' && (
         <div className="text-sm text-theme-muted p-4 bg-theme-secondary/50 rounded-lg border border-theme-primary space-y-4">
           <div>
             <p className="font-semibold text-accent-yellow-light">Human (2024) Traits:</p>
             <ul className="list-disc list-inside ml-4 mt-2 text-theme-tertiary">
               <li>You gain the Heroic Inspiration Trait.</li>
               <li>You gain one additional 1st-level feat (Origin Feat).</li>
             </ul>
           </div>

           <OriginFeatSelector
             selectedFeat={data.humanOriginFeat}
             onSelect={(featSlug) => updateData({ humanOriginFeat: featSlug })}
           />

           {/* Show second Origin Feat selector if Versatile is selected */}
           {data.humanOriginFeat === 'versatile' && (
             <div className="border-t border-theme-primary pt-4">
               <div>
                 <p className="font-semibold text-accent-yellow-light">Versatile Extra Origin Feat:</p>
                 <p className="mt-2 text-theme-tertiary">Since you selected the Versatile feat, choose one additional Origin Feat:</p>
               </div>

               <OriginFeatSelector
                 selectedFeat={data.humanVersatileFeat}
                 onSelect={(featSlug) => updateData({ humanVersatileFeat: featSlug })}
               />
             </div>
           )}
         </div>
       )}
          </div>
        </div>
      )}
        </div>
      </div>

      <div className='flex justify-between'>
        <button onClick={prevStep} className="px-4 py-2 bg-theme-quaternary hover:bg-theme-hover rounded-lg text-white flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </button>
        <SmartNavigationButton
          canProceed={canProceed}
          missingItems={missingItems}
          nextAction={nextAction}
          onClick={nextStep}
          variant="next"
        >
          Next: {getNextStepLabel?.() || 'Continue'}
        </SmartNavigationButton>
      </div>
    </div>
  );
};
