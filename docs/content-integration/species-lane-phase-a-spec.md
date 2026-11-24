# Species Lane — Phase A Spec

Status: **draft for review** (no app data has been changed for this lane yet).
Inputs: `sourcebooks/content_inventory.json`, `sourcebooks/gap_report.json`, the 5etools `races.json` mirror, and a read-through of every code path that consumes species data.

---

## 1. Goal and non-goals

**Goal.** Bring every playable species/lineage/variant from the 38 books in `/content-sourcebooks` into the app, with 2014 and 2024 content kept in separate, correctly tagged entries.

**Non-goals (this lane).**
- Engine features (flexible ASI UI, fly/swim/climb speeds, resistances, innate-spell wiring). See §4 — the engine cannot consume most of what species grant, so Phase B adds *data*, and the mechanics stay descriptive text unless you approve engine work separately.
- Feats (Dragonmark feats, species feats), backgrounds, subclasses. Cross-lane dependencies are listed in §8.

---

## 2. What a "species" is in this app (from reading the code)

| Concern | Where it lives | Notes |
|---|---|---|
| Species record | `src/data/species.json` → `species[]` | `slug, name, edition, source, sources[], speed (number), ability_bonuses (fixed map), species_traits (string[] of trait *names*), description, typicalRoles, variants[], core, expanded, tags[], legacy, legacySlugs[]`, 2024 extras (`creatureType, size, lineages, speciesFeat…`) |
| Trait text | `src/data/featureDescriptions.json`, keyed by **trait name only** | 99 entries; 14 traits currently used by species have no description. Not edition-aware. |
| Languages | `src/data/speciesLanguages.json` → `SPECIES_LANGUAGE_MAP[slug]` | fixed list only; no "choose one" representation |
| Rich copy | `src/data/enhancedSpeciesData.json`, keyed by **base slug** (`-2014`/`-2024` stripped) | optional; shared across editions, so it can leak 2024 fields into 2014 entries (e.g. `half-orc.speciesFeatOptions`) |
| Core vs Expanded tab | `speciesCategories.json` filters on `core` / `expanded` flags | `tags` are free-form (`core, legacy, expanded, exotic, monstrous, elemental, planar`) |
| Edition visibility | `Step2Species.tsx` `isSpeciesVisibleForEdition` | 2024 wizard also shows **non-core 2014** species — see Decision D1 |

**What the engine actually computes from species:** `speed` (one number), `ability_bonuses` (fixed numbers), languages (from the map), the trait *name list* (shown on the sheet), `getSpeciesProficiencies()` (substring matching on trait names — only light/medium/heavy armor, shields, battleaxe/handaxe/warhammer, smith/brewer), and one hard-coded innate-spell table (`TRAIT_SPELL_MAP`, only *Infernal Legacy*). `SavingThrows.tsx` special-cases the trait name *Gnomish Cunning*.

**What it does not compute:** fly/swim/climb speeds, darkvision, resistances/immunities, skill/tool proficiencies granted by species, flexible (+2/+1 anywhere) ability scores, language choices, innate spells other than Infernal Legacy. For almost every non-PHB species these are the defining traits, so they will be present as **text only**.

---

## 3. Findings about the existing species data

1. **Provenance is wrong or inconsistent.** `source` values include `PHB`, `PHB 2024`, `VGtM`, `MToF`, and `EE` (Genasi). Several entries claim VGtM but their canonical, current text is MPMM.
2. **Existing expanded entries are thin.** E.g. Genasi has only the *Fire* traits; Githyanki, Yuan-Ti Pureblood, Firbolg etc. are 2–4 trait names with hand-written descriptions, not book text.
3. **Dangling feat references.** `half-orc.species_feat_options = ["relentless-endurance"]` and `githyanki.species_feat_options = ["magic-resistance","poison-immunity"]` point at feats that do not exist (and `enhancedSpeciesData.half-orc.speciesFeatOptions` also listed `orcish-fury`, which exists as an XGtE general feat but is not a species-feat option). These are only read in the 2024 flow, so nothing visibly breaks today, but they are wrong data and should be removed in Phase B.
4. **No `speciesLanguages` gaps** for current species, but **14 trait names used by current species have no description** (e.g. *Celestial Revelation, Giant Ancestry, Elven Lineage, Resourceful, Skillful*).
5. **Cross-edition leakage exists by design.** The 2024 wizard lists non-core 2014 species as Expanded. This conflicts with the goal of keeping editions separate once ~48 more species are added (Decision D1).

---

## 4. Canonical-source rules

Used to decide which book a species' data is taken from. 5etools' own `reprintedAs` links are used where present; the rules below fill the gaps.

