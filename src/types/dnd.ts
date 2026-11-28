import gameConstantsData from '../data/gameConstants.json';
import type { Level1Feature } from './widgets';
import type { ResourceTracker, LevelUpRecord } from '../data/classProgression';
import type { InitiativeEntry, PlayerEntry } from './encounterCombat';

export const ABILITY_SCORES = gameConstantsData.ABILITY_SCORES as readonly ('STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA')[];
export type Ability = typeof ABILITY_SCORES[number];

export interface Alignment {
  name: string;
  description: string;
}

/** A pick a background asks for: `from` omitted means any skill, tool or language. */
export interface BackgroundChoice {
  count: number;
  from?: string[];
}

/** One alternative set of tools (the Eberron House Agent picks a dragonmarked house). */
export interface BackgroundToolPackage {
  label: string;
  tools: string[];
  choices?: BackgroundChoice[];
}

export interface Background {
  slug: string; // Unique identifier
  name: string;
  edition: Edition; // '2014' | '2024'
  source?: string; // Book abbreviation the record was generated from
  sources?: string[]; // Other printings of the same background
  description: string;
  details?: string; // Additional detailed description
  detailedDescription?: string; // Even more detailed
  skill_proficiencies: string[];
  /** Choose this many skills. `from` omitted means any skill. */
  skillChoices?: BackgroundChoice;
  languages?: string[];
  /** Extra languages chosen from a list (on top of "One of your choice" / "Two of your choice"). */
  languageChoices?: BackgroundChoice;
  equipment: string[];
  equipmentOptions?: EquipmentOption[];
  
  // 2014 Legacy Fields
  feature?: string;
  feature_description?: string;
  
  // 2024 Fields
  abilityScores?: {
    choose: number;
    from: AbilityName[];
    fixed?: Partial<Record<AbilityName, number>>;
  };
  originFeat?: string;
  /** The background offers one of these feats (a named feat, or a feat or any Dark Gift). */
  originFeatOptions?: string[];
  tool_proficiencies?: string[];
  /** Tool picks granted alongside the fixed tools. */
  toolChoices?: BackgroundChoice[];
  /** Pick one package; its tools replace tool_proficiencies. */
  toolPackages?: BackgroundToolPackage[];
  /** Shown but not enforced, such as a campaign requirement. */
  note?: string;
  /** Spells this background adds to the class spell list (Ravnica guilds, Strixhaven colleges). */
  expandedSpells?: string[];

  personality_traits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  roleplaying_suggestions?: string;
}

export interface EquipmentOption {
  label: string;
  items?: string[];
  gold?: number;
}


export interface EquipmentPackage {
  name: string;
  level?: number;
  startingGold?: number; // in gp
  items: Array<{
    name: string;
    quantity: number;
    slug?: string;
    equipped?: boolean;
  }>;
  recommendedItems?: string[]; // Text descriptions for DM to add
  recommendedFor?: string[]; // Array of class slugs this pack is recommended for
  description?: string; // Optional description of the pack
}

export interface FightingStyle {
  slug: string;
  name: string;
  description: string;
  prerequisite: string;
}

export type SpellSlotsByClass = Record<string, number[][]>;
export type CantripsKnownByClass = Record<string, number[]>;

// --- D&D 5e Character Interface (Must be adhered to) ---
export interface AbilityScore { score: number; modifier: number; }
export interface Skill {
  value: number;
  proficient: boolean;
  expertise?: boolean; // True if skill has expertise (double proficiency bonus)
}

export type Edition = '2014' | '2024';

/** One class a character has levels in. */
export interface CharacterClassEntry {
  class: string;          // Display name, e.g. "Fighter"
  classSlug: string;      // e.g. "fighter"
  level: number;          // Levels in this class
  subclass?: string | null;
  hitDie: number;         // 6, 8, 10 or 12
}

export interface Character {
  id: string;
  name: string;
  species: string;
  /** @deprecated Legacy field retained for migrations. */
  race?: string;
  selectedSpeciesVariant?: string; // For human variants
  /** Starting class. Multiclass characters list every class in `classes`. */
  class: string;
  classSlug?: string;
  /** Total character level (sum of all class levels). */
  level: number;
  /**
   * Every class the character has levels in, starting class first. Absent on single-class
   * characters; read it through getClassEntries().
   */
  classes?: CharacterClassEntry[];
  alignment: string;
  background: string;
  edition: Edition; // D&D edition (2014 or 2024 rules)

  // 2024 Level 1 Feature Choices (class-specific)
  divineOrder?: 'protector' | 'thaumaturge'; // 2024 Cleric Level 1 choice
  primalOrder?: 'magician' | 'warden'; // 2024 Druid Level 1 choice
  pactBoon?: 'blade' | 'chain' | 'tome'; // 2024 Warlock Level 1 choice (moved from Level 3)
  expertiseSkills?: string[]; // Rogue, Ranger, Bard: Skills/tools with double proficiency
  weaponMastery?: string[]; // Rogue, Fighter, Barbarian, Paladin: Mastered weapon slugs
  fightingStyle?: string; // Fighter, Paladin, Ranger: Fighting Style slug
  eldritchInvocations?: string[]; // Warlock: Eldritch Invocation slugs
  /** Invocations, maneuvers, metamagic, infusions, and the other optional class features. */
  optionalFeatures?: string[];
  secondWindUses?: number; // Fighter: Second Wind uses remaining

  // Background data (2024)
  backgroundFeat?: string; // Origin Feat from background (Legacy/Internal use)
  originFeat?: string; // 2024 Origin Feat (can be from Background or Human)

