# Fast-lane plan: one lane per prompt

The species lane took eight batches because every record was reviewed and tested by hand. For the remaining lanes the goal is the opposite: **one script per lane, fully generated from the 5etools mirror, one prompt per lane.** Hand work is limited to the items the script flags.

Remaining work (from `sourcebooks/gap_report.md`, regenerated after B7):

| Lane | Missing | Of which 2014 / 2024 | Biggest sources |
|---|---|---|---|
| Feats | 195 (+35 other-edition) | 37 / 158 | XPHB 38, FRHOF 34, AU 29, EFA 28, ABH 16 |
| Backgrounds | 122 | 59 / 63 | FRHOF 18, EFA 17, SCAG 13, GGR 10, AU 10 |
| Spells | 288 | 183 / 105 | XGE 89, XPHB 52, AU 33, PHB 32, TCE 21 |
| Subclasses | 42 (+10) | 14 / 28 | XPHB 11, SCAG 6, FRHOF 6, AU 6 |
| Optional class features | 214 | 144 / 70 | PHB 76, XPHB 58, TCE 46, XGE 22 |
| Magic items | 1,889 | 1,120 / 769 | XDMG 582, DMG 502, PHB 97, EGW 85, TCE 84 |
| Monsters | 1,617 | 1,188 / 429 | MPMM 259, XMM 223, VGM 141, MTF 140, MM 136 |
| Classes | 3 (TCE sidekicks) | 3 / 0 | skip (see decisions) |

## How every lane works (the contract)

One prompt per lane delivers all of this, with no questions back unless a decision below is wrong:

1. **Fetch** the lane's 5etools JSON into `sourcebooks/.cache/` (same mirror as `scrape_5etools_books.py`).
2. **Generate** with `sourcebooks/build_<lane>.py`: map the 5etools record to the app schema automatically (no per-record config), resolve `_copy`/`_mod`, strip tags, set `edition` from the source (R1 in the species spec), keep 2014 and 2024 as separate entries, de-duplicate reprints (newest source wins within an edition).
3. **Mechanics only from structured fields** (ability, skill/tool/language proficiencies, resist/immune, speed, `additionalSpells`, prerequisite objects). Everything else is text. Reuse the species grant engine (`TraitGrant`, `resolveSpeciesGrants` style) instead of inventing per-lane engines.
4. **Conflict report + `--apply`**, same as the species scripts: stored entries are never overwritten silently; differences are listed and wording-only ones are accepted.
5. **Tests:** one generic integrity test per lane (unique slugs, edition/slug rules, every reference resolves, every record has text) plus a handful of spot checks. No per-record tests.
6. **Gate:** `npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run`, `npm run size-limit` all green (the known `SpellbookManager.tsx` tsc error excepted).
7. **Docs:** a short "<lane> notes" section appended to `docs/content-integration/` (flags and not-modelled list), and `sourcebooks/gap_report.md` regenerated.
8. **No git operations** (standing instruction).

Speed rules: no hand-written descriptions, no batching by book, no review of records the script did not flag, flags go in the final message instead of blocking questions.

## Shared foundation (done inside the Feats prompt)

The species scripts each re-implement the same helpers. The first prompt extracts them once into `sourcebooks/lanelib.py`: cached fetch of any mirror file, `strip_tags`/`entry_text`, generic `_copy`/`_mod` resolver, conflict classifier (reuse/accept/override/new), source-to-edition map, JSON writer (`indent=2`, `ensure_ascii=False`). Later lanes import it.

**Bundle policy.** The bundle limit is 500 KB gzip and the app already imports a 1.3 MB monster file and a 1 MB spell file statically. Large lanes (magic items, monsters, and spells if `size-limit` fails) are generated as one JSON chunk per source under `src/data/content/<lane>/` and loaded with dynamic `import()` behind an async loader with an in-memory cache. The foundation prompt adds a small `loadChunked()` helper for this.

## Order and per-lane scope

Order follows dependencies: Backgrounds reference Feats (Origin Feat), optional features and innate spells reference Spells, everything else is independent.

### 1. Feats (+ foundation)
- Source `feats.json`. 195 new entries plus the 35 that exist only in the other edition.
- Schema: keep the current `feats.json` shape (`slug, name, source, year, category, prerequisites, abilityScoreIncrease, benefits, description`).
- Prerequisites from 5etools structured `prerequisite` (level, ability, race, spellcasting, proficiency, feat, other).
- **Fix in this lane:** species prerequisites currently match slugs only, so 2014 subraces and the new `-2024`/variant slugs never match. Match by species name plus slug.
- Engine: feat grants (resistances, skills, speed, initiative, languages) through the existing grant engine. 2024 Mark feats (EFA) and Origin/General/Fighting Style/Epic Boon categories.
- Done when: every background `originFeat` and every species `speciesFeatOptions` slug resolves.

### 2. Backgrounds
- Source `backgrounds.json`. 122 new (2014 59, 2024 63).
- 2014: skills, tools, languages, equipment, feature. 2024: ability choice, Origin Feat (must resolve against the Feats lane), tool proficiency, equipment options A/B.
- Equipment mapped to `equipment.json` by name; unmatched items kept as text (the wizard already logs "Could not find equipment match").
- Done when: the wizard Step 1 lists every background for its edition and character creation works for a sample of each shape (fixed skills, skill choice, tool choice).

### 3. Spells
- Sources `spells-*.json` plus the class spell-list lookup. 288 new.
- **Fix in this lane:** the merge tags nearly everything 2024 (only 2 spells are 2014). Rebuild `5e-SRD-Spells-Merged.json` from the mirror with a correct `source`/`edition` per spell and class lists, keeping `source: '2014' | '2024'`.
- Wire the species innate spells that are text-only today (Marks, Legacy of X, Hexblood, Khoravar) only if time allows; otherwise list them as the follow-up.

