import { CharacterCreationData, Character, AbilityName, SkillName } from '../types/dnd';
import { findSpeciesBySlug, loadClasses, getBackground, getSubclass, PROFICIENCY_BONUSES, getModifier, SKILL_TO_ABILITY, ALL_SKILLS, getHitDieForClass, resolveFeatSlug } from '../services/dataService';
import { backgroundFeatSlug, grantedBackgroundSkills, grantedBackgroundTools, toSkillName } from './backgroundUtils';
import { migrateSpellSelectionToCharacter } from '../utils/spellUtils';
import { addItemToInventoryByName } from '../utils/equipmentMatching';
import { BASE_ARMOR_CLASS } from '../constants/combat';
import { log } from './logger';
import { clampAssignedScore, resolveSpeciesAbilityBonuses } from './speciesAbilityUtils';
import { getEffectiveSpeciesTraits, getSelectedVariant } from './speciesVariantUtils';
import { calculateNaturalArmorClass, mergeGrants, resolveSpeciesGrants, speciesMovement } from './speciesGrantUtils';
import { getClassLanguages, getSpeciesLanguages, parseBackgroundLanguageChoices } from './languageUtils';
import { subclassFeaturesUpToLevel } from './subclassCatalog';
import { applyFeatAbilityIncreases, resolveFeatGrants } from './featGrantUtils';
import { applyOptionalFeatureGrants, getOptionalFeature, resolveOptionalFeatureSlug } from './optionalFeatures';

/**
 * Every feat a new character has: picked feats, the 2024 Origin, species and Versatile feats,
 * and feats taken in Ability Score Improvement slots. Slugs are resolved for the edition.
 */
export const collectCreationFeats = (data: CharacterCreationData, originFeat?: string): string[] => {
  const feats = [...(data.selectedFeats || [])];
  // A background feat applies in both editions (2024 Origin Feat, or a feat a 2014 background grants)
  if (originFeat) feats.push(originFeat);
  if (data.edition === '2024') {
    if (data.humanOriginFeat) feats.push(data.humanOriginFeat);
    if (data.speciesFeat) feats.push(data.speciesFeat);
    if (data.speciesSlug === 'human-2024' && data.humanVersatileFeat) feats.push(data.humanVersatileFeat);
  }
  data.cumulativeASI?.forEach(asiChoice => {
    if (asiChoice.type === 'feat' && asiChoice.featSlug) feats.push(asiChoice.featSlug);
  });
  return feats.map(slug => resolveFeatSlug(slug, data.edition));
};

/** Languages the wizard treats as automatic, plus the ones the player picked. */
const knownLanguagesFor = (
  data: CharacterCreationData,
  speciesSlug: string,
  classSlug: string,
  backgroundLanguages: string[] | undefined,
  grantLanguages: string[],
): string[] => {
  const known = new Set<string>(['Common']);
  getSpeciesLanguages(speciesSlug).forEach(language => known.add(language));
  getClassLanguages(classSlug).forEach(language => known.add(language));
  if (backgroundLanguages) {
    parseBackgroundLanguageChoices(backgroundLanguages).direct.forEach(language => known.add(language));
  }
  grantLanguages.forEach(language => known.add(language));
  ;(data.knownLanguages ?? []).forEach(language => known.add(language));
  return Array.from(known).sort();
};

/**
 * Calculate final character stats from character creation data
 */