  inspiration: boolean;
  heroicInspiration?: boolean; // 2024 Mechanics (resets on Long Rest)
  proficiencyBonus: number;
  armorClass: number;
  hitPoints: number;
  maxHitPoints: number;
  hitDice: {
    current: number;
    max: number;
    dieType: number; // d6, d8, d10, d12, etc.
    /** Multiclass only: dice by size, keyed "d6", "d8", ... Totals stay in current/max. */
    pools?: Record<string, { current: number; max: number }>;
  };
  speed: number;
  /** Extra movement modes from species traits, in feet (e.g. { fly: 30, swim: 30 }). Walking speed is `speed`. */
  movement?: Partial<Record<MovementKind, number>>;
  /** Special senses in feet, from species traits (darkvision, ...). */
  senses?: SensesGrant;
  /** Damage types the character resists (species traits; more sources later). */
  damageResistances?: string[];
  /** Conditions the character is immune to. */
  conditionImmunities?: string[];
  /** Damage types the character is immune to (feats such as Boon of Poison Mastery). */
  damageImmunities?: string[];
  /** Saving throw proficiencies beyond the class's (e.g. the Resilient feat). */
  savingThrowProficiencies?: AbilityName[];
  /** Natural armor from a species trait; used by AC recalculation. */
  naturalArmor?: NaturalArmorGrant;
  /** Extra max HP gained per character level from species traits (e.g. Dwarven Toughness). */
  hpPerLevelBonus?: number;
  /** Flat AC bonus from species traits (e.g. Warforged Integrated Protection). */
  acBonus?: number;
  /** Selections made for species choices (draconic ancestry, fiendish legacy, ...), by choice id. */
  speciesChoices?: Record<string, string>;
  initiative: number;
  abilities: {
    STR: AbilityScore; DEX: AbilityScore; CON: AbilityScore;
    INT: AbilityScore; WIS: AbilityScore; CHA: AbilityScore;
  };
  skills: {
    Acrobatics: Skill; AnimalHandling: Skill; Arcana: Skill; Athletics: Skill; Deception: Skill; History: Skill; Insight: Skill; Intimidation: Skill; Investigation: Skill; Medicine: Skill; Nature: Skill; Perception: Skill; Performance: Skill; Persuasion: Skill; Religion: Skill; SleightOfHand: Skill; Stealth: Skill; Survival: Skill;
  };
   languages?: string[]; // Known languages
   proficiencies?: {
     armor?: string[];
     weapons?: string[];
     tools?: string[];
   };
    featuresAndTraits: {
     personality: string;
     ideals: string;
     bonds: string;
     flaws: string;
      classFeatures: string[];
      speciesTraits: string[];
      backgroundFeatures: Array<{name: string, description: string}>; // Background features and descriptions
      musicalInstrumentProficiencies: string[]; // Musical instruments proficient in (for bards)
   };

  // Sprint 2: Spellcasting data (enhanced for differentiated types)
  spellcasting?: {
    ability: 'INT' | 'WIS' | 'CHA';
    spellSaveDC: number;
    spellAttackBonus: number;

    // Cantrips (always known, chosen at character creation)
    cantripsKnown: string[];

    // Spell knowledge based on casting type
    spellsKnown?: string[];        // Known casters: fixed list (Bard, Sorcerer, etc.)
    spellbook?: string[];          // Wizards: permanent spellbook
    preparedSpells?: string[];     // Prepared casters: daily selection (Cleric, Druid, etc.)

    // Spell slots and usage
    spellSlots: number[];          // Maximum slots by level [cantrips, 1st, 2nd, ...]
    usedSpellSlots: number[];      // Currently used slots by level

    // Feat-granted spells (special casting rules)
    featGrantedSpells?: Array<{
      spellSlug: string;
      spellcastingAbility: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
      usesPerDay?: number;
      rechargeType: 'at-will' | 'long-rest' | 'short-rest';
      featSlug: string;
    }>;

    // Metadata and progression
    spellcastingType: 'known' | 'prepared' | 'wizard';
    cantripChoicesByLevel: Record<number, string>;
    spellChoicesByLevel?: Record<number, string>; // For tracking spell learning

    /** Multiclass casters: each spellcasting class keeps its own ability and casting style. */
    classCasting?: Array<{
      classSlug: string;
      className: string;
      ability: 'INT' | 'WIS' | 'CHA';
      spellcastingType: 'known' | 'prepared' | 'wizard';
    }>;
  };

  // Sprint 3: Character advancement
  subclass?: string | null; // Subclass slug (e.g., "berserker")
  experiencePoints?: number; // Current XP
  feats?: string[]; // Feat slugs (deprecated - use selectedFeats)
  selectedFightingStyle?: string | null; // Fighting Style name (Fighter/Paladin/Ranger)

  // Sprint 5: Features, Subclasses, and Feats
  srdFeatures?: {
    classFeatures: Array<{ name: string; slug: string; level: number; source: 'class' }>;
    subclassFeatures: Array<{ name: string; slug: string; level: number; source: 'subclass' }>;

  };
  selectedFeats?: string[]; // Feat slugs selected during character creation
  featChoices?: Record<string, FeatChoiceMap>; // Additional choices for feats (e.g., Elemental Adept damage type)

  // Sprint 4: Equipment and inventory
  inventory?: EquippedItem[]; // All carried items
  currency?: {
    cp: number;
    sp: number;
    ep?: number; // Electrum pieces (optional, less common)
    gp: number;
    pp: number;
  };
  equippedArmor?: string; // Equipment slug of equipped armor
  equippedWeapons?: string[]; // Equipment slugs of equipped weapons (primary, offhand, etc.)
  trinket?: TrinketData; // Optional trinket rolled during character creation

  // Combat state
  temporaryHitPoints?: number;
  actionSurgeUsed?: number; // Number of Action Surge uses this rest period
  deathSaves?: {
    successes: number;
    failures: number;
  };
  conditions?: string[];

  // Level progression and resource tracking
  resources?: ResourceTracker[]; // Trackable class resources (Second Wind, Action Surge, etc.)
  levelHistory?: LevelUpRecord[]; // Record of all level-ups and choices made