- **R1 — Edition by book.** 2024 rules: XPHB, XDMG, XMM, EFA, RHW, LFL, FRAIF, FRHOF, NF, ABH, AU, PL. Everything else is 2014 (this includes MPMM, which is a 2014-ruleset book).
- **R2 — Same species in several 2014 books:** MPMM supersedes VGM, MTF, DMG, ERLW, GGR copies, etc. Otherwise take the most recently published source. Setting-flavoured copies (Goblin/Hobgoblin in ERLW, Goblin in GGR, Orc in EGW, Triton in MOT) are folded into the MPMM entry, not separate species.
- **R3 — Older subrace vs. newer standalone:** if MPMM has a standalone replacement, drop the old subrace (Duergar, Eladrin, Sea Elf, Shadar-kai, Githzerai, Deep Gnome; VGM Aasimar subraces → MPMM Aasimar's three versions).
- **R4 — A 2014 species that was re-published in a 2024 book gets two entries,** `x` (2014) and `x-2024` (2024), never one merged entry. This matches the existing `human` / `human-2024` convention.
- **R5 — Anything derived by `_copy`** (the Lorwyn species copy MPMM Goblin/Fairy/Genasi and XPHB Halfling) is built from the **source it copies**, so those MPMM entries must be done before the Lorwyn ones.

---

## 5. Scope

Counts are unique species after the rules above.

### 5A. Already in the app — backfill/repair (18)
Existing entries to re-verify against the canonical source, fixing `source`/`sources`, traits, speed, size, and descriptions:

Aasimar (MPMM, 3 versions), Bugbear, Fairy, Firbolg, **Genasi (add Air/Earth/Water; currently Fire only)**, Githyanki, Goblin, Goliath, Harengon, Hobgoblin, Kenku, Kobold (3 versions), Loxodon (GGR), Orc, Owlin (SCC), Tabaxi, Triton, **Yuan-ti Pureblood → MPMM *Yuan-Ti*** (VGM version is superseded; keep slug `yuan-ti-pureblood` as a `legacySlugs` alias).

The 2014 PHB set (Human incl. Variant, Dwarf Hill/Mountain, Elf High/Wood/Drow, Halfling Lightfoot/Stout, Gnome Forest/Rock, Dragonborn, Half-Elf, Half-Orc, Tiefling) and the 2024 XPHB set are **verification only** (no new content).

### 5B. New 2014 standalone species (33)

| Source | Species | Mechanics the engine cannot apply (text only) |
|---|---|---|
| MPMM (14) | Aarakocra, Centaur, Changeling, Deep Gnome, Duergar, Eladrin, Githzerai, Lizardfolk, Minotaur, Satyr, Sea Elf, Shadar-kai, Shifter (4 versions), Tortle | flight/swim speed, darkvision, resistances, innate spells (Aarakocra, Deep Gnome, Duergar, Githzerai), skill/tool proficiencies |
| AAG (6) | Astral Elf, Autognome, Giff, Hadozee, Plasmoid, Thri-kreen | climb/swim speed, immunities (Autognome), innate spells (Astral Elf) |
| MOT (1) | Leonin | skill prof, darkvision |
| GGR (2) | Simic Hybrid, Vedalken | flexible ASI (Simic Hybrid), tool/skill + language choice (Vedalken) |
| VRGR (3) | Dhampir, Hexblood, Reborn | climb speed, innate spells (Hexblood), resistances |
| AI (1) | Verdan | skill prof, language choice |
| ERLW (2) | Kalashtar, Warforged | resistances, immunities, tool/skill prof, language choice, flexible ASI (Warforged) |
| TCE (1) | Custom Lineage | feat grant, flexible ASI, language choice — **needs a UI decision (D5)** |
| FTD (3) | Dragonborn: Chromatic, Gem, Metallic | breath weapon/resistance by ancestry; Gem also has flight at level 5 |

### 5C. 2014 variants/lineages (39) — attach to a parent, don't make cards
| Source | Variants | Parent |
|---|---|---|
| ERLW (13) | Dragonmarks: Warding (Dwarf), Shadow (Elf), Scribing (Gnome), Healing + Hospitality (Halfling), Handling + Making + Passage + Sentinel (Human), Finding (Human Variant), Detection + Storm (Half-Elf), Finding (Half-Orc) | PHB parent species |
| SCAG (9) | Half-Elf descents ×4 (Aquatic, Drow, Moon/Sun, Wood), Tiefling variants ×4 (Devil's Tongue, Hellfire, Infernal Legacy, Winged), Ghostwise Halfling | Half-Elf / Tiefling / Halfling |
| MTF (9) | Tiefling bloodlines: Asmodeus, Baalzebul, Dispater, Fierna, Glasya, Levistus, Mammon, Mephistopheles, Zariel | Tiefling |
| EGW (4) | Draconblood + Ravenite Dragonborn, Pallid Elf, Lotusden Halfling | Dragonborn / Elf / Halfling |
| MPMM (4) | Genasi: Air, Earth, Fire, Water | Genasi (part of 5A) |

Representation: use the existing `variants[]` array on the parent record (as Human already does), **except** where the parent has no 2014 record (none in this group).

### 5D. Deferred — DMG "monstrous PC" options (8)
Bullywug, Gnoll, Grimlock, Kuo-Toa, Merfolk, Skeleton, Troglodyte, Zombie. Fixed old-style stat bonuses, DM-approval options. Included, and hidden from the species lists when `SHOW_MONSTROUS_PLAYER_SPECIES` in `src/data/contentFlags.ts` is turned off (it defaults to on).

### 5E. New 2024 species (15) + Elf lineages
| Source | Species |
|---|---|
| EFA (5) | Changeling, Kalashtar, Khoravar, Shifter (4 versions), Warforged |
| RHW (4) | Dhampir, Hexblood, Lupin, Reborn |
| LFL (6) | Boggart (copy of MPMM Goblin), Faerie (MPMM Fairy), Flamekin (MPMM Genasi), Kithkin (XPHB Halfling), Lorwyn Changeling, Rimekin |
| LFL (extension) | Adds **Lorwyn** and **Shadowmoor** lineages to the existing `elf-2024` record (a `_copy` of XPHB Elf that replaces its lineage table) — edit, not a new species |

**Total new species records: 33 + 15 = 48**, plus 39 variants, 18 repairs, and 1 existing-record extension.

---

## 6. Conventions Phase B will follow

1. **Slugs.** 2014: plain kebab name (`duergar`). 2024: `-2024` suffix (`changeling-2024`). Never reuse a slug across editions. Keep `legacySlugs` for renames.
2. **`source` / `sources`.** Use 5etools abbreviations (`PHB`, `MPMM`, `ERLW`, `XPHB`, `EFA`…) uniformly; replace `VGtM`/`MToF`/`EE`/`PHB 2024`. `sources` lists every book that carries the species.
3. **Core vs expanded.** Only the PHB-2014 and XPHB species are `core: true`. Everything in this lane is `expanded: true`, `core: false`.
4. **Tags.** `legacy` for 2014 entries; plus one of `monstrous, planar, elemental, construct, undead, fey, eberron, ravenloft, lorwyn…` as a theme tag. Add a `setting` tag only where it helps filtering.
5. **Ability scores.**
   - Fixed-ASI books (PHB, DMG, VGM, MTF, SCAG, EGW, GGR, ERLW, AI, MOT): record the fixed numbers as printed.
   - MPMM / lineage-style (+2/+1 anywhere): `ability_bonuses: {}` **plus the new `abilityChoice` field from batch B0** (D2). 2024 species keep `{}` (their bonuses come from Background).
6. **Speed.** Number = walking speed. Fly/swim/climb go into the trait text (and a new optional `movement` field only if D3 is approved).
7. **Trait names.** `featureDescriptions.json` is keyed by name only. When the same name has different text in 2014 and 2024, the 2014 (or only) text is the plain key and the 2024 text is `"<Name> [2024]"`, resolved via `getFeatureDescription(name, edition)` (see the edition-conformance pass). Within one edition, a name must have one text; genuinely different traits get a distinguishing name.
8. **Descriptions.** Paraphrase flavour; keep rules text accurate and complete. One description per new trait name.
9. **Languages.** Add every species to `speciesLanguages.json` with its fixed languages; choices are recorded in the trait text.
10. **Cleanup in the same pass.** Remove the dangling `species_feat_options` on `half-orc` and `githyanki`, and the stale `speciesFeatOptions` on `enhancedSpeciesData["half-orc"]`.
11. **Docs.** `CLAUDE.md` says the app is "Limited to SRD content". That stops being true once this lane lands; update it in the first Phase B commit so future work isn't misled.

---

## 7. Phase B execution plan

Order matters because of `_copy` dependencies (R5).

| Batch | Contents | Count |
|---|---|---|
| B0 | **Engine: flexible ability scores (D2). DONE.** `abilityChoice?: { patterns: number[][]; from?: AbilityName[] }` on `Species`/`SpeciesVariant`; `speciesAbilityChoices` on `CharacterCreationData`; pure rules/validation/resolver in `src/utils/speciesAbilityUtils.ts` (`resolveSpeciesAbilityBonuses` is used by all four calculation sites); `SpeciesAbilityChoiceWidget` rendered in **Step 2** (next to the other species choices, not Step 4 - Step 4 only displays the resolved totals); validation in `useStepValidation` step 2; tests in `speciesAbilityUtils.test.ts` and `SpeciesAbilityChoiceWidget.test.tsx`. Patterns: MPMM `[[2,1],[1,1,1]]`; Half-Elf `fixed CHA+2` + `[[1,1]] from non-CHA`; Changeling/Warforged `[[1]]`; Custom Lineage `[[2]]`. | engine |
| B1 | **Repairs: 5A. DONE** (generated by `sourcebooks/build_species_b1.py`; see B1 notes below) | 18 |
| B2 | MPMM standalone species (5B first row). **DONE** (`sourcebooks/build_species_b2.py`) | 14 |
| B3 | AAG + MOT + GGR + VRGR + AI. **DONE** (`sourcebooks/build_species_b3.py`) | 13 |
| B4 | ERLW species + TCE Custom Lineage + FTD dragonborn. **DONE** (`sourcebooks/build_species_b4.py`) | 6 |
| B5 | Variants (5C). **DONE** (`sourcebooks/build_species_b5.py`; see B5 notes for the representation) | 35 (4 Genasi done in B1) |
| B6 | 2024: EFA + RHW. **DONE** (`sourcebooks/build_species_b6.py`) | 9 |
| B7 | 2024: LFL (after B1/B2 for the copied sources) + Elf lineages. **DONE** (`sourcebooks/build_species_b7.py`) | 6 + 1 |

Each batch:
1. A script generates **draft** records from `races.json` (names, size, speed, ability, trait list, text) so transcription errors are structural, not typographical.
2. I review the draft against the rendered book text in `/content-sourcebooks`.
3. Apply to `species.json`, `featureDescriptions.json`, `speciesLanguages.json`.
4. Run: JSON validation, a **new data-integrity test** (unique slugs, edition tag matches slug suffix, every trait name has a description, every species has a language entry, no dangling feat slugs), `npm test`, `npm run lint`.
5. One commit per batch.

Model guidance: B1 and B5 involve judgment (repairs, variant modelling) → stronger model. B2–B4, B6–B7 are mostly mechanical from the draft → the current model is adequate with the integrity test as a backstop.

---

## 8. Cross-lane dependencies

- **Dragonmarks in 2024 are feats** (EFA `Mark of …|EFA`), not species variants → belong to the Feats lane. The 2014 Dragonmarks (5C) are species variants and stay here. Feat prerequisites that name a species (Mark feats) require extending `featUtils.ts` species parsing.
- **Innate spells** granted by new species (Aarakocra, Duergar, Hexblood, Khoravar, Flamekin…) reference spells by slug. Spell slugs are stable (`thaumaturgy`, `darkness`, …) after the spell fix, but any spell *not yet in the app* (e.g. 2014-only or 2024-only names) must exist first — the Spells lane must precede enabling any innate-spell wiring.
- **Skill/tool proficiencies** granted by species are not applied by the wizard today. If you want them applied, that's engine work, not data (D3).

---

## 9. Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | How 2014 species appear in the 2024 wizard | **Resolved: keep current behavior** (non-core 2014 species show under Expanded). Consequence to handle in Phase B: once 2024 Changeling/Kalashtar/Shifter/Warforged/Dhampir/Hexblood/Reborn exist, the 2024 Expanded list will contain **two cards with the same name** (2014 + 2024). Minimum mitigation, no behavior change: show the edition on every card. |
| D2 | Flexible ability scores | **Resolved: build it** — added as batch B0 (engine work, ahead of B1). |
| D3 | Engine support for fly/swim/climb, resistances, skill/tool grants | Open — recommendation: not in this lane; land as text. |
| D4 | Dragonmarks as 2014 variants | Default: yes. |
| D5 | Custom Lineage | **Resolved: included (B4).** The +2 choice uses `abilityChoice`; its feat is a level 1 feat slot in the existing Feats step (`calculateFeatAvailability` gives 2014 Custom Lineage +1). |
| D6 | DMG monstrous PCs (8) | **Resolved: included.** Hidden by `SHOW_MONSTROUS_PLAYER_SPECIES` (default on). |
| D7 | Tiefling bloodlines + SCAG variants as `variants[]` | Default: yes. |


## B0 implementation notes (for later batches)

- **Authoring `abilityChoice`:** fixed increases stay in `ability_bonuses`; the player's picks go in `abilityChoice.patterns` (each inner array is one legal way to spend the choice, e.g. `[2,1]`). Use `from` to restrict choosable abilities; abilities with a fixed bonus are automatically excluded. Add 2014 species only; 2024 species keep `{}`.
- **Variants REPLACE the parent's bonuses/choice, they do not add to them.** A variant must restate anything it inherits (the existing Human "standard" variant already repeats +1 to all). This matters for B5 (Dragonmark variants etc.).
- **B5 prerequisite - generic variant picker: DONE.** Any 2014 species with `variants[]` (except Human, which keeps `HumanVariantSelector`) now shows `SpeciesVariantSelector` in Step 2, and Next is blocked until one is chosen. Set `variantOptional: true` on the parent for species whose base form is also playable (e.g. Half-Elf with/without a Dragonmark); the picker then offers a "Standard" option. 2024 species are excluded - their `variants` are lineage metadata handled by the 2024 lineage UI. The selected variant's ability bonuses/choice replace the parent's, its `species_traits` are merged into the character's traits (`getEffectiveSpeciesTraits`), and `selectedSpeciesVariant` is now saved on the Character (header badge shows the variant name). Changing species clears all variant/ability-choice state. Not supported yet: per-variant speed overrides, variant-granted skills/tools/spells (same engine gap as D3).
- **Variant Human** keeps writing `variantAbilityBonuses`; the resolver reads it as the selection (legacy bridge). Its skill proficiency and feat are still not applied by the live creation path (pre-existing, outside B0).
- **Behavior changes from B0:** 2014 Half-Elf now gets CHA +2 and +1/+1 (previously nothing); Variant Human now gets exactly its two chosen +1s (previously +1 to all six in the live path) and Step 2 will not advance until both are chosen.


## B1 notes (repairs, done)

**What changed.** The 18 existing non-core 2014 species were regenerated from their canonical source (R2) with `sourcebooks/build_species_b1.py` (rerunnable; reads the 5etools `races.json` mirror, strips 5etools markup, and refuses to apply if trait-name conflicts are unresolved):
- MPMM supersedes VGM/EEPC/WBtW: Aasimar, Bugbear, Fairy, Firbolg, Genasi, Githyanki, Goblin, Goliath, Harengon, Hobgoblin, Kenku, Kobold, Orc, Tabaxi, Triton, Yuan-Ti. Loxodon stays GGR (fixed ASI), Owlin stays SCC. `source`/`sources` now use 5etools abbreviations.
- MPMM/SCC species use `abilityChoice: [[2,1],[1,1,1]]` (the old VGM fixed bonuses, incl. Orc's -2 INT, are gone). Loxodon keeps CON +2, WIS +1.
- **Variants:** Aasimar (Necrotic Shroud / Radiant Consumption / Radiant Soul), Kobold (Craftiness / Defiance / Draconic Sorcery) and Genasi (Air / Earth / Fire / Water; Air has a 35 ft walking speed via the new `SpeciesVariant.speed`). The variant is required, so the generic picker from B5-prereq is used. Variants restate the parent's `abilityChoice`.
- **Slug change:** `yuan-ti-pureblood` -> `yuan-ti` (name "Yuan-Ti"); old slug kept in `legacySlugs`.
- **core/expanded:** Orc, Aasimar and Goliath (2014) were wrongly `core: true`; they are now `expanded` (convention 6.3). The cards in Step 2 now show `edition · source` (D1 mitigation).
- **Languages:** MPMM species no longer grant fixed non-Common languages (the book gives "Common plus one of your choice"); the choice itself is not modelled (same engine gap family as D3). Loxodon: Common + Loxodon.
- **Trait text:** every trait of the 18 species has book text in `featureDescriptions.json`. Where a name is shared with another species/edition the text was kept or rewritten only if it said the same thing (Darkvision, Healing Hands, Stone's Endurance rewritten; Relentless Endurance kept). Names whose text really differs got a qualifier: `Fey Ancestry (Charmed Only)` (MPMM goblinoids; the PHB elf one also stops magical sleep), `Darkvision (120 ft)`, `Climbing Speed`, `Swimming Speed`.
- **Cleanup (6.10):** removed `species_feat_options` on Half-Orc and the stale `speciesFeatOptions` on `enhancedSpeciesData["half-orc"]`; renamed the enhanced key `yuan-ti-pureblood` -> `yuan-ti`.

**Engine change in B1: enhanced data no longer leaks into 2014 records.** `enhancedSpeciesData.json` is keyed by base slug and used to be spread over both editions, so 2014 `goliath`/`orc`/`aasimar` inherited 2024 `traits`, `baseSpeed`, ancestries, etc. `loadSpecies()` now merges only lore (`detailedDescription`, `typicalRoles`, `roleplayingTips`) into 2014 records.

**Integrity test** `src/data/speciesData.integrity.test.ts` now guards: unique slugs, edition matches the `-2024` slug suffix, only PHB 2014 species are core, `sources` includes `source`, every trait has a description, every species has a language entry (and no orphan entries), no dangling feat references, no 2024 mechanics on 2014 records, variants restate the choice. It carries two explicit allow-lists of **pre-existing 2024 problems** (24 traits without descriptions; 2024 Dragonborn's two non-existent species feats) that must shrink, never grow.

## Edition-conformance pass (done)

Decision: each edition's species must match its own book. `sourcebooks/build_species_conformance.py` (rerunnable, `--apply`) did the following.

- **Trait text is edition-aware.** `featureDescriptions.json` stays keyed by name. A plain name holds the 2014 (or only) text; `"<Name> [2024]"` holds the 2024 text when it differs. `getFeatureDescription(name, edition)` (`src/utils/featureDescriptions.ts`) prefers the `[2024]` key for 2024 characters/wizard and falls back to the plain key; `SpeciesTraitModal` takes an `edition` prop; `App.tsx` passes `selectedCharacter.edition`. **This replaces the "distinguishing suffix in parentheses" idea in convention 7**; parenthetical qualifiers are only for traits that are genuinely different traits (e.g. `Darkvision (120 ft)`, `Fey Ancestry (Charmed Only)`).
- **2014 PHB species** now match the PHB: speeds (Halfling and Gnome 25, Wood Elf 35, Dwarf 25), full trait lists with book names (`Dwarven Armor Training`, `Dwarven Toughness`, `Dwarven Speed` = the book's "Speed", High Elf `Keen Senses` + `Extra Language`, Drow `Darkvision` + `Drow Weapon Training`), qualifiers removed from names (`Skill Versatility`, `Menacing`, `Stout Resilience`, `Hellish Resistance`, `Superior Darkvision`), PHB text under the plain names, and **Half-Orc's missing STR +2 / CON +1** restored. Shared `Darkvision` stays generic: the PHB prefaces each species' Darkvision with a flavor sentence, the rule is identical.
- **2024:** all 24 previously undescribed traits now have XPHB text; 2024 text that differs from the 2014 text of the same name is stored under `[2024]` keys. Renames to follow the book: `Lucky` -> `Luck` (halfling), `Draconic Flight (cannot fly ...)` -> `Draconic Flight`, `Cloud Jaunt` -> `Cloud's Jaunt`, `Darkvision` -> `Darkvision (120 ft)` for Dwarf and Orc, Wood Elf lineage `Mask of the Wild` -> `Wood Elf Magic`, Forest Gnome `Speak with Small Beasts` -> `Speak with Animals`. Orc lost `Powerful Build` (not an XPHB Orc trait). Lineage/legacy labels (`Drow Magic`, `Detect Magic`, `Abyssal Arcana`, ...) are hand-written from the XPHB lineage tables.
- **2024 Dragonborn** no longer has species-feat options (the book grants none); the allow-lists in the integrity test are gone.
- **`resolveSpeciesSlug(slug, edition?)`** returns a slug that names a real species unchanged unless the character is 2024 (old unsuffixed slugs migrate to the `-2024` record only for 2024 characters). A 2014 Aasimar/Goliath/Orc/Human/Dwarf stays 2014.

## B2 notes (done)

14 new expanded 2014 species from MPMM, generated by `sourcebooks/build_species_b2.py` (same pipeline as B1: draft from `races.json`, conflict report, `--apply` refuses while conflicts remain): Aarakocra, Centaur, Changeling, Deep Gnome, Duergar, Eladrin, Githzerai, Lizardfolk, Minotaur, Satyr, Sea Elf, Shadar-Kai, Shifter (four required versions: Beasthide, Longtooth, Swiftstride, Wildhunt), Tortle. All use the MPMM flexible `abilityChoice`, languages `['Common']`, and carry the older reprint books in `sources` (EEPC, GGR, MOT, ERLW, MTF, SCAG, VGM, TTP).

- **Name conflicts resolved by renaming** (same name, different rules): `Natural Armor` stays Loxodon's; Lizardfolk `Natural Armor (13 + Dex)`, Tortle `Natural Armor (Shell, AC 17)`; `Hold Breath (15 Minutes)` / `Hold Breath (1 Hour)`; `Nature's Intuition (Two Skills)` / `(One Skill)`; Lizardfolk and Sea Elf `Speed` -> `Swimming Speed`; MPMM elves `Fey Ancestry (Charmed Only)` and `Trance (4-Hour Rest)` (Eladrin: `Trance (Change Season)`); Deep Gnome and Duergar `Darkvision (120 ft)`.
- **Kept as stored** because only the wording differs: `Darkvision`, `Darkvision (120 ft)`, Duergar's `Dwarven Resilience` (MPMM also lets the save end the poisoned condition; the PHB text is kept for the PHB dwarves).
- **Not modelled:** the `Creature Type` entries (e.g. Eladrin "also considered an elf", Changeling is Fey) are skipped, as in B1; the engine has no creature-type prerequisites. Skill/tool choices, fly/swim/climb speeds, resistances and innate spells are text only (D3).
- **Tooling fix:** `strip_tags` rendered `{@book text|source|chapter|anchor}` as its chapter number; it now keeps the displayed text. The only affected earlier text was 2024 Human *Versatile*, already corrected.
- Test: `src/utils/speciesB2.test.ts`.

**Still open:** see the D3 section below (D3 resolved most of what was listed here).

## B3 notes (done)

13 new expanded 2014 species generated by `sourcebooks/build_species_b3.py` (same pipeline as B2; it also writes the D3 grants and the Simic Hybrid choice): Astral Elf, Autognome, Giff, Hadozee, Plasmoid, Thri-kreen (AAG), Leonin (MOT), Simic Hybrid, Vedalken (GGR), Dhampir, Hexblood, Reborn (VRGR), Verdan (AI). `source`/`sources` are the single printing book; the 2024 RHW reprints of Dhampir, Hexblood and Reborn belong to B6 as separate `-2024` records.

- **Ability scores:** the AAG and VRGR species are lineage-style (`lineage: VRGR` in the data) and use the flexible `[[2,1],[1,1,1]]` choice. Leonin (STR+1 CON+2), Vedalken (INT+2 WIS+1) and Verdan (CON+1 CHA+2) keep the printed bonuses. Simic Hybrid is CON+2 plus one other +1 (`abilityChoice [[1]]` from STR/DEX/INT/WIS/CHA). The script asserts that the configured bonuses match the source data.
- **Languages:** Common plus one choice for the lineage-style species and Simic Hybrid; Leonin gets Leonin, Vedalken gets Vedalken plus one choice, Verdan gets Goblin plus one choice.
- **Speed traits:** Giff (swim) and Hadozee (climb) get `Swimming Speed` / `Climbing Speed` traits because `races.json` keeps those in the speed field (the stored texts are shared with the MPMM species). The Giff swim speed is taken from the 5etools data; the local book mirrors do not include the species sections, so it is worth a check against the printed book.
- **Name conflicts:** Astral Elf uses `Fey Ancestry (Charmed Only)`; Plasmoid uses `Hold Breath (1 Hour)`; Dhampir's *Deathless Nature* is `Deathless Nature (No Breathing)` (Reborn keeps the plain name); Leonin's claws are `Leonin Claws`.
- **Mechanics wired (D3):** Autognome and Thri-kreen natural armor (13 + Dex); Autognome poison resistance and disease immunity; Plasmoid acid/poison resistance; Reborn poison resistance; Dhampir Spider Climb; Giff Firearms; Verdan Persuasion; Leonin skill pick; Vedalken skill and tool picks; Autognome two tool picks (any PHB tool); the three VRGR lineages' Ancestral Legacy (two skills). Simic Hybrid asks for its 1st-level Animal Enhancement (climbing and swimming apply).
- **Not modelled:** the Simic Hybrid 5th-level enhancement (text only), Astral Elf *Astral Fire* and Hexblood *Hex Magic* innate spells, Astral Trance daily proficiencies, Verdan's growth from Small to Medium, the Small/Medium size choice, and the `Creature Type` entries.
- Test: `src/utils/speciesB3.test.ts`.

## B4 notes (done)

Six new expanded 2014 species generated by `sourcebooks/build_species_b4.py`: Kalashtar and Warforged (ERLW), Custom Lineage (TCE), and the Fizban's dragonborn `dragonborn-chromatic`, `dragonborn-gem`, `dragonborn-metallic` (FTD). The 2024 EFA reprints of Kalashtar and Warforged belong to B6. The script asserts the configured ability scores and the ancestry tables against the source data.

- **Abilities:** Kalashtar WIS+2 CHA+1 (printed). Warforged CON+2 plus one other +1. Custom Lineage a single +2 (`abilityChoice [[2]]`, restated on both variants). The FTD dragonborn are lineage-style (flexible +2/+1 or +1/+1/+1).
- **Custom Lineage:** two required variants, Darkvision (the stored `Darkvision` trait, 60 ft) and Skill Proficiency (`Variable Trait (Skill Proficiency)`, one skill pick). The feat is not a species pick: `calculateFeatAvailability` gives 2014 Custom Lineage one feat at level 1, so the existing Feats step opens (with its existing prerequisite filtering) and the choice is saved in `selectedFeats`. Size (Small or Medium) is not modelled.
- **FTD dragonborn:** an `ancestry` choice (speciesChoices.json) with the book's tables (Chromatic: Black acid, Blue lightning, Green poison, Red fire, White cold. Gem: Amethyst force, Crystal radiant, Emerald psychic, Sapphire thunder, Topaz necrotic. Metallic: Brass fire, Bronze lightning, Copper acid, Gold fire, Silver cold). Each option grants the matching resistance. `Gem Flight` is a fly speed from level 5. Languages are Common plus one choice (the mirror has no language line for the lineage-style FTD species; Draconic is one of the choices).
- **Engine addition:** `TraitGrant.acBonus` -> `Character.acBonus` (Warforged *Integrated Protection*, +1 AC), applied in `calculateCharacterStats` and `recalculateAC` and listed in the AC breakdown.
- **Name conflicts:** `Breath Weapon (Chromatic|Gem|Metallic)` and `Draconic Resistance (Chromatic|Gem|Metallic)` (the PHB `Breath Weapon` is untouched), `Sentry's Rest (Warforged)`, `Specialized Design (Skill and Tool)` (Autognome keeps `Specialized Design`), `Mental Discipline (Psychic Resistance)` (Githzerai keeps `Mental Discipline`), `Custom Lineage Feat`.
- **Not modelled:** Chromatic Warding (level 5 immunity), Metallic Breath Weapon (level 5 second breath), the Warforged armor-integration rules, the Small/Medium size choice.
- Test: `src/utils/speciesB4.test.ts`.

## B5 notes (done)

Generated by `sourcebooks/build_species_b5.py` (draft from the 5etools `subrace` array, conflict report, `--apply`).

**Deviation from "attach to a parent":** variants are only used where a single parent record exists in the app *and* the option replaces one of its features.

- **Standalone species (18, expanded, `legacy`, 2014).** Options whose parent is split into several app records (Dwarf, Elf, Gnome, Halfling), or that change the parent's whole statline, are separate records named "<Parent> (<Option>)" built from the parent's common base traits plus the option's own traits (same approach as the FTD dragonborn): the 13 Dragonmarks (`dwarf-mark-of-warding`, `elf-mark-of-shadow`, `gnome-mark-of-scribing`, `halfling-mark-of-healing`/`-hospitality`, `human-mark-of-handling`/`-making`/`-passage`/`-sentinel`/`-finding`, `half-elf-mark-of-detection`/`-storm`, `half-orc-mark-of-finding`), `elf-pallid`, `halfling-ghostwise`, `halfling-lotusden` and `dragonborn-draconblood`/`-ravenite`. The Human and Half-Elf/Half-Orc marks restate the printed ability scores; the dragonmarks that add to a base (Warding INT+1, Shadow CHA+1, etc.) are the base scores plus the mark's bonus.
- **Variants on an existing record:** Tiefling (13 variants: the 9 MTF bloodlines including Asmodeus, and the SCAG Devil's Tongue/Hellfire/Infernal Legacy/Winged; `variantOptional`) and Half-Elf (7 SCAG descents; `variantOptional`). New convention: `SpeciesVariant.replacesTraits` lists base traits the variant removes (Infernal Legacy, Skill Versatility). It is honoured by `getEffectiveSpeciesTraits` (so grants, pick slots and the saved trait list drop them), the variant picker ("Replaces: ...") and the Step 2 trait list. SCAG's Feral variant is covered by the variants' DEX or CHA +2 choice.
- **EGW dragonborn:** same `draconicAncestry` choice but without the resistance grants (they have the breath weapon only); trait names `Draconic Ancestry (Breath Only)` and `Breath Weapon (Draconblood and Ravenite)`.
- **Mechanics (D3):** Mark of Storm lightning resistance, Mark of Making/Finding tool choices, Mark of Passage 35 ft speed, Winged fly 30 ft, Swim descent swimming 30 ft, Wood Elf descent Fleet of Foot 35 ft (`SpeciesVariant.speed`), Elf Weapon Training, Darkvision.
- **Name conflicts:** `Swimming Speed (Half-Elf)`, `Drow Magic (Half-Elf)`, `Spells of the Mark (<Mark>)` (13 distinct texts, each with its spell table inlined), `Draconic Ancestry (Breath Only)`.
- **Markup fix:** `strip_tags` now handles `{@quickref text||section}` (it used to render the section number: Earth Walk, Timberwalk).
- **Flags / not modelled:** Spells of the Mark are text-only (no spell-list expansion); innate spells (Legacy of X, Mark spells, Drow Magic, the half-elf Cantrip descent pick) are text-only; Winged Tiefling is assumed to replace Infernal Legacy (the book says the options are mutually exclusive); the Half-Orc Mark of Finding uses the printed WIS+2 CON+1 (the 5etools mirror inherits Half-Orc STR+2 CON+1) and drops Menacing; Human Mark of Finding/Half-Orc Mark of Finding speak Common and Goblin; the "Asmodeus" tiefling variant is the PHB tiefling (a label only); species-based feat prerequisites still match slugs only (Feats lane).
- Test: `src/utils/speciesB5.test.ts`.

## B6 notes (done)

Nine expanded 2024 species generated by `sourcebooks/build_species_b6.py`: EFA Changeling, Kalashtar, Khoravar, Shifter, Warforged and RHW Dhampir, Hexblood, Lupin, Reborn (slugs `<name>-2024`; Dhampir also lists ABH and Reborn PL in `sources`). The 2014 Changeling/Kalashtar/Shifter/Warforged/Dhampir/Hexblood/Reborn entries are untouched, so the 2024 Expanded list shows two cards per name (D1); the cards already show `edition · source`.

- **2024 shape:** `ability_bonuses: {}` (bonuses come from the Background), `core: false`, `expanded: true`, `legacy: false`, `creatureType` and `size` from the book (most are "Medium or Small"; Kalashtar Medium; the size choice itself is not modelled), languages `['Common']` (2024 species have no species languages; the Quori of the 2014 Kalashtar is not carried over).
- **Trait text follows the `[2024]` rule:** the stored 2014 text is overridden by `"<Name> [2024]"` for Dual Mind, Eerie Token, Fey Gift, Integrated Protection, Knowledge from a Past Life, Mental Discipline, Mind Link, Sentry's Rest, Severed from Dreams, Skill Versatility and Vampiric Bite. Existing `[2024]` texts (Darkvision, Fey Ancestry) and the 2014 `Specialized Design (Skill and Tool)` (identical text) are reused. Changeling Instincts, Spider Climb and Bestial Instincts differ only in wording and keep the stored text.
- **Grants:** new plain grants for Trace of Undeath (necrotic resistance), Construct Resilience (poison resistance) and Werewolf Instincts (one of Perception/Stealth/Survival). Names that 2014 species also use have 2024-only grant overrides so the 2014 mechanics do not change: `Mental Discipline [2024]` (psychic resistance), `Severed from Dreams [2024]` / `Knowledge from a Past Life [2024]` (one free skill), `Skill Versatility [2024]` (one skill). Reused: Changeling Instincts (2 skills), Bestial Instincts, Spider Climb (climb = speed), Integrated Protection (+1 AC), Specialized Design (Skill and Tool), Darkvision.
- **Choices (speciesChoices.json):** `shifter-2024` `shifting` (Beasthide / Longtooth / Swiftstride / Wildhunt; descriptive only, no grants) and `reborn-2024` `strangeEndurance` (cold / necrotic / poison resistance).
- **Flags / not modelled:** Skill Versatility and Severed from Dreams are "swap on a Long Rest" and Skill Versatility may be a tool instead (only the skill pick is modelled); the Shifting benefits (temporary hit points, +1 AC while shifted, +10 ft speed while shifted, Wildhunt advantage) and Dhampir's Vampiric Bite and Lupin's Feral Pounce/Howl are text-only; Khoravar Fey Gift (Friends cantrip swap) and Hexblood Hex Magic (Disguise Self and Hex) are text-only, with no spellcasting-ability choice; Reborn Knowledge from a Past Life d6 and Warforged armor rules are text-only.
- Test: `src/utils/speciesB6.test.ts`.

## B7 notes (done)

Six expanded 2024 species from Lorwyn: First Light, plus an edit of `elf-2024`, generated by `sourcebooks/build_species_b7.py`.

- **Copy-based species (R5):** Boggart (MPMM Goblin), Faerie (MPMM Fairy), Flamekin (MPMM Genasi + the LFL-appended Fire Resistance and Reach to the Blaze) and Kithkin (XPHB Halfling) are built from the trait text of the species each one copies. The 2014 Goblin trait `Fey Ancestry (Charmed Only)` becomes the 2024 `Fey Ancestry`; the MPMM `Darkvision` wording is replaced by the 2024 wording (same rule). They have no ability bonuses (the 5etools `lineage: null` removes the MPMM flexible ASI; 2024 bonuses come from the Background).
- **Lorwyn Changeling and Rimekin** are printed in the book. Lorwyn Changeling's 120 ft darkvision reuses `Darkvision (120 ft)`; Delightful Imitator grants one skill pick (Deception or Performance); `Shape Self` has a `[2024]` text (the 2014 Plasmoid/Autognome text of the same name is untouched). Rimekin: Cold Resistance grants cold resistance; Cold Fire Magic is text-only.
- **Lorwyn/Shadowmoor lineages** use the 2024 lineage mechanism, not variants: `lineages` in `enhancedSpeciesData.json` (keyed by base slug: `faerie`, `kithkin`, and the existing `elf`) and `lineageGrants` in `speciesChoices.json` (Shadowmoor: darkvision 120 ft). Choosing a lineage is required (existing validation). Lorwyn Faerie/Kithkin have no extra traits, so that lineage card is empty.
- **Elf (edit):** `elf-2024` now offers five lineages (High Elf, Wood Elf, Drow, Lorwyn, Shadowmoor); LFL is added to its `sources`. Lorwyn: Thorn Whip (swap for a Druid cantrip), Command at 3, Silence at 5. Shadowmoor: darkvision 120 ft, Starry Wisp, Heroism at 3, Gentle Repose at 5. The book's Elf *replaces* the PHB lineage table for Lorwyn/Shadowmoor natives; here they are added alongside the PHB lineages, as planned. The lineage spells and cantrips are text/metadata only (no spell wiring), as for the existing lineages.
- **Side effect worth knowing:** `Brave`, `Halfling Nimbleness` and `Naturally Stealthy` already had `[2024]` texts, so Kithkin and the PHB Halfling 2024 share the 2024 wording; no override was needed.
- **Not modelled:** the Medium-or-Small size choice, Boggart's goblinoid creature tag, Flamekin Reach to the Blaze and Rimekin Cold Fire Magic spells (and the Cold-damage Flame Blade), Faerie Magic spells, Shape Self and Unpredictable Movement.
- Test: `src/utils/speciesB7.test.ts`.

**Phase B status:** B0-B7 are all done. The species lane now has 108 records: 22 core (12 from the 2014 PHB, 10 from the 2024 PHB) and 86 expanded (71 for 2014, 15 for 2024). The 8 DMG monstrous PCs (D6) were added later; see `src/data/contentFlags.ts`.

## D3: species mechanics engine (done)

Species traits that used to be text only now change the character. Pure logic is in `src/utils/speciesGrantUtils.ts`; the data is JSON.

**Data**
- `src/data/speciesTraitGrants.json`: grants keyed by **trait name**, mirroring `featureDescriptions.json`. A `"<Name> [2024]"` key replaces the plain entry for 2024 characters (`{}` cancels it). A grant (`TraitGrant` in `types/dnd.ts`) can carry `movement` (feet, or `'walk'` = walking speed), `senses`, `resistances`, `conditionImmunities`, `skills`, `skillChoices`, `tools`, `toolChoices`, `weapons`, `armor`, `languageChoices`, `naturalArmor`, `hpPerLevel`, `initiativeProficiency`, `minLevel` and a display `note`.
- `src/data/speciesChoices.json`: choices the player makes per species slug (Draconic Ancestry for both Dragonborn, 2024 Fiendish Legacy, 2024 Giant Ancestry). Each option may carry grants (the ancestry resistance). `lineageGrants` holds grants for 2024 lineages whose trait names come from enhanced data strings (Drow darkvision 120).
- `species.json` `languageChoices` marks "Common plus one of your choice" species (all MPMM species, Human, Half-Elf).

**Flow**
- Step 2 (`SpeciesGrantChoices`) shows option choices and skill/tool pick slots; selections are stored as `speciesChoices` / `speciesPicks` and block Next until complete (`getMissingSpeciesChoices`). `SPECIES_CHOICE_RESET` clears them when the species changes or is randomized.
- Step 3 treats species skills as already granted; Step 9 adds the species language slots (2014 only).
- `calculateCharacterStats` resolves the grants once and writes `movement`, `senses`, `damageResistances`, `conditionImmunities`, `naturalArmor`, `hpPerLevelBonus`, `speciesChoices`, skills, proficiencies, initiative and AC (natural armor only when it beats armor, or when `noArmor`). `recalculateAC` honors natural armor with equipped gear.
- Level-up adds `hpPerLevelBonus` and re-resolves `movement` for level-gated grants (2024 Draconic Flight at 5).
- The sheet's Combat Stats panel lists movement, senses, resistances and immunities and shows natural armor in the AC breakdown.

**Adding a new species mechanic:** add the trait name to `speciesTraitGrants.json` (the integrity test fails for keys that match no real trait), add a pick slot with `skillChoices`/`toolChoices` when the player chooses, and add a choice def when the choice changes other grants.

**Still open**
- Innate spells from species (only the existing `TRAIT_SPELL_MAP` handling) and "gain proficiency after a rest" traits (Astral Knowledge, Trance picks) are not modelled.
- Instrument picks (Reveler) are a note only; the creature-type entries are skipped.
- Level-up re-resolves only `movement`; other level-gated grants would need the same treatment.
- 2024 `overflowSkills` (duplicate skills become any skill) is still not applied by the calculator; it predates D3.
- 2024 Giant Ancestry and Tiefling spell/active benefits are choices only; the Cleric 2024 Thaumaturge skill bonus is not in the live calculator (the old `wizard.utils.ts` that held it was dead code and has been removed, as has `characterCalculator.ts`).