export const calculateCharacterStats = (data: CharacterCreationData): Character => {
  const speciesData = findSpeciesBySlug(data.speciesSlug);
  const classData = loadClasses().find(c => c.slug === data.classSlug);
  const backgroundData = getBackground(data.background);

  log.debug('Character creation data lookup', {
    species: speciesData ? { name: speciesData.name, slug: speciesData.slug } : null,
    class: classData ? { name: classData.name, slug: classData.slug } : null,
    background: backgroundData ? { name: backgroundData.name, slug: backgroundData.slug } : null,
  });

  if (!speciesData || !classData || !backgroundData) {
    log.error('Character creation missing required data', {
      speciesSlug: data.speciesSlug,
      classSlug: data.classSlug,
      backgroundSlug: data.background
    });
    throw new Error("Incomplete creation data.");
  }

  // Every feat the character starts with (picked, Origin, species and ASI-slot feats), as current slugs
  const allFeats = collectCreationFeats(data, backgroundFeatSlug(backgroundData, data));

  const finalAbilities: Character['abilities'] = {} as Character['abilities'];
  const rawScores = {} as Record<AbilityName, number>;

  // 1. Calculate Abilities with Bonuses
  const speciesAbilityBonuses = resolveSpeciesAbilityBonuses(speciesData, data);
  (Object.keys(data.abilities) as AbilityName[]).forEach((ability) => {
    let rawScore = data.abilities[ability];

    if (data.edition === '2014') {
      // 2014: Apply Species Ability Bonuses
      rawScore += speciesAbilityBonuses[ability];
    } else if (data.edition === '2024') {
      // 2024: Apply Background Ability Bonuses
      // Fixed bonuses first
      rawScore += (backgroundData.abilityScores?.fixed?.[ability] || 0);
      // Then chosen options (assuming `data.abilities` already includes chosen options from wizard step)
      // This part might need further refinement based on how the wizard handles chosen background ASIs
      // For now, we assume rawScore already contains the chosen +1/+2
    }

    // Apply cumulative ASI increases for high-level characters
    if (data.cumulativeASI) {
      data.cumulativeASI.forEach(asiChoice => {
        if (asiChoice.type === 'asi' && asiChoice.asiAllocations) {
          rawScore += asiChoice.asiAllocations[ability] || 0;
        }
      });
    }

    rawScores[ability] = rawScore;
  });

  // Feat ability score increases (fixed ones, or the ability picked for the feat)
  const scoresWithFeats = applyFeatAbilityIncreases(rawScores, allFeats, data.edition, data.featChoices);
  (Object.keys(scoresWithFeats) as AbilityName[]).forEach((ability) => {
    const score = clampAssignedScore(data.abilities[ability], scoresWithFeats[ability]);
    finalAbilities[ability] = { score, modifier: getModifier(score) };
  });


  const level = data.level;
  const pb = PROFICIENCY_BONUSES[level - 1] || 2;

  // Lineage effects (traits/speed overrides) and the species' mechanical grants
  const lineageData = data.selectedLineage && 'lineages' in speciesData
    ? (speciesData as { lineages?: Record<string, { traits?: Character['featuresAndTraits']['speciesTraits']; baseSpeed?: number }> }).lineages?.[data.selectedLineage]
    : undefined;
  const variantSpeed = getSelectedVariant(speciesData, data.selectedSpeciesVariant)?.speed;
  const speciesSpeed = lineageData?.baseSpeed || variantSpeed || speciesData.speed || 30;
  const speciesOnlyGrants = resolveSpeciesGrants(speciesData, {
    edition: data.edition,
    level,
    variantSlug: data.selectedSpeciesVariant,
    lineage: data.selectedLineage,
    choices: data.speciesChoices,
    picks: data.speciesPicks,
    walkSpeed: speciesSpeed,
  });
  const featGrants = resolveFeatGrants(allFeats, {
    edition: data.edition,
    level,
    walkSpeed: speciesSpeed,
    featChoices: data.featChoices,
  });
  const speciesGrants = mergeGrants(speciesOnlyGrants, featGrants);
  const effectiveSpeed = speciesSpeed + speciesGrants.speedBonus;

  // 2. Calculate Hit Points (Based on chosen method)
  let maxHitPoints: number;

  if (level === 1) {
    // Level 1: Full hit die + CON modifier
    let hitDieValue: number;
    if (data.hpCalculationMethod === 'rolled' && data.rolledHP) {
      hitDieValue = data.rolledHP;
    } else {

      // Default to max for level 1
      hitDieValue = classData.hit_die;
    }

    maxHitPoints = hitDieValue + finalAbilities.CON.modifier;
  } else if (data.highLevelSetup) {

    // Use high-level setup HP if available
    maxHitPoints = data.highLevelSetup.totalHP;
  } else {

    // Fallback: Multi-level calculation using average HP
    const conModifier = finalAbilities.CON.modifier;
    const hitDie = classData.hit_die;

    // Level 1: Full hit die + CON
    let totalHP = hitDie + conModifier;

    // Levels 2+: Average HP per level + CON
    const avgHPPerLevel = Math.floor(hitDie / 2) + 1 + conModifier;
    totalHP += avgHPPerLevel * (level - 1);

    maxHitPoints = totalHP;
  }


  // Species and feat HP bonuses (Dwarven Toughness +1, Tough +2 per level)
  maxHitPoints += speciesGrants.hpPerLevel * level;

  // 3. Calculate Skills (from selected skills + background skills + expertise)
  const backgroundSkills = grantedBackgroundSkills(backgroundData, data)
    .map(toSkillName)
    .filter((skill): skill is SkillName => skill !== undefined);
  const allProficientSkills = [
    ...data.selectedSkills,
    ...backgroundSkills,
    ...speciesGrants.skills,
  ];

  const finalSkills: Character['skills'] = {} as Character['skills'];
  ALL_SKILLS.forEach((skillName) => {
    const ability = SKILL_TO_ABILITY[skillName];
    const modifier = finalAbilities[ability].modifier;
    const isProficient = allProficientSkills.includes(skillName);
    const hasExpertise = data.expertiseSkills?.includes(skillName) || speciesGrants.expertise.includes(skillName);

    // Expertise applies 2x proficiency bonus
    let skillBonus = 0;
    if (isProficient) {
      skillBonus = hasExpertise ? (pb * 2) : pb;
    }


    finalSkills[skillName] = {
      proficient: isProficient,
      value: modifier + skillBonus,
    };

  });


  // 3.5. Calculate Inventory from Equipment Choices
  const inventory: Character['inventory'] = [];

  // Add items from class equipment choices
  if (data.equipmentChoices) {
    data.equipmentChoices.forEach(choice => {
      if (choice.selected !== null && choice.selected !== undefined) {
        const selectedBundle = choice.options[choice.selected];
        selectedBundle.forEach(item => {
          // Use the equipment matching utility to find and add items
          const results = addItemToInventoryByName(item.name, item.quantity);

          // Process each result (can be multiple if pack expanded)
          results.forEach(result => {
            // Check if item already exists in inventory
            const existingItem = inventory.find(inv => inv.equipmentSlug === result.equipmentSlug);
            if (existingItem) {
              existingItem.quantity += result.quantity;
            } else {

              inventory.push({
                equipmentSlug: result.equipmentSlug,
                quantity: result.quantity,
                equipped: false, // Will be equipped manually by player
              });

            }

          });

        });

      }

    });

  }

  // Add background equipment. A trailing "15 gp" is pocket money, not an item.
  let backgroundGold = 0;
  if (backgroundData?.equipment) {
    const backgroundEquipment = Array.isArray(backgroundData.equipment)
      ? backgroundData.equipment
      : [backgroundData.equipment];
    
    backgroundEquipment.forEach(itemName => {
      const coins = /^(\d+) gp$/.exec(itemName.trim());
      if (coins) {
        backgroundGold += Number(coins[1]);
        return;
      }
      // Try to match the background equipment name to equipment database
      const results = addItemToInventoryByName(itemName, 1);
      
      // Process each result (can be multiple if pack expanded)
      results.forEach(result => {
          // Check if item already exists in inventory
          const existingItem = inventory.find(inv => inv.equipmentSlug === result.equipmentSlug);
          if (existingItem) {
            existingItem.quantity += result.quantity;
          } else {
            inventory.push({
              equipmentSlug: result.equipmentSlug,
              quantity: result.quantity,
              equipped: false,
            });
          }      });
    });
  }

  // Add trinket to inventory
  if (data.selectedTrinket) {
    inventory.push({
      equipmentSlug: `trinket-${data.selectedTrinket.roll}`,
      quantity: 1,
      equipped: false,
      trinket: data.selectedTrinket,
    });
  }


  // Add custom starting inventory from equipment browser
  if (data.startingInventory) {
    data.startingInventory.forEach(item => {
      // Check if item already exists in inventory
      const existingItem = inventory.find(inv => inv.equipmentSlug === item.equipmentSlug);
      if (existingItem) {
        existingItem.quantity += item.quantity;
      } else {

        inventory.push({
          equipmentSlug: item.equipmentSlug,
          quantity: item.quantity,
          equipped: item.equipped || false,
        });

      }

    });

  }


  // 4. Calculate Spellcasting Stats (if applicable)
  let spellcastingData: Character['spellcasting'] = undefined;
  if (classData.spellcasting) {
    spellcastingData = migrateSpellSelectionToCharacter(
      data.spellSelection,
      classData,
      Object.fromEntries(
        Object.entries(finalAbilities).map(([key, value]) => [key, value.score])
      ) as Record<string, number>,
      level
    );
    const granted = (getSubclass(data.subclassSlug)?.grantedSpells ?? [])
      .filter(grant => grant.level <= level)
      .flatMap(grant => grant.slugs);
    if (spellcastingData && granted.length > 0) {
      const merge = (current?: string[]) => [...new Set([...(current ?? []), ...granted])];
      if (spellcastingData.spellbook) {
        spellcastingData = {
          ...spellcastingData,
          spellbook: merge(spellcastingData.spellbook),
          preparedSpells: merge(spellcastingData.preparedSpells),
        };
      } else if (spellcastingData.preparedSpells) {
        spellcastingData = { ...spellcastingData, preparedSpells: merge(spellcastingData.preparedSpells) };
      } else if (spellcastingData.spellsKnown) {
        spellcastingData = { ...spellcastingData, spellsKnown: merge(spellcastingData.spellsKnown) };
      }
    }
  }


  // 5. Apply lineage effects (traits/spells/speed overrides)
  const mergedTraits = [
    ...getEffectiveSpeciesTraits(speciesData, data.selectedSpeciesVariant),
    ...(lineageData?.traits || []),
  ];

  // Future: apply lineage spells if we surface them in spell lists

  // 6. Calculate Armor Class (unarmored, or natural armor from a species trait when it is higher)
  const abilityModifiers = Object.fromEntries(
    (Object.keys(finalAbilities) as AbilityName[]).map(a => [a, finalAbilities[a].modifier]),
  ) as Record<AbilityName, number>;
  const naturalAC = calculateNaturalArmorClass(speciesGrants.naturalArmor, abilityModifiers);
  const armorClass = Math.max(BASE_ARMOR_CLASS + finalAbilities.DEX.modifier, naturalAC ?? 0) + speciesGrants.acBonus;

  // 7. Calculate Initiative
  const initiative = finalAbilities.DEX.modifier + (speciesGrants.initiativeProficiency ? pb : 0) + speciesGrants.initiativeBonus;

  // 8. Load Features and Traits
  const featuresAndTraits: Character['featuresAndTraits'] = {
    personality: data.personality || '',
    ideals: data.ideals || '',
    bonds: data.bonds || '',
    flaws: data.flaws || '',
    classFeatures: classData.class_features || [],
    speciesTraits: mergedTraits,
    backgroundFeatures: backgroundData?.feature ? [{
      name: backgroundData.feature,
      description: backgroundData.feature_description || '',
    }] : [],
    musicalInstrumentProficiencies: data.selectedMusicalInstruments || [],
  };


  // 9. Calculate SRD Features (from the original implementation)
  const srdFeatures = {
    classFeatures: [],
    subclassFeatures: subclassFeaturesUpToLevel(classData.slug, data.subclassSlug, level),
  };


  const optionalFeatureSlugs = [...new Set(
    [data.fightingStyle, data.selectedFightingStyle, ...(data.eldritchInvocations ?? []), ...(data.optionalFeatures ?? [])]
      .filter((slug): slug is string => !!slug)
      .map(slug => resolveOptionalFeatureSlug(slug, data.edition))
      .filter(slug => getOptionalFeature(slug, data.edition)),
  )];

  // 10. Create final character object
  const character: Character = {
    id: '', // Will be set when saving
    name: data.name,
    species: speciesData.name,
    selectedSpeciesVariant: data.selectedSpeciesVariant,
    class: classData.name,
    classSlug: classData.slug,
    level,
    alignment: data.alignment,
    background: data.background,
    edition: data.edition,
    inspiration: false,
    proficiencyBonus: pb,
    armorClass,
    hitPoints: maxHitPoints, // Current hit points
    maxHitPoints,
    hitDice: {
      current: level,
      max: level,
      dieType: getHitDieForClass(data.classSlug),
    },

    speed: effectiveSpeed,
    movement: speciesMovement(speciesGrants.movement, speciesData),
    senses: Object.keys(speciesGrants.senses).length ? speciesGrants.senses : undefined,
    damageResistances: speciesGrants.resistances.length ? speciesGrants.resistances : undefined,
    conditionImmunities: speciesGrants.conditionImmunities.length ? speciesGrants.conditionImmunities : undefined,
    damageImmunities: speciesGrants.damageImmunities.length ? speciesGrants.damageImmunities : undefined,
    savingThrowProficiencies: speciesGrants.savingThrows.length ? speciesGrants.savingThrows : undefined,
    naturalArmor: speciesGrants.naturalArmor,
    // Species only: level-up adds feat HP (Tough) from the feats themselves
    hpPerLevelBonus: speciesOnlyGrants.hpPerLevel || undefined,
    acBonus: speciesGrants.acBonus || undefined,
    speciesChoices: data.speciesChoices && Object.keys(data.speciesChoices).length ? data.speciesChoices : undefined,
    initiative,
    abilities: finalAbilities,
    skills: finalSkills,
    languages: knownLanguagesFor(data, speciesData.slug, classData.slug, backgroundData?.languages, speciesGrants.languages),
    featuresAndTraits,
    proficiencies: {
      armor: Array.from(new Set([...(classData.proficiencies?.armor || []), ...speciesGrants.armor])),
      weapons: Array.from(new Set([...(classData.proficiencies?.weapons || []), ...speciesGrants.weapons])),
      tools: Array.from(new Set([
        ...(classData.proficiencies?.tools || []),
        ...(backgroundData ? grantedBackgroundTools(backgroundData, data) : []),
        ...speciesGrants.tools,
      ])),
    },
     selectedFeats: allFeats,
     spellcasting: spellcastingData,
     srdFeatures,
     subclass: data.subclassSlug,
     experiencePoints: 0,
     feats: allFeats, // Legacy support
     selectedFightingStyle: data.selectedFightingStyle,
     inventory,
     trinket: data.selectedTrinket,
     expertiseSkills: data.expertiseSkills,
     weaponMastery: data.weaponMastery,
     divineOrder: data.divineOrder,
     primalOrder: data.primalOrder,
     fightingStyle: data.fightingStyle,
     eldritchInvocations: data.eldritchInvocations,
     optionalFeatures: optionalFeatureSlugs.length ? optionalFeatureSlugs : undefined,
     featChoices: data.featChoices,
     originFeat: backgroundFeatSlug(backgroundData, data),
    currency: {
      cp: 0,
      sp: 0,
      gp: backgroundGold,
      pp: 0,
    },

    equippedArmor: undefined,
    equippedWeapons: [],
    temporaryHitPoints: 0,
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };


  if (optionalFeatureSlugs.length) applyOptionalFeatureGrants(character, optionalFeatureSlugs);

  return character;
};