  // Feat effects and bonuses
  featEffects?: {
    // Resource-based feat effects
    luckPoints?: {
      current: number;
      max: number;
    };

    // Initiative and awareness bonuses
    initiativeBonus?: number; // From Alert feat
    cantBeSurprised?: boolean; // From Alert feat
    noAdvantageFromUnseen?: boolean; // From Alert feat

    // Combat bonuses
    greatWeaponMaster?: boolean; // Enables GWM mechanics
    polearmMaster?: boolean; // Enables polearm opportunity attacks
    crossbowExpert?: boolean; // Enables crossbow expert mechanics
    gunner?: boolean; // Enables gunner mechanics
    crusher?: boolean; // Force damage on crits
    piercer?: boolean; // Piercing damage on crits
    slasher?: boolean; // Slashing damage on crits

    // Advanced combat state
    gwmBonusAttackAvailable?: boolean; // GWM bonus attack available this turn

    // Damage type resistances ignored
    ignoredResistances?: string[]; // From Elemental Adept

    // Dragon breath weapons
    dragonBreathWeapon?: {
      damageType: string;
      damageDice: string;
      saveType: string;
      range: string;
    };

    // Spell-related bonuses
    spellSniper?: boolean; // Double range, ignore half cover
    warCaster?: boolean; // Concentration advantage, opportunity casting

    // Skill and utility bonuses
    mimicryAdvantage?: boolean; // From Actor feat
    standUpFree?: boolean; // From Athlete feat
    climbSpeedBonus?: number; // From Athlete feat
    swimSpeedBonus?: number; // From Athlete feat
    jumpDistanceBonus?: number; // From Athlete feat

    // Special abilities
    inspiringLeader?: boolean; // Can rally allies for temp HP
    linguist?: boolean; // Can create ciphers and forgeries
    bountifulLuck?: boolean; // Can let allies reroll 1s (Halfling feat)
    secondChance?: boolean; // Can force creature to reroll attack

    // Movement & utility
    mobile?: boolean; // +10 speed, difficult terrain benefits
    dualWielder?: boolean; // AC bonus when dual wielding
  };

  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

// --- Intermediate Wizard Data Structure ---
export type AbilityName = keyof Character['abilities'];
export type SkillName = keyof Character['skills'];

// Equipment and Skill interfaces for character creation
export interface EquipmentItem {
  name: string;
  type: 'weapon' | 'armor' | 'gear' | 'tool';
  quantity: number;
  weight?: number;
}

export interface EquipmentChoice {
  choiceId: string;
  description: string;
  options: EquipmentItem[][];
  selected: number | null; // Index of selected option
}

// Sprint 2: Spell system interfaces
// Spellcasting type classification
export type SpellcastingType = 'known' | 'prepared' | 'wizard';

export interface SpellSelectionData {
  // All spellcasters - cantrips chosen at character creation
  selectedCantrips: string[]; // Spell slugs

  // Known Casters (Bard, Sorcerer, Warlock, Ranger)
  knownSpells?: string[]; // Fixed spells known at level 1

  // Prepared Casters (Cleric, Druid, Paladin, Artificer)
  preparedSpells?: string[]; // Initially prepared spells from full class list

  // Wizard Special Case
  spellbook?: string[]; // 6 spells permanently in spellbook
  dailyPrepared?: string[]; // Spells prepared for the day from spellbook

  // Legacy support (deprecated - use type-specific fields above)
  selectedSpells?: string[]; // For backward compatibility
}

// Sprint 3: Feat system (interface moved to Sprint 5 section below)

// Sprint 4: Equipment system
export interface Equipment {
  index: string; // SRD index (e.g., 'club', 'dagger')
  slug: string;
  name: string;
  year: number; // 2014 or 2024
   equipment_category: string; // 'Weapon', 'Armor', 'Adventuring Gear', 'Tools', etc.
   equipable?: boolean; // Can this item be equipped? (weapons, armor, clothing)
   cost: {
     quantity: number;
     unit: 'cp' | 'sp' | 'gp' | 'pp';
   };
   weight: number;
   description?: string;

  // Weapon-specific fields
  weapon_category?: 'Simple' | 'Martial';
  weapon_range?: 'Melee' | 'Ranged';
  damage?: {
    damage_dice: string;
    damage_type: string;
  };
  range?: {
    normal: number;
    long?: number;
  };
  properties?: Array<{
    index: string;
    name: string;
    url?: string;
  }>;
  two_handed_damage?: {
    damage_dice: string;
    damage_type: string;
  };
  mastery?: {
    index: string; // e.g., 'graze', 'cleave', 'topple'
    name: string;  // e.g., 'Graze', 'Cleave', 'Topple'
    url?: string;
  };

  // Armor-specific fields
  armor_category?: 'Light' | 'Medium' | 'Heavy' | 'Shield';
  armor_class?: {
    base: number;
    dex_bonus: boolean;
    max_bonus?: number; // For medium armor
  };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  don_time?: string; // 2024 only
  doff_time?: string; // 2024 only