### 4. Subclasses
- Source `class/class-*.json` (subclass and subclass feature records). 42 missing (+10 other-edition).
- **Fix in this lane:** `src/data/srd/2024/5e-SRD-Subclasses.json` is invalid JSON and is not imported. Replace with generated, valid data.
- Output feeds `subclassFeaturesByLevel.json` and the subclass picker; subclass spells via `additionalSpells`.

### 5. Optional class features
- Source `optionalfeatures.json` and the class files' progression tables. 214 missing: invocations, maneuvers, metamagic, infusions, pact boons, elemental disciplines, arcane shots, runes, fighting styles.
- Needs new structures: `optionalFeatures.json` catalog, a class progression count per level, a character field `optionalFeatures`, and a picker in creation and level-up. This is the lane with the most UI work.

### 6. Magic items
- Sources `items.json` plus `items-base.json`. 1,889 missing; **chunked and lazy-loaded** from the start.
- New `MagicItem` type (rarity, attunement, charges, text), `loadMagicItems()`, add-to-inventory and attunement tracking in the equipment service. Mechanical bonuses only from structured fields (`bonusAc`, `bonusWeapon`, `bonusSavingThrow`, ...); everything else is text.
- Mundane base items stay in `equipment.json`.

### 7. Monsters
- Sources `bestiary-*.json` (one file per book, many `_copy` entries). 1,617 missing; **one lazy chunk per source**.
- Convert to the existing `Monster` shape; the monster library gets source and edition filters. No fluff or images.
- This is the largest lane by volume, but the shape work is mostly done by the existing monster library.

## Decisions (defaults, tell me if any is wrong)

| # | Decision | Default |
|---|---|---|
| F1 | Which books | Every book in `sourcebooks/content_inventory.md` that the mirror carries. Unearthed Arcana and Arcana Unleashed stay included because they are in the gap report. |
| F2 | TCE sidekicks (3 "classes") | Skip. They are not player classes. |
| F3 | Editions | Always separate entries, edition from the source book (species R1). |
| F4 | Reprints | Within an edition keep the newest source; list the others in `sources`. |
| F5 | Mechanics vs text | Mechanics only where 5etools has structured data; the rest is text and goes into the lane's flag list. |
| F6 | Large lanes | Chunked, lazy-loaded JSON per source; no static import. |
| F7 | Review | Only flagged records. Spot-check output goes in the final message. |

## Prompt sequence

Send one of these per prompt, in order:

1. `feats` (includes the shared foundation)
2. `backgrounds`
3. `spells`
4. `subclasses`
5. `optional features`
6. `magic items`
7. `monsters`

Feats and backgrounds should each take a single prompt. Optional features and magic items are the two most likely to run long because they add UI.

---

# Runbook: sequential steps

Run the steps in order, one per prompt. Model tiers:

- **STRONGER**: switch to your more powerful model. These steps design shared code, new data models or engine behaviour, where a wrong choice is expensive to undo.
- **STANDARD**: the current model is enough. These steps follow a pattern that already exists (the generate, conflict-report, apply pipeline).

Paste the quoted line as the prompt. Do your own git commit after each step (the agent does not run git).

**Escalate to STRONGER mid-step** if any of these happen on a STANDARD step: tsc/lint/vitest still fail after two fix attempts, the conflict report has more than about 20 unresolved items, `size-limit` fails, or the step needs a new field on `Character`.

| Step | Prompt | Tier | Why |
|---|---|---|---|
| 0 | (you) commit the current state; skim the defaults F1-F7 above | none | Clean baseline so each step's diff is reviewable |
| 1 | "Step 1: build sourcebooks/lanelib.py (cached fetch, strip_tags/entry_text, generic _copy/_mod resolver, conflict classifier, edition map, writer) and a loadChunked() lazy-loader in src/. Port nothing yet. Add tests for the resolver." | STRONGER | Every later lane depends on it. The `_copy`/`_mod` resolver must be right for races, items and bestiary |
| 2 | "Step 2: feats lane per docs/content-integration/fast-lane-plan.md, including the species-prerequisite fix and feat grants." | STRONGER | Changes prerequisite matching and extends the grant engine to feats |
| 3 | "Step 3: backgrounds lane per the plan." | STANDARD | Same pipeline; the Origin Feat links resolve against step 2 |
| 4 | "Step 4: spells lane per the plan, including rebuilding 5e-SRD-Spells-Merged.json with correct edition tags and class lists." | STRONGER | Rewrites a core file used by spellcasting, slots and the spellbook UI; edition tags are currently wrong |
| 5 | "Step 5: subclasses lane per the plan, including replacing the invalid 2024 subclasses JSON." | STANDARD | Pipeline plus wiring into `subclassFeaturesByLevel.json` |
| 6a | "Step 6a: optional class features: data model, generator, progression counts per class level. No UI yet." | STRONGER | New catalog, new `Character` field and level-up rules |
| 6b | "Step 6b: optional class features picker in creation and level-up, using the step 6a model." | STANDARD | UI on a settled model (escalate if level-up flow breaks) |
| 7a | "Step 7a: magic items: MagicItem type, generator from items.json, chunked lazy loader." | STRONGER | New type and storage shape for 1,889 items |
| 7b | "Step 7b: magic items in the inventory: add to inventory, attunement tracking, item text." | STANDARD | UI on a settled model |
| 8a | "Step 8a: monsters: generator from bestiary-*.json with _copy resolution, one lazy chunk per source." | STRONGER | Highest volume and the most complex `_copy` chains |
| 8b | "Step 8b: monster library source and edition filters, lazy chunk loading." | STANDARD | UI on settled data |
| 9 | "Step 9: final pass: regenerate the gap report, full gate, update CLAUDE.md (it still says SRD-only), update docs." | STANDARD | Housekeeping |

Summary: 6 STRONGER steps (1, 2, 4, 6a, 7a, 8a) and 7 STANDARD steps (3, 5, 6b, 7b, 8b, 9, plus the step 0 baseline).