  // Tool/Gear-specific fields
  tool_category?: string;
  gear_category?: string;
  contents?: Array<{ item_index: string; item_name: string; quantity: number }>; // For containers
  capacity?: string; // For containers
}

export interface EquippedItem {
  equipmentSlug: string; // Reference to Equipment slug. A magic item uses `magic:<catalog slug>` so it does not stack with mundane gear.
  quantity: number;
  equipped: boolean; // Is this item currently equipped?
  /** Catalog slug when this row is a magic item. */
  magicItemSlug?: string;
  attuned?: boolean; // Is this magic item attuned? (requires attunement slot)
  notes?: string; // Player notes about the item
  trinket?: TrinketData; // If this is a trinket item
}

/** A speed the item grants. `equalToWalk` copies the wearer's walking speed. */
export interface MagicItemMovement {
  equalToWalk?: Array<'walk' | 'fly' | 'climb' | 'swim' | 'burrow'>;
  set?: Partial<Record<'walk' | 'fly' | 'climb' | 'swim' | 'burrow', number>>;
  multiplyWalk?: number;
}

/**
 * A magic item from the sourcebooks. The catalog omits `description`;
 * `loadMagicItems` fills it from the item's source chunk.
 * Bonuses are only the structured ones (a +1 ring, a fixed ability score).
 */
export interface MagicItem {
  slug: string;
  name: string;
  edition: Edition;
  source: string;
  sources: string[];
  rarity: string;
  attunement: boolean;
  attunementRequirement?: string;
  itemType: string;
  typeCode?: string;
  wondrous?: boolean;
  staff?: boolean;
  cursed?: boolean;
  sentient?: boolean;
  tier?: 'minor' | 'major';
  weight?: number;
  /** Cost in copper pieces, when the book prints one. */
  valueCp?: number;
  charges?: number;
  recharge?: string;
  rechargeAmount?: string;
  /** The wielder is proficient with this item. */
  proficient?: boolean;
  bonusAc?: number;
  bonusWeapon?: number;
  bonusWeaponAttack?: number;
  bonusWeaponDamage?: number;
  bonusSpellAttack?: number;
  bonusSpellSaveDc?: number;
  bonusSavingThrow?: number;
  bonusAbilityCheck?: number;
  bonusProficiencyBonus?: number;
  bonusSavingThrowConcentration?: number;
  /** The ability becomes this score while the item applies. */
  abilityScoreSet?: Partial<Record<Ability, number>>;
  abilityBonus?: Partial<Record<Ability, number>>;
  resist?: string[];
  immune?: string[];
  conditionImmune?: string[];
  movement?: MagicItemMovement;
  focus?: string[];
  properties?: string[];
  /** Equipment index of the mundane item this magic item is based on. */
  baseItem?: string;
  /** Spell indexes the item can cast. Choices and unknown names stay in the description. */
  spells?: string[];
  description?: string;
}

// Sprint 5: Class Features, Subclasses, and Feats
export interface Feature {
  slug: string;
  name: string;
  class: string; // 'barbarian', 'fighter', etc.
  subclass?: string; // Optional for subclass-specific features
  level: number; // Level when feature is gained
  desc: string[]; // Array of description paragraphs
  featureSpecific?: {
    subfeatureOptions?: {
      choose: number;
      type: string;
      from: { options: Array<{ option_type?: string; item?: { index: string; name: string; url: string }; ability_score?: { index: string; name: string; url: string } }> };
    };
  };
}

export interface Subclass {
  slug: string;
  name: string;
  class: string; // Parent class slug
  desc: string[];
  subclassFlavor: string; // e.g., "Path of the Berserker"

  // Enhanced subclass data
  description?: string;
  detailedDescription?: string;
  keyFeatures?: string[];
  roleplayingTips?: string[];
  source?: string;
  edition?: Edition; // D&D edition (2014 or 2024 rules)
  /** Level this subclass is chosen (1 for a 2014 cleric, 2 for a 2014 wizard, usually 3). */
  subclassLevel?: number;
  /** Spells the subclass adds at a character level. Added on top of the spells the player picks. */
  grantedSpells?: { level: number; slugs: string[] }[];
  /** Spells added to the class list (dunamancy, or every option of a land-style choice). */
  expandedSpells?: string[];
  icon?: string;
  themeColor?: string;
}

export type FeatCategory =
  | 'origin' | 'fighting_style' | 'general' | 'epic_boon' | 'dragonmark' | 'dark_gift' | 'species';

/** One way to qualify for a feat: every listed condition must hold (lists inside are "any of"). */
export interface FeatPrerequisiteGroup {
  level?: number;
  /** With `level`: that many levels in this class (e.g. "Level 1 Sorcerer") */
  className?: string;
  abilities?: Array<Partial<Record<AbilityName, number>>>;
  species?: Array<{ name: string; subrace?: string }>;
  spellcasting?: boolean;
  features?: string[];
  /** Feat slugs */
  feats?: string[];
  proficiencies?: Array<{ armor?: string; weapon?: string; tool?: string }>;
  backgrounds?: string[];
  /** Has a feat of one of these categories */
  featCategories?: FeatCategory[];
  /** Has no other feat of these categories */
  exclusiveFeatCategories?: FeatCategory[];
  /** Setting restriction, shown but not enforced */
  campaign?: string[];
  /** Free-text condition, shown but not enforced */
  other?: string;
}

export interface Feat {
  slug: string;
  name: string;
  source: string; // 5etools source code ('PHB', 'XPHB', 'XGE', ...)
  edition: Edition;
  year: number; // 2014 or 2024
  category: FeatCategory;
  /** Display text of the prerequisites */
  prerequisite: string | null;
  prerequisites?: {
    /** Lowest level any alternative needs */
    level?: number;
    /** Alternatives (OR); the feat is available when any group is met */
    anyOf?: FeatPrerequisiteGroup[];
  };
  abilityScoreIncrease?: {
    choices: number;
    options: AbilityName[];
    amount: number;
    /** Score cap (default 20; Epic Boons 30) */
    max?: number;
  };
  repeatable?: boolean;
  /** Mechanical benefits the app applies (from structured source data) */
  grants?: TraitGrant;
  benefits: string[];
  /** Full text; most feats load it lazily (see useFeatDescription) */
  description?: string;
}

// Validation types for enhanced wizard feedback
export interface ValidationResult {
  isComplete: boolean;
  missingSelections: string[];
  warnings?: string[];
  nextRequiredAction?: string;
}

export interface StepValidation {
  canProceed: boolean;
  blockingIssues: string[];
  optionalItems?: string[];
  progressPercentage?: number;
}

export interface CharacterCreationData {
  name: string;
  level: number;
  edition: Edition; // D&D edition (2014 or 2024 rules)
  speciesSlug: string;
  selectedSpeciesVariant?: string; // e.g., "standard", "variant"
  selectedLineage?: string; // 2024 lineage choice when applicable
  /** Player's pick for the species' flexible ability score increases (2014 rules) */
  speciesAbilityChoices?: SpeciesAbilityChoiceSelection;
  /** Picks for species choice definitions (draconic ancestry, fiendish legacy, ...), by choice id */
  speciesChoices?: Record<string, string>;
  /** Picks for species proficiency choices, by slot id (see getSpeciesPickSlots) */
  speciesPicks?: Record<string, string[]>;

  // Variant Human Choices
  variantAbilityBonuses?: Record<AbilityName, number>; // +1 to two abilities
  variantSkillProficiency?: SkillName; // One skill proficiency
  variantFeat?: string; // One feat choice

  classSlug: string;
  abilities: Record<AbilityName, number>; // Raw scores only during creation
  abilityScoreMethod: 'standard-array' | 'standard-roll' | 'classic-roll' | '5d6-drop-2' | 'point-buy' | 'custom';
  background: string;
  alignment: string;

  // 2024 Universal Wizard Flow Fields
  backgroundSkills?: string[]; // Skills chosen for the background (Step 1)
  backgroundTools?: string[]; // Tools chosen for the background (Step 1)
  /** The dragonmarked house (or other tool package) chosen for the background. */
  backgroundToolPackage?: string;
  speciesFeat?: string; // 2024: Feat chosen from species options
  humanVersatileFeat?: string; // 2024: Extra Origin Feat for humans
  backgroundFeat?: string; // Origin Feat from background (Step 1)
  backgroundAbilityChoices?: {
    method: '2/1' | '1/1/1';
    bonuses: Partial<Record<AbilityName, number>>;
  };
  humanOriginFeat?: string; // 2024 Human bonus Origin Feat

  // Sprint 1 additions
  selectedSkills: SkillName[]; // Skills chosen from class options (Step 2)
  selectedMusicalInstruments: string[]; // Musical instruments chosen from class options (Step 2)
  overflowSkills?: string[]; // Skills chosen via "Any Skill" duplicate rule (Step 2)
   equipmentChoices: EquipmentChoice[]; // Equipment selection choices
   equipmentChoice?: 'background' | 'gold' | null; // 2024: Choose background equipment or gold
   equipmentGold?: number; // Gold amount for gold choice
   hpCalculationMethod: 'max' | 'rolled';
  rolledHP?: number; // If rolled, store the result

  // 2024 Level 1 Feature Choices (Step 3 - Variable by Class)
  divineOrder?: 'protector' | 'thaumaturge'; // 2024 Cleric
  primalOrder?: 'magician' | 'warden'; // 2024 Druid
  pactBoon?: 'blade' | 'chain' | 'tome'; // 2024 Warlock
  expertiseSkills?: string[]; // Rogue, Ranger, Bard: 2 skills/tools
  weaponMastery?: string[]; // Rogue, Fighter, Barbarian, Paladin: 2-3 weapons
   fightingStyle?: string; // Fighter, Paladin, Ranger
   eldritchInvocations?: string[]; // Warlock: Eldritch Invocation slugs
   secondWindUses?: number; // 2024 Fighter: Second Wind uses remaining

   // Sprint 2: Spell selection
  spellSelection: SpellSelectionData;

  // Sprint 4: Custom equipment additions
  startingInventory?: EquippedItem[];

  // Sprint 5: Subclass, Fighting Style, and Feats
  subclassSlug?: string | null;
  selectedFightingStyle?: string | null;
  /** Invocations, maneuvers, metamagic, infusions, and the other optional class features. */
  optionalFeatures?: string[];
  selectedFeats?: string[]; // Array of feat slugs
  featChoices?: Record<string, FeatChoiceMap>; // Additional choices for feats (e.g., Elemental Adept damage type)

  // Language selection
  knownLanguages?: string[]; // Array of selected language names

  // Trinket selection
  selectedTrinket?: TrinketData;

  // Custom text for traits
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;