Each step ends with: the generated counts (missing before and after), the flag list (what is text-only), and the gate results. If a step's output looks wrong, say so in the next prompt rather than restarting.

---

## Step 1 notes (done)

**`sourcebooks/lanelib.py`** is the shared library for every later lane script (the species scripts keep their own copies):

| Helper | What it does |
|---|---|
| `fetch(rel_path)`, `fetch_dir(dir)` | Cached download from the mirror into `sourcebooks/.cache/` (gitignored). `fetch_dir` reads `<dir>/index.json` (spells, bestiary, class). |
| `edition_of(source)` | '2024' for books published on/after 2024-09-01 (from the mirror's `books.json`/`adventures.json`), else '2014'. |
| `strip_tags`, `render`, `entry_text` | 5etools markup and entry trees to plain text, including lists, tables, `abilityDc`, attack tags. Tip insets dropped by default. |
| `resolve_copy(entity, lookup)`, `make_lookup` | `_copy` chains: publication-only parent props dropped (`page`, `srd`, `reprintedAs`, `_versions`, ...) unless in `_preserve`; child props override; `null` deletes (e.g. `lineage: null`); then `_mod`. |
| `apply_mod` | appendArr, prependArr, insertArr, replaceArr (by name, index or regex), replaceOrAppendArr, appendIfNotExistsArr, removeArr, renameArr, replaceTxt (including `"*"`), prefixSuffixStringProp, scalarAddProp, scalarMultProp (numbers and "+5" strings), setProp, "remove". Unknown modes raise in strict mode; lane-specific modes are passed as `handlers`. |
| `expand_versions` | `_versions`, both plain and `_abstract` + `_implementations` (`{{var}}` templates). Subrace versions apply to race + subrace merged. |
| `classify_text` | new / reuse / accept / override (`[2024]`) / conflict, the rule used by the species batches. |
| `write_json`, `write_chunks(lane, by_source)` | The `src/data` JSON format; `write_chunks` writes `src/data/content/<lane>/<SOURCE>.json` and deletes stale chunks. |

Tests: `python3 -m unittest sourcebooks/test_lanelib.py` (27 tests; the real-data ones use the cache and skip without it).

**Resolver coverage on the real data (strict mode):** every race (177) resolves; all `_copy`/`_versions` in feats (2), backgrounds (26) and items (90) resolve. Bestiary: 1,229 copies, of which 60 need bestiary-only modes (`addSpells`, `replaceSpells`, `removeSpells`, `addSkills`). Those are left for step 8a as `handlers`; a test pins that nothing else is missing.

**Cache:** feats, backgrounds, items, items-base, magicvariants, optionalfeatures, the 19 spell files, the 114 bestiary files and the 23 class files are downloaded (23 MB). The class index also lists non-official classes (Death Knight, Mystic, ...), so later lanes filter by the books in `sourcebooks/content_inventory.md`.

**`src/services/contentChunks.ts`:** `loadChunked<T>(lane, sources?)` loads `src/data/content/<lane>/*.json` lazily through `import.meta.glob`: one chunk per source, fetched once (concurrent requests share the fetch), failed loads retried, unknown sources rejected. `createChunkLoader` is the testable core (`contentChunks.test.ts`). No lane uses it yet.

**Size guard fixed:** `.size-limit.js` was not valid config (`npm run size-limit` failed). It now checks two files without the headless-browser timing:

| Bundle | Limit | Now (gzip) |
|---|---|---|
| App entry `index-*.js` | 500 KB | 234.6 KB |
| Static game data `dataService-*.js` (species, spells, SRD monsters, ...) | 520 KB | 458.8 KB |

The static data has about 60 KB of gzip headroom. Feats and backgrounds fit; the spells rebuild (step 4) probably needs to move spells to lazy chunks or replace, not add to, the current 1 MB spell file; magic items and monsters must be chunked.

## Step 2 notes (done)

**Generator:** `python3 sourcebooks/build_feats.py` writes a conflict report against the current app data; `--apply` writes `src/data/feats.json`, the description chunks `src/data/content/feats/<SOURCE>.json` (17 sources) and the 2024 `originFeat` refs in `src/data/backgrounds.json`. It reads the mirror's `feats.json` (293 feats from the inventory books; DSotDQ, WoW, PSK and PSX are excluded).

**Result:** 302 records: 102 for 2014 (all `general`) and 200 for 2024 (origin 38, general 94, fighting_style 13, epic_boon 32, dragonmark 13, dark_gift 9, plus the hand-kept `versatile`). Gap report: feats went from 195 missing to 1. That one is the 2024 "Ability Score Improvement" feat, skipped on purpose because the app's ASI slot already covers it. The 10 app-only entries are the Magic Initiate and Strike of the Giants versions plus Versatile.

**Decisions:**

- Slugs: 2014 feats use the plain slug, 2024 feats use `<slug>-2024`. Versions become their own records (`magic-initiate-cleric-2024`, `strike-of-the-giants-fire`). Acolyte gets the Cleric version and Sage the Wizard version, as in the book. `dwarf-fortitude` is renamed `dwarven-fortitude` (the book's name); `resolveFeatSlug(slug, edition)` maps old slugs and plain slugs on 2024 characters, so saved characters keep working.
- Categories map from the 5etools codes: O origin, G general, EB epic_boon, FS* fighting_style, D dragonmark, DG dark_gift. 2014 feats have no category in the books and are all `general`.
- An ASI slot offers General, Origin and Dragonmark feats (Eberron: a Dragonmark feat can be taken at any feat choice), and Epic Boons from level 19. Dark Gift feats are not offered in any picker yet; the book gives them through backgrounds or with DM permission, so step 3 wires them.
- Prerequisites are structured (`prerequisites.anyOf`: OR across groups, AND inside a group) and checked by `getFeatAvailability`. Species match by name words of the species, variant and lineage, so Hill Dwarf is a Dwarf, a Drow is an Elf (Drow), and Half-Elf is not an Elf. Campaign and "other" prerequisites are shown, not enforced; unknown class features and tool proficiencies do not block.
- Mechanics come from the structured fields only (`ability`, `skillProficiencies`, `resist`, `senses`, `savingThrowProficiencies`, ...), except this hand table in `HAND_GRANTS` for effects stated only in text that the app models:

| Feat | Grant |
|---|---|
| Alert (2014) | +5 initiative |
| Alert (2024) | Proficiency bonus to initiative |
| Mobile (2014), Speedy (2024) | +10 ft speed |
| Squat Nimbleness (2014) | +5 ft speed |
| Boon of Speed (2024) | +30 ft speed |
| Tough (2014, 2024) | +2 HP per level |
| Dragon Hide (2014) | Natural armor 13 + DEX |

- Descriptions are lazy chunks (`loadFeatDescription`, `useFeatDescription`, `<FeatDescription>`); the static data holds names, prerequisites, benefits and grants. Static data: 458.8 KB to 472.9 KB gzip (limit 520 KB).
- Feat grants share the species grant engine (`applyTraitGrant`, `ResolvedGrants`). They are applied at creation (`calculateCharacterStats`: ability increases, HP, speed, initiative, proficiencies, expertise, languages, resistances, immunities, saving throws, senses) and at level-up (`applyFeatGrants`). Picks are stored in `featChoices[slug]` and made in `FeatChoiceModal` (Origin Feat in Step 1, Step 5.5, the cumulative ASI step and level-up).
- New `Character` fields: `damageImmunities`, `savingThrowProficiencies`.

**Text-only (flags):**

- Expertise choices (Boon of Skill, Echoing Soul, Prodigy, Skill Expert): fixed expertise is applied, chosen expertise is not.
- Skilled's "skill or tool" picks are left to the existing class step; Weapon Master's weapon picks are text.
- Feat spells (`additionalSpells`: Magic Initiate, Fey Touched, Dragonmarks, ...) are not wired; step 4 adds them on top of the rebuilt spell data.
- Senses take the larger range. "If you already have Darkvision, its range increases by 60 feet" (Keenness of the Stone Giant) is kept as a note on the grant, not added to the existing range.
- All other per-feat effects (reactions, advantage, extra damage) stay as benefit text, as before.

Tests: `src/data/feats.integrity.test.ts` (unique slugs, edition and slug suffix, categories, text present inline or in a chunk, valid abilities and skills, prerequisite and background feat refs resolve to a feat of the same edition; species refs are in `speciesData.integrity.test.ts`), `src/utils/featUtils.test.ts` (prerequisites) and `src/utils/featGrantUtils.test.ts` (slug resolution, grants, picks, caps, creation and level-up).

## Step 3 notes (done)

**Generator:** `python3 sourcebooks/build_backgrounds.py` (from `sourcebooks/`) writes a conflict report; `--apply` writes `src/data/backgrounds.json` and the flavor chunks `src/data/content/backgrounds/<SOURCE>.json`. It reads the mirror's `backgrounds.json` and `fluff-backgrounds.json`, inventory books only.

**Result:** 146 records, 72 for 2014 and 74 for 2024. 9 have a skill choice, 54 a tool choice, 86 a feat. Gap report: backgrounds went from 24 present / 122 missing to 146 present / 0 missing, with 0 app-only. Static game data: 472.9 KB to 512.3 KB gzip (limit 520 KB). Full fluff and personality tables stay in the chunks (`loadBackgroundFlavor`); the static file keeps a short description and the feature text, because creation copies the feature onto the character immediately.

**Decisions:**

- Slugs: 2014 is the plain slug, 2024 is `<slug>-2024`. The 2024 PHB background is Artisan, so the old `guild-artisan-2024` record is `artisan-2024`; `getBackground` still accepts `guild-artisan-2024`. The 2024 PHB has no Outlander, so the hand-written `outlander-2024` was dropped. Tough's origin feat is on `farmer-2024` (also Flaming Fist Mercenary and Rashemi Wanderer).
- Ability choices stay `{ choose: 2, from: [...] }` (+2/+1 or +1/+1/+1). Entertainer 2024 is STR, DEX, CHA. Artisan 2024 is STR, DEX, INT.
- Fixed skills and tools stay on the record. Picks live on creation data (`backgroundSkills`, `backgroundTools`, `backgroundToolPackage`, `backgroundFeat`) and become `character.skills`, `character.proficiencies.tools`, and `character.originFeat`. No new `Character` field. A chosen feat is granted in both editions, so 2014 backgrounds such as Strixhaven and Rewarded apply their feat. House Agent (ERLW) stores one tool block per dragonmarked house in `toolPackages` (13 houses; Orien matches Deneith).
- One feat is `originFeat`. Several feats, or a feat or a Dark Gift, are `originFeatOptions`. Haunted One (RHW) and the other Ravenloft and Planescape backgrounds that say "or a Dark Gift" offer Survivor (or their named feat) plus the nine Dark Gift feats. Dragonmark heirs grant the matching dragonmark feat.
- Languages: "any standard" is the existing "One of your choice" / "Two of your choice". A restricted list is `languageChoices`. Step 9 counts those choices for both editions. 2024 PHB backgrounds grant none, so their count stays 0.
- Equipment names that exist in `equipment.json` are stored as that name. A line that is only "N gp" becomes `currency.gp`. Option A is the default gear; option B is 50 gp for every background that offers it. A small either-or (prayer book or prayer wheel, 13 backgrounds) keeps both options and includes the first one in the default gear.
- Step 1 lists every background for the selected edition, sorted by name, and blocks Next until skill, tool, package, and feat picks are made. The class step treats chosen background skills as already granted.

**Text-only (flags), 21 plus 112 gear lines:**

- `additionalSpells` on the ten Ravnica guilds and five Strixhaven students are expanded spell lists. Step 4 stores them as `expandedSpells` and adds them to that character's class list.
- Boros Legionnaire, Golgari Agent, Izzet Engineer, and Selesnya Initiate have a language list that includes "other", so the choice is any language.
- Custom Background's language-or-tool swap is text. It still grants two skills of your choice and two languages of your choice.
- Urban Bounty Hunter chooses 2 of "Gaming Set", "Musical Instrument", and "Thieves' Tools". The pick is the category, not one item from the category.
- 112 equipment lines have no match in `equipment.json` (insignia, trinkets, "dark common clothes including a hood", and similar). They stay as text on the background and become placeholder inventory items, which the equipment step already does for unknown names.

Tests: `src/data/backgrounds.integrity.test.ts` (unique slugs, edition suffix, text, skill names, feat refs, the core 2024 origin feats, the artisan alias) and `src/utils/backgroundGrants.test.ts` (fixed skills, skill and tool choices, Sleight of Hand, a chosen Dark Gift, pocket money). `feats.integrity.test.ts` now checks that a background feat matches the background's edition; the core 2024 backgrounds still require category `origin`.

## Step 4 notes (done)

**Generator:** `python3 sourcebooks/build_spells.py` (from `sourcebooks/`) writes a report; `--apply` rewrites `src/data/srd/5e-SRD-Spells-Merged.json`, the text chunks `src/data/content/spells/<SOURCE>.json`, and `expandedSpells` on the 15 guild and college backgrounds. It reads the mirror's `spells/spells-*.json` and `spells/sources.json`, inventory books only.

**Result:** 963 spells, 519 for 2014 and 444 for 2024. Gap report: spells went from 655 present / 288 missing to 963 present / 0 missing, with 0 app-only. Static game data: 512.3 KB to 364.2 KB gzip (limit 520 KB), because the descriptions left the static bundle. Full text loads through `loadSpellText` / `SpellBlurb`.

**Decisions:**

- Edition is the printing book's publication date. A spell printed in both PHB and XPHB is two records. A spell printed only in Xanathar's or Tasha's stays 2014, so a 2024 wizard does not see Absorb Elements.
- Slugs that saved characters already use are kept. 2024 spells stay unsuffixed (`fireball`, `thaumaturgy`). The 2014 copy of a spell that also exists in 2024 keeps `-2014`. SRD short names keep their old slug and take the book name: Acid Arrow is Melf's Acid Arrow, Arcane Hand is Bigby's Hand, Arcane Sword is Mordenkainen's Sword, and the same for the other "wizard's spell" shortenings.
- Class lists come from `spells/sources.json` (`class` and `classVariant`), and only for a class book of the same edition. Artificer is TCE on 2014 records and EFA on 2024 records. Setting classes (Mage, Priest, Evoker) are left off. 124 spells are also named on a class list of the other edition; that grant stays off the record, so the editions do not mix.
- Creation (Step 4) asks for the character's edition. A background `expandedSpells` list is added on top of the class list there and at level-up. 186 existing class lists changed to match the books.
- 16 spells have no entry in `sources.json`. The 15 Explorer's Guide to Wildemount dunamancy spells are the Chronurgy and Graviturgy expanded lists (`all source=EGW`), which is subclass data for step 5. Encode Thoughts (GGR) is the same kind of gap.

**Text-only (not wired):**

- Feat `additionalSpells` (Magic Initiate, Fey Touched, Dragonmarks, and the rest) are still benefit text. They are "choose a spell from a list" filters, not a fixed spell, so they need a picker.
- Species innate spells (Marks, Legacy of X, Hexblood, Khoravar) are still text. Follow-up, as the plan allows.

Tests: `src/data/spells.integrity.test.ts` (963 records, saved slugs, chunk text, class slugs, Absorb Elements on the 2014 wizard list only, Azorius Command added for a guild wizard). `dataService.test.ts` still checks both editions of Fireball and the unsuffixed legacy slugs.

## Step 5 notes (done)

**Generator:** `python3 sourcebooks/build_subclasses.py` (from `sourcebooks/`) writes a report; `--apply` writes `src/data/subclasses.json`, regenerates `src/data/subclassFeaturesByLevel.json`, and replaces `src/data/srd/2024/5e-SRD-Subclasses.json` (the old file was placeholder text and was not imported). `loadSubclasses` reads the new catalog. The year files under `src/data/srd/` stay on disk; the app no longer loads them.

**Result:** 193 subclasses, 117 for 2014 and 76 for 2024. Gap report: subclasses went from 140 present / 10 other-edition / 1 fuzzy / 42 missing to 193 present / 0 missing. The fuzzy Necromancer match is gone: the 2024 record is named Necromancer (`necromancer-2024`) and the 2014 school stays School of Necromancy (`necromancy`).

**Decisions:**

- A subclass is kept when its source book is in the inventory. Copies that repeat a book record of the same name, class, and edition are dropped (the PHB school copied onto the 2024 wizard, the TCE artificer copied onto EFA). The 2024 record is the native XPHB, EFA, AU, or RHW printing. Edition is the source book's publication date.
- Saved slugs stay. Berserker, Life, Lore, Evocation, Battle Master, Chronurgy Magic, and the other existing 2014 records keep their slugs. A 2024 twin is `<slug>-2024`. Creation, the character-sheet subclass modal, and random class picks list only the character's edition. Level-up already did. The subclass unlock level comes from the earliest feature (2014 cleric 1, 2014 wizard 2, most others 3).
- Feature text is the resolved book entries. `ChooseSubclassModal` and the rules-engine subclass effects read `subclassFeaturesByLevel.json`, still keyed by class and the saved slug. Valor still grants Extra Attack at 6. A reference to an optional feature (the Battle Master maneuvers, and the same pattern elsewhere) is listed by name. The maneuver rules themselves are step 6a.
- Named subclass spells become slugs of that edition. Life Domain grants bless and cure wounds at level 1, and the rest of the domain list at the printed levels. At creation those spells are added to prepared spells, spells known, or the wizard's spellbook once the character has reached that level. Chronurgy Magic and Graviturgy Magic expand the 2014 wizard list with the 15 Explorer's Guide to Wildemount dunamancy spells. The creation spell step, level-up, and the spell-preparation modal all include a subclass's expanded and granted spells.
- A filter that means "any spell of this level from the class list" (75 of them) is already the class list, so it is not copied onto the subclass. A "choose N spells" filter (96 of them) is still text.

**Text-only (flags):**

- Circle of the Land (2014, eight lands; 2024, four lands), Divine Soul (Good, Evil, Law, Chaos, Neutrality), the Genie (Dao, Djinni, Efreeti, Marid), and Vestige Patron (Life, Light, Trickery, War) are a choice of one list. Every list is available to that subclass. None of them is added automatically.
- Optional-feature references are names only. Invocations, maneuvers, and metamagic rules are step 6a.
- Encode Thoughts (GGR) still has no class or subclass list. The dunamancy spells now reach a Chronurgy or Graviturgy wizard.

## Step 6a notes (done)

**Generator:** `python3 sourcebooks/build_optional_features.py` (from `sourcebooks/`) writes a report; `--apply` writes `src/data/optionalFeatures.json` and `src/data/optionalFeatureProgression.json`. The rules live in `src/utils/optionalFeatures.ts`. No picker in this step.

**Result:** 221 optional features, 151 for 2014 and 70 for 2024. Gap report: this lane went from 6 present / 1 fuzzy / 214 missing to 221 present / 0 missing. Thrown Weapon Fighting is its own record. Defense and the other fighting styles already saved on characters keep those slugs. A 2024 reprint is `<slug>-2024` (`agonizing-blast-2024`).

**Decisions:**

- The catalog is every inventory optional feature: invocations, metamagic, maneuvers, elemental disciplines, infusions, arcane shots, runes, pact boons, fighting styles, and the four Eberron house-renown rewards. WoW is not in the inventory, so those 12 records are left out.
- `knownByLevel` is the running total from that class or subclass table (index 0 is level 1). A subclass row adds to the class row, so a 2014 champion knows 2 fighting styles at level 10 and a battle master knows 3 maneuvers at level 3, 5 at level 7. `optionalFeatureAllowance` and `optionalFeaturePicksAtLevel` are what the next step's picker should call.
- `Character.optionalFeatures` holds the slugs. Level-up stores `optionalFeaturesChosen` onto that list, and a fighting style chosen on the existing step is stored there too. Creation does the same for a fighting style or invocation slug that exists in the catalog. Skills and senses on the record are applied (Beguiling Influence, Blind Fighting). Everything else in the description stays text.
- Four Elements includes Elemental Attunement in its count of 2 at level 3. Superior Technique grants one maneuver while that fighting style is selected.

**Text-only (flags):**

- 9 "choose a spell" filters, including the 2024 Agonizing Blast rule "a warlock cantrip that deals damage".
- Maddening Hex and Relentless Hex require hex or Hexblade's Curse. The stored prerequisite is `hex-2014`. The curse is a class feature, not a spell.
- Lessons of the First Ones grants one origin feat. The feat picker is separate.
- The four EFA house-renown rewards have no level table. Eberron "Plans Known" is a class-table column, not an optional feature.
- 2024 Fighter, Paladin, and Ranger fighting styles are feats (the feats lane). This catalog does not give them a second count.
- Invocation and infusion spells are stored on the feature (`armor-of-shadows` grants `mage-armor-2014`). They are not added to the spellbook yet.
- 25 records are marked class-feature variants. They are in the catalog; their rules are the description.

## Step 6b notes (done)

**Picker:** creation step 7 and a level-up step after subclass. Both use `optionalFeatureAllowance` and `optionalFeaturePicksAtLevel`. No new `Character` field. `CharacterCreationData.optionalFeatures` holds the slugs during creation. `LevelUpData.optionalFeaturePicks` is the flag that adds the level-up step.

**Behavior:**

- Creation shows the step when the character already knows at least one option at the level being created. A level 1 fighter picks a fighting style. A level 1 paladin skips the step. A level 1 2024 warlock picks one invocation. A battle master created at level 3 picks the styles and the maneuvers together.
- The step stores slugs. `fightingStyle`, `selectedFightingStyle`, and `eldritchInvocations` stay in sync when that group is on the step. The 2024 class-step invocation list is hidden, so a warlock picks invocations once.
- Required options start selected. Elemental Attunement fills one of the four-elements picks. Selecting Superior Technique adds one maneuver to the same screen.
- Level, class, pact, and already-chosen feature prerequisites block a card. Pact of the Blade selected on the same screen unlocks Thirsting Blade. Spell, item, and renown prerequisites are printed on the card.
- Level-up asks for the increase at the new level, after the subclass step, and uses the subclass chosen in that same wizard. The first fighting style is written to `fightingStyle`. A later style stays in `optionalFeatures`.
- The character sheet lists the chosen names under Class Options.

**Text-only (flags):**

- Spell, item, and renown prerequisites are shown on the card and do not block the pick.
- 2024 fighting styles stay on the class step at creation and on the existing level-up fighting-style step. They are feats, and this picker does not open the feat list.
- Lessons of the First Ones still does not open the feat picker.
- Invocation and infusion spells stay on the feature record. They are not added to the spellbook.
- A 2014 level-up offers subclass options when that subclass is already on the character. Creating the character at the higher level is how the full list is chosen. The 2024 level-up asks for the subclass first, then the options that subclass grants.

**Gates:** tsc has the pre-existing `SpellbookManager.tsx` `favoriteSlugs` error only. Lint clean. Vitest 634 passed. Build succeeded. Size-limit: app entry 399.92 KB gzip of 500, static game data 396.47 KB gzip of 520. The wizard was not clicked through. Catalog unchanged at 221 records (151 for 2014, 70 for 2024). Gap report unchanged.

## Step 7a notes (done)

**Generator:** `python3 sourcebooks/build_magic_items.py` (from `sourcebooks/`) writes a report; `--apply` writes `src/data/magicItems.json` and one lazy chunk per book at `src/data/content/magic-items/<SOURCE>.json`. `loadMagicItems()`, `loadMagicItemIndex()`, and `getMagicItem()` are in `src/services/magicItems.ts`. The `MagicItem` type is on `src/types/dnd.ts`.

**Result:** 1,352 magic items, 820 for 2014 and 532 for 2024, in 28 source chunks. Gap report for this lane: 153 present / 164 other-edition / 37 fuzzy / 1,889 missing became 1,503 present / 161 other-edition / 20 fuzzy / 559 missing. Every catalog name is present. The catalog has no description (479 KB). The book text is in the chunks (1.5 MB) and stays out of the measured bundles.

**Decisions:**

- A record is one `item` from `items.json` whose source is in the inventory and whose rarity is not `none`. 667 rarity-none rows (gear, gems, art, vehicles) stay out. Mundane gear remains `equipment.json`. 586 rows from books outside the inventory stay out.
- 2014 keeps the plain slug (`ring-of-protection`). A 2024 reprint is `<slug>-2024`. A name that starts with `+1` is `plus-1-...`. Within an edition the newest printing wins and the others are listed on `sources`.
- Structured fields are stored as numbers and lists: rarity, attunement, charges, AC and attack and save bonuses, ability score set or bonus, resistances, movement, the equipment index of `baseItem`, and spell indexes the item can cast. Ring of Protection is +1 AC and +1 to saves. Amulet of Health sets Constitution to 19. Belt of Dwarvenkind is +2 Constitution and poison resistance.
- Adding an item to inventory and tracking attunement are step 7b. `EquippedItem.attuned` is already on the character.

**Text-only (flags):**

- Book of Vile Darkness and Deck of Many Things, in both editions, ask for an ability score increase. That choice stays in the description.
- Curse and sentient items store the boolean. The curse's rules stay in the description.
- A generic "+1 weapon" or "+1 armor" table is not expanded into every mundane weapon. Named magic weapons and armor are records. Item groups such as Absorbing Tattoo and Spell Scroll are containers; each member is its own record.
- The 559 names still missing are mundane rows that are not in `equipment.json` (gems, art objects, vehicles, poisons, trinkets). The 161 other-edition rows are 2024 gear; `equipment.json` is still matched as 2014. The 20 fuzzy rows are plural mismatches such as Arrow and Arrows.

**Gates:** `tsc` is clean. Lint clean. Vitest 636 passed. Build succeeded. Size-limit unchanged: app entry 399.92 KB gzip of 500, static game data 396.47 KB gzip of 520. DMG and XDMG text are separate chunks (363 KB and 373 KB raw) and are not in those two bundles. No inventory screen was added.

## Mundane gear pass (done)

Step 7a did not transfer every equipment row. It skipped rarity `none`. After that pass the Magic Items lane was 1,503 present / 161 other-edition / 20 fuzzy / 559 missing, and every missing or fuzzy name was mundane.

**Generator:** `python3 sourcebooks/build_mundane_gear.py` (from `sourcebooks/`) writes a report; `--apply` writes `src/data/mundaneGear.json`. `loadEquipment()` appends those records after the 2024 PHB gear in `equipment.json`.

**Result:** 730 equipment records, 475 from 2014 and 255 from 2024. The lane is now 2,243 present / 0 other-edition / 0 fuzzy / 0 missing. `equipment.json` is matched as 2024, which is the year `loadEquipment()` already assigns it. The 161 other-edition rows were that gear. The 2014 printing of the same names is a separate record (`longsword-2014`). Book names that differed from the SRD label (Arrow beside Arrows, Playing Card Set beside Playing Cards) are their own records. The old SRD labels stay so existing slugs still resolve; 34 of those labels are app-only because the books use different wording.

**What is stored:** cost, weight, weapon damage and properties, armor class, and vehicle AC, HP, speed, crew, passengers, and cargo, when the source record has those fields. Everything else is the book's text. A row with no text gets a one-line stat summary from those fields. Spiked Armor is the one rarity-unknown row; it is medium armor, AC 14. A 2024-only name keeps a plain slug. A 2024 twin of a slug already in use is `<slug>-2024`.

**Gates:** `tsc` clean. Lint clean. Vitest 637 passed. Build succeeded. Size-limit: app entry 399.91 KB gzip of 500, static game data 455.61 KB gzip of 520. The equipment browser was not clicked through. Inventory add and attunement remain step 7b.

## Step 7b notes (done)

**What changed:** The inventory can hold a magic item. A row stores `magicItemSlug` and uses `equipmentSlug` `magic:<slug>`, so it does not stack with mundane gear. The Magic Item button searches the catalog (two letters, edition, rarity) and adds the item. The row opens the book text from that item's source chunk. Attune and End use a slot. A character has 3 slots. An artificer has 4 at level 10, 5 at level 14, and 6 at level 18 (Magic Item Adept, Savant, and Master).

**Bonuses that change the sheet:** `bonusAc` is added to armor class while the item is attuned, or while it is carried when it does not require attunement. `bonusSavingThrow` is added to every saving throw on the same terms. Ring of Protection is +1 AC and +1 to saves only while attuned.

**Shown on the item, not written into other scores:** ability score set or bonus (Amulet of Health still says Constitution becomes 19), resistances, immunities, weapon and spell bonuses, charges, and the curse or sentient flag. The attack roller does not yet know which weapon is the magic weapon.

**Gates:** `tsc` clean. Lint clean. Vitest 642 passed. Build succeeded. Size-limit unchanged: app entry 399.92 KB gzip of 500, static game data 455.61 KB gzip of 520. The catalog loads as its own chunk and stays out of those two bundles. The inventory screen was not clicked through.

## Step 8a notes (done)

**What changed:** `sourcebooks/build_monsters.py` turns each inventory bestiary file into the existing `Monster` shape. `_copy` resolves against the full bestiary, so a parent from a book we do not ship still fills in. Only inventory sources are written. Versions such as Battle Familiar (Brute) are their own records. Reprints collapse by name and edition; the newest printing wins and the others stay in `sources`. 2014 slugs reuse the SRD index when the name matches (`aboleth`, `goblin`). Every 2024 slug ends in `-2024` (`aboleth-2024`).

**Output:** 2414 creatures (1646 from 2014, 768 from 2024) in 34 source chunks under `src/data/content/monsters/`, plus a slim `src/data/monsterIndex.json`. `src/services/monsters.ts` loads the index and one book at a time. `dataService.ts` still serves the 2014 SRD list. The monster library is unchanged until 8b.

**Spot checks:** Aboleth (MM) is slug `aboleth`, 135 hp, AC 17, CR 10, swim 40 ft., Tentacle attack bonus 9, with Lair Actions and Regional Effects stored as special abilities. Aboleth (XMM) is slug `aboleth-2024`, 150 hp.

**Flags:** No unsupported `_mod` modes (`addSpells` is handled). 134 creatures have no printed challenge rating (summons and variable blocks such as Aberrant Spirit, Animated Object, Avatar of Death, and Battle Familiar). Those are stored at CR 0 and 0 XP. Two reprints disagree on challenge and the newer book is kept: Shadow Mastiff Alpha is CR 3 (MPMM; VGM was 2) and Stench Kow is CR 1/2 (MPMM; VGM was 1/4).

**Gap report:** Monsters are 2239 present, 0 missing, 0 other-edition, 0 fuzzy, 238 reprints, 169 app-only. The app-only rows are version stat blocks the inventory lists under the base name.

**Gates:** `tsc` clean. Lint clean. Vitest 644 passed (60 files). Build succeeded. Size-limit unchanged: app entry 399.92 KB gzip of 500, static game data 455.61 KB gzip of 520. The book chunks stay out of those two bundles (MM about 1.3 MB raw, XMM about 900 KB, MPMM about 700 KB). The monster library was not switched over and was not clicked through.

## Step 8b notes (done)

**What changed:** The monster library lists the catalog (2,414 creatures) instead of the 2014 SRD file, so a reprinted name appears once per edition. Aboleth (2014, MM) and Aboleth (2024, XMM) are separate cards. The list reads `monsterIndex.json` (hit points, AC, speed, ability scores, and ability names). Opening a stat block, or opening an encounter, loads that creature's book chunk. The grid shows 60 cards at a time.

**Filters:** Both editions, 2014, or 2024, plus a source-book menu. SRD Only keeps the 2014 SRD slugs. Custom Only still shows custom monsters on their own. A card and the stat block show the edition and the book title. Share links use the catalog slug (`aboleth` and `aboleth-2024`). An older name link such as `/monster/aboleth` still opens the 2014 creature.

**Gates:** `tsc` clean. Lint clean. Vitest 650 passed (61 files). Build succeeded. Size-limit: app entry 401.51 KB gzip of 500, static game data 455.61 KB gzip of 520. The index is its own chunk (about 1.2 MB minified) and the book chunks stay out of those two bundles. The library was not clicked through.

## Step 9 notes (done)

**Gap report:** Regenerated with `python3 sourcebooks/build_gap_report.py`. Counts are unchanged from step 8b.

| Lane | Unique | Present | Missing |
|---|---|---|---|
| Species | 159 | 139 | 20 |
| Backgrounds | 146 | 146 | 0 |
| Feats | 293 | 292 | 1 |
| Classes | 29 | 26 | 3 |
| Subclasses | 193 | 193 | 0 |
| Optional class features | 221 | 221 | 0 |
| Spells | 963 | 963 | 0 |
| Magic items | 2243 | 2243 | 0 |
| Monsters | 2239 | 2239 | 0 |

**Still missing, on purpose or deferred:** the eight 2014 DMG monstrous species (Bullywug, Gnoll, Grimlock, Kuo-Toa, Merfolk, Skeleton, Troglodyte, Zombie) and twelve older variant rows (Yuan-ti Pureblood, Aasimar Fallen/Protector/Scourge, Elf (Drow), Gith, Gnome (Deep/Svirfneblin), four SCAG half-elf descents, Tiefling (Variant; Infernal Legacy)). The 2024 Ability Score Improvement feat is the wizard's ASI step. The three missing classes are the Tasha's sidekicks.

**Docs:** `CLAUDE.md` now describes the catalogs, the lazy chunks, and the size limits. `README.md`, `docs/character-creation.md`, `docs/character-sheet.md`, and `docs/monster-library.md` match the wizard, attunement (3 slots, artificer 4/5/6), and the monster catalog.

**Gates:** `tsc` clean. Lint clean. Vitest 650 passed (61 files). Build succeeded. Size-limit unchanged: app entry 401.51 KB gzip of 500, static game data 455.61 KB gzip of 520. No screen was clicked through.

## DMG monstrous species (done)

The eight 2014 DMG species are in the expanded list: Bullywug, Gnoll, Grimlock, Kuo-Toa, Merfolk, Skeleton, Troglodyte, and Zombie. Ability modifiers are the NPC Features table, including the penalties. Kuo-Toa and Merfolk have none. `SHOW_MONSTROUS_PLAYER_SPECIES` in `src/data/contentFlags.ts` is on. Turning it off removes them from the creation lists; a saved character still resolves.

**Gap report:** Species 159 unique, 147 present, 12 missing. The 12 missing rows are older names already playable on another record. Other lanes are unchanged.

**Gates:** `tsc` clean. Lint clean. Vitest 654 passed (62 files). Build succeeded. Size-limit: app entry 402.37 KB gzip of 500, static game data 456.61 KB gzip of 520. No screen was clicked through.