  // High-Level Character Creation (Level 2+)
  highLevelSetup?: {
    hpRolls?: number[]; // HP rolls for levels 2+ (if not using average)
    totalHP: number; // Calculated total HP
    useAverage: boolean; // Whether to use average HP or rolls
  };
  cumulativeASI?: Array<{
    level: number; // Level where ASI was gained
    type: 'asi' | 'feat'; // Whether ASI or Feat was chosen
    asiAllocations?: Record<AbilityName, number>; // Ability score increases
    featSlug?: string; // Feat slug if feat was chosen
  }>;
}

/**
 * Player-chosen (flexible) ability score increases granted by a species or variant.
 * Fixed increases stay in `ability_bonuses`; this describes the part the player picks.
 *
 * Examples:
 *  - MPMM "Customizing Your Origin":  { patterns: [[2, 1], [1, 1, 1]] }
 *  - 2014 Half-Elf (CHA +2 fixed):    { patterns: [[1, 1]], from: [STR, DEX, CON, INT, WIS] }
 *  - Changeling / Warforged style:    { patterns: [[1]], from: [...] }
 *  - Custom Lineage:                  { patterns: [[2]] }
 *
 * Each ability can be chosen at most once, and never one that already has a fixed bonus.
 */
export interface SpeciesAbilityChoice {
  /** Allowed distributions of increments; each inner array is one valid way to spend the choice. */
  patterns: number[][];
  /** Abilities that may receive a chosen increase. Defaults to all six. */
  from?: AbilityName[];
}

/** The player's pick for a SpeciesAbilityChoice. */
export interface SpeciesAbilityChoiceSelection {
  /** Which pattern was picked, e.g. [2, 1] */
  pattern: number[];
  /** Abilities that received an increase and by how much */
  bonuses: Partial<Record<AbilityName, number>>;
}

export type MovementKind = 'fly' | 'swim' | 'climb' | 'burrow';

export interface SensesGrant {
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
}

/** Natural armor: AC = base + the listed ability modifiers (when no armor is worn, or armor gives less). */
export interface NaturalArmorGrant {
  base: number;
  abilities?: AbilityName[];
  /** Tortle-style shells: armor cannot be worn, only a shield applies. */
  noArmor?: boolean;
}

/**
 * Mechanics a species trait (or a species choice option) gives the character.
 * Data lives in `src/data/speciesTraitGrants.json`, keyed by trait name; a
 * `"<Name> [2024]"` key overrides the plain key for 2024 characters (the same
 * convention as featureDescriptions.json).
 */
export interface TraitGrant {
  /** Movement modes in feet, or 'walk' for "equal to your walking speed" */
  movement?: Partial<Record<MovementKind, number | 'walk'>>;
  senses?: SensesGrant;
  resistances?: string[];
  conditionImmunities?: string[];
  skills?: SkillName[];
  /** Choose `count` skills (from `from`, default any) */
  skillChoices?: { count: number; from?: SkillName[] };
  tools?: string[];
  toolChoices?: { count: number; from: string[] };
  weapons?: string[];
  armor?: string[];
  /** Extra languages of the player's choice */
  languageChoices?: number;
  naturalArmor?: NaturalArmorGrant;
  hpPerLevel?: number;
  /** Flat bonus to Armor Class (Warforged Integrated Protection) */
  acBonus?: number;
  /** Proficiency bonus added to initiative (Harengon Hare-Trigger) */
  initiativeProficiency?: boolean;
  /** Flat initiative bonus (2014 Alert) */
  initiativeBonus?: number;
  /** Added to walking speed (Mobile, Speedy) */
  speedBonus?: number;
  /** Fixed languages */
  languages?: string[];
  resistanceChoices?: { count: number; from: string[] };
  damageImmunities?: string[];
  savingThrows?: AbilityName[];
  savingThrowChoices?: { count: number; from: AbilityName[] };
  expertise?: SkillName[];
  /** Character level at which the grant starts to apply (e.g. 2024 Draconic Flight at 5) */
  minLevel?: number;
  /** Short note shown with the grant, e.g. a restriction ("not in medium or heavy armor") */
  note?: string;
}

/** A pick the player makes for a species (e.g. Draconic Ancestry); each option can carry grants. */
export interface SpeciesChoiceDef {
  id: string;
  label: string;
  description?: string;
  options: Array<{ value: string; label: string; description?: string; grants?: TraitGrant }>;
}

export interface SpeciesVariant {
  slug: string;
  name: string;
  description: string;
  /** Walking speed override in feet (e.g. Air Genasi 35). Omit to use the species' speed. */
  speed?: number;
  /**
   * Fixed increases. When a variant is selected its bonuses/abilityChoice REPLACE the
   * base species' (they are not additive), so variants must restate anything inherited.
   */
  ability_bonuses: Partial<Record<AbilityName, number>>;
  /** Player-chosen increases (see SpeciesAbilityChoice) */
  abilityChoice?: SpeciesAbilityChoice;
  species_traits: string[];
  /** Base species traits this variant replaces (e.g. a Tiefling bloodline replaces Infernal Legacy). */
  replacesTraits?: string[];
  features: string[];
}

export interface Species {
  slug: string;
  name: string;
  edition: Edition; // '2014' | '2024'
  source: string;
  /** List of all sources this species draws from (for deduped records) */
  sources?: string[];
  speed: number;
  /** Swim speed in feet, when the book gives one that is not equal to the walk speed. */
  swimSpeed?: number;
  ability_bonuses?: Partial<Record<AbilityName, number>>; // Optional in 2024 (moved to Background)
  /** Player-chosen increases on top of `ability_bonuses` (2014 rules only) */
  abilityChoice?: SpeciesAbilityChoice;
   species_traits: string[];
   description: string;
   detailedDescription?: string;
   typicalRoles: string[];
  variants?: SpeciesVariant[];
  defaultVariant?: string;
  /**
   * 2014 species whose base form is also playable (e.g. a Half-Elf with or without a Dragonmark).
   * When true the generic variant picker offers a "base species" option and does not block Step 2.
   * When false/absent, one variant must be chosen.
   */
  variantOptional?: boolean;
  /** Extra languages of the player's choice the species grants ("Common plus one of your choice") */
  languageChoices?: number;
  /** Flag species as 2024 PHB core entry */
  core?: boolean;
  /** Flag species as non-core expanded option */
  expanded?: boolean;
  /** Tag species for category filtering (e.g., monstrous, planar, exotic) */
  tags?: string[];
  /**
   * DMG monstrous player option (Bullywug, Gnoll, and the rest).
   * Hidden from creation lists when SHOW_MONSTROUS_PLAYER_SPECIES is off.
   */
  monstrousOption?: boolean;
  /** Mark legacy-only species (2014 or deprecated) */
  legacy?: boolean;
  /** Alternate historical slugs for migration */
  legacySlugs?: string[];
  /** Additional aliases used in saved data */
  slugAliases?: string[];

  // 2024 Fields
  creatureType?: 'Humanoid' | 'Construct' | 'Undead' | string;
  speciesFeat?: string | null; // Fixed feat for species like Half-Elf Prodigy
  speciesFeatOptions?: string[]; // Choice of feats for species like Elf, Dwarf, etc.
  traits?: string[]; // Core species traits for 2024
  lineages?: Record<string, SpeciesLineage>; // Lineage choices (Elf, Gnome)
  fiendishLegacies?: Record<string, FiendishLegacy>; // Tiefling options
  giantAncestry?: Record<string, string>; // Goliath options
  ancestries?: Record<string, string[] | string>; // Dragonborn options
  celestialRevelationOptions?: string[]; // Aasimar options

  // Mechanical bonuses (data-driven instead of hardcoded)
  baseSpeed?: number; // Base walking speed in feet (default 30)
  mechanicalBonuses?: {
    hpPerLevel?: number; // HP bonus per character level (e.g., Dwarf Toughness)
  };
}

export interface SpeciesLineage {
  traits?: string[];
  spells?: string[];
  baseSpeed?: number; // Override base speed (e.g., Wood Elf = 35 ft)
}

export interface FiendishLegacy {
  resistance: string;
  spells: string[];
}

export interface SpeciesCategory {
  name: string;
  icon: string;
  description: string;
  species: Species[];
}

// Backwards compatibility aliases (deprecated - use Species instead)
/** @deprecated Use Species instead */
export type Race = Species;
/** @deprecated Use SpeciesVariant instead */
export type RaceVariant = SpeciesVariant;
/** @deprecated Use SpeciesCategory instead */
export type RaceCategory = SpeciesCategory;

export interface StartingEquipmentPackage {
  level: number;
  description: string;
  startingGold: number; // in gp
  items: Array<{ slug: string; quantity: number; equipped?: boolean }>;
  recommendedItems: string[]; // Text descriptions for DM to add
}

export interface Class {
  slug: string;
  name: string;
  source: string;
  edition: Edition; // D&D edition (2014 or 2024 rules)
  hit_die: number;
  primary_stat: string;
  save_throws: string[];
  skill_proficiencies: string[]; // Available skill choices
  num_skill_choices?: number; // How many skills to choose (filled by helper if missing)
  musical_instrument_proficiencies: string[]; // Available musical instrument choices (for bards)
  num_instrument_choices?: number; // How many instruments to choose (filled by helper if missing)
  class_features: string[];
  description: string;
  keyRole: string;
  /** Core proficiencies pulled from SRD data */
  proficiencies?: {
    armor: string[];
    weapons: string[];
    tools: string[];
  };
  equipment_choices?: EquipmentChoice[]; // Starting equipment options (filled by helper if missing)

  // Sprint 2: Spellcasting configuration
  spellcasting?: {
    level: number; // Level at which spellcasting is gained (usually 1, but 2 for some classes)
    ability: 'INT' | 'WIS' | 'CHA'; // Spellcasting ability modifier
    type: SpellcastingType; // How spells are learned/prepared
    cantripsKnown: number; // Number of cantrips at level 1
    spellsKnownOrPrepared: number; // Number of spells known (sorcerer/bard) or can prepare (cleric/druid)
    spellSlots: number[]; // Spell slots by level [0, 2, 0, 0...] means 2 1st-level slots

    // Legacy support
    mode?: 'known' | 'prepared' | 'book'; // Deprecated - use type instead
  };

  // Sprint 3: Subclass support
  isSubclass?: boolean; // True if this is a subclass (archetype)
  parentClass?: string; // Parent class slug (e.g., 'wizard' for 'wizard-evocation')
  subclassLevel?: number; // Level at which this subclass is chosen (usually 3)
  subclassFeatures?: Record<number, string[]>; // Features gained at specific levels

  // Enhanced class data for rich selection experience
  category: 'Martial' | 'Arcane' | 'Divine' | 'Primal';
  abilityPriorities?: AbilityName[]; // Optimal ability score priority order for standard array distribution
  detailedDescription: string;
  roleplayingTips: string[];
  keyFeatures: string[];
  icon: string;
  themeColor: string;

  // 2024 Universal Widget System
  level_1_features?: Level1Feature[]; // Widget-driven Level 1 features
}

export interface ClassCategory {
  name: string;
  icon: string;
  description: string;
  classes: Class[];
}

// Trinket data structure
export interface TrinketData {
  roll: number;
  description: string;
  short_name: string;
  source: string;
  type: string;
  tags: string[];
  roleplay_prompt: string;
  dm_hook: string;
}

export type ClassWithDefaults = Omit<Class, 'num_skill_choices' | 'equipment_choices'> & {
  num_skill_choices: number;
  equipment_choices: EquipmentChoice[];
};

export interface AlignmentData {
  index: string;
  name: string;
  abbreviation: string;
  short_desc: string;  // SRD creature examples
  long_desc: string;   // Our detailed character descriptions
  category: string;
  examples: string[];
}

// Spell Learning Rules
export interface SpellLearningRules {
  type: 'prepared' | 'known' | 'spellbook' | 'none';
  spellsKnown?: number[];          // Spells known by level (known casters)
  spellsPrepared?: number[];        // Spells prepared by level (prepared casters)
  spellbookCapacity?: number[];     // Spellbook capacity by level (wizards)
  domainSpells?: string[];          // Cleric domain spells
  circleSpells?: string[];          // Druid circle spells
  magicalSecrets?: number[];        // Bard magical secrets by level
  invocationsKnown?: number[];      // Warlock invocations by level
}

export type FeatChoiceValue = string | number | boolean | string[];
export type FeatChoiceMap = Record<string, FeatChoiceValue>;

// ==================== Monster System ====================

export type MonsterSize = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';

export type MonsterType =
  | 'aberration'
  | 'beast'
  | 'celestial'
  | 'construct'
  | 'dragon'
  | 'elemental'
  | 'fey'
  | 'fiend'
  | 'giant'
  | 'humanoid'
  | 'monstrosity'
  | 'ooze'
  | 'plant'
  | 'undead';

export interface MonsterSpeed {
  walk?: string;
  fly?: string;
  swim?: string;
  burrow?: string;
  climb?: string;
  hover?: boolean;
}

export interface MonsterArmorClass {
  type: 'dex' | 'natural' | 'armor' | 'condition';
  value: number;
  armor?: Array<{ name: string; url?: string }>;
  spell?: { name: string; url?: string };
  desc?: string;
}

export interface MonsterProficiency {
  value: number;
  proficiency: {
    index: string;
    name: string;
    url: string;
  };
}

export interface MonsterDamageType {
  index: string;
  name: string;
  url: string;
}

export interface MonsterConditionImmunity {
  index: string;
  name: string;
  url: string;
}

export interface MonsterAbilityDC {
  dc_type: {
    index: string;
    name: string;
    url: string;
  };
  dc_value: number;
  success_type: string;
}

export interface MonsterDamage {
  damage_type: {
    index: string;
    name: string;
    url?: string;
  };
  damage_dice: string;
}

export interface MonsterUsage {
  type: string;
  times?: number;
  rest_types?: string[];
  dice?: string;
  min_value?: number;
}

export interface MonsterAction {
  name: string;
  desc: string;
  multiattack_type?: string;
  attack_bonus?: number;
  damage?: MonsterDamage[];
  dc?: MonsterAbilityDC;
  usage?: MonsterUsage;
  attacks?: Array<{
    name: string;
    dc?: MonsterAbilityDC;
    damage?: MonsterDamage[];
  }>;
  options?: {
    choose: number;
    from: {
      option_set_type: string;
      options: Array<{
        option_type: string;
        name: string;
        desc: string;
        attack_bonus?: number;
        damage?: MonsterDamage[];
        dc?: MonsterAbilityDC;
      }>;
    };
  };
}

export interface MonsterSpecialAbility {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage?: MonsterDamage[];
  dc?: MonsterAbilityDC;
  usage?: MonsterUsage;
  spellcasting?: {
    ability: {
      index: string;
      name: string;
      url: string;
    };
    dc?: number;
    modifier?: number;
    components_required?: string[];
    school?: string;
    slots?: Record<string, number>;
    spells?: Array<{
      name: string;
      level: number;
      url: string;
      usage?: MonsterUsage;
      notes?: string;
    }>;
  };
}

export interface MonsterLegendaryAction {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage?: MonsterDamage[];
  dc?: MonsterAbilityDC;
}

export interface MonsterReaction {
  name: string;
  desc: string;
  dc?: MonsterAbilityDC;
}

export interface Monster {
  index: string;
  name: string;
  size: MonsterSize;
  type: MonsterType;
  subtype?: string;
  alignment: string;
  armor_class: MonsterArmorClass[];
  hit_points: number;
  hit_dice: string;
  hit_points_roll: string;
  speed: MonsterSpeed;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies: MonsterProficiency[];
  damage_vulnerabilities: string[];
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: MonsterConditionImmunity[];
  senses: Record<string, string | number>;
  languages: string;
  challenge_rating: number;
  proficiency_bonus: number;
  xp: number;
  special_abilities?: MonsterSpecialAbility[];
  actions?: MonsterAction[];
  legendary_actions?: MonsterLegendaryAction[];
  reactions?: MonsterReaction[];
  url?: string;
  image?: string;
  desc?: string[];
  /** Source-book edition. The 2014 SRD file leaves this unset. */
  edition?: Edition;
  source?: string;
  sources?: string[];
}

export interface UserMonster extends Monster {
  id: string;
  isCustom: true;
  createdAt: number;
  updatedAt: number;
}

export interface Encounter {
  id: string;
  name: string;
  monsterIds: string[];
  createdAt: number;
  updatedAt: number;
  // NEW: Combat state (can be saved mid-session)
  combatState?: {
    round: number;
    currentTurn: number;
    initiativeOrder: InitiativeEntry[];
    players: PlayerEntry[];
    savedAt?: number; // Timestamp for mid-session saves
  };
}

// ==================== Level Up System ====================

/**
 * Choices made during the level-up wizard flow.
 * Tracks all player decisions during character leveling.
 */
export interface LevelUpChoices {
  /** Class gaining the level (existing or new). Defaults to the starting class. */
  classSlug?: string;

  /** Skills picked from a new class's multiclass proficiencies (Bard, Ranger, Rogue) */
  multiclassSkills?: SkillName[];

  /** Instrument picked when multiclassing into Bard */
  multiclassInstrument?: string;

  /** Hit points rolled (if not using average) */
  hpRoll?: number;

  /** Hit points gained (final amount added to character) */
  hpGained?: number;

  /** Fighting style chosen (Fighter, Paladin, Ranger) */
  fightingStyleChosen?: string;

  /** Ability score increases selected */
  asiChoices?: Array<{
    ability: AbilityName;
    increase: number;
  }>;

  /** Feat chosen (if taking feat instead of ASI) */
  featChosen?: string;

  /** Picks for the chosen feat (ability, skills, ...; see getFeatPickSlots) */
  featChoices?: FeatChoiceMap;

  /** Subclass chosen */
  subclassChosen?: string;

  /** Spells learned at this level */
  spellsLearned?: string[];

  /** Cantrips learned at this level */
  cantripsLearned?: string[];

  /** Expertise skills chosen (Bard, Rogue) */
  expertiseChosen?: string[];

  /** Weapon masteries chosen */
  weaponMasteriesChosen?: string[];

  /** Eldritch invocations chosen (Warlock) */
  eldritchInvocationsChosen?: string[];

  /** Optional class features chosen at this level (invocations, maneuvers, metamagic, ...). */
  optionalFeaturesChosen?: string[];
}

// ==================== NPC System ====================

export interface NPC {
  id: string;
  name: string;
  species: string; // Race
  occupation: string;
  personalityTraits: string[];
  abilityScores: Record<AbilityName, number>; // STR, DEX, CON, INT, WIS, CHA
  alignment: string;
  relationshipStatus: string;
  sexualOrientation: string;
  plotHook: string;
  notes: string; // Rich text as HTML
  createdAt: number;
  updatedAt: number;
}
