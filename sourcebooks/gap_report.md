# Content Gap Report

Cross-reference of `content_inventory.json` against the app's current data. Books published on or after 2024-09-01 are treated as 2024 rules; earlier books as 2014.

## Edition assignment by book

**2014:** Acquisitions Incorporated (AI); Astral Adventurer's Guide (AAG); Bigby Presents: Glory of the Giants (BGG); Boo's Astral Menagerie (BAM); Dungeon Master's Guide (2014) (DMG); Eberron: Rising from the Last War (ERLW); Explorer's Guide to Wildemount (EGW); Fizban's Treasury of Dragons (FTD); Guildmasters' Guide to Ravnica (GGR); Minsc and Boo's Journal of Villainy (MABJOV); Monster Manual (2014) (MM); Monstrous Compendium Volume 1: Spelljammer Creatures (MCV1SC); Monstrous Compendium Volume 4: Eldraine Creatures (MCV4EC); Mordenkainen Presents: Monsters of the Multiverse (MPMM); Mordenkainen's Tome of Foes (MTF); Morte's Planar Parade (MPP); Mythic Odysseys of Theros (MOT); Player's Handbook (2014) (PHB); Sigil and the Outlands (SATO); Strixhaven: A Curriculum of Chaos (SCC); Sword Coast Adventurer's Guide (SCAG); Tasha's Cauldron of Everything (TCE); The Book of Many Things (BMT); Van Richten's Guide to Ravenloft (VRGR); Volo's Guide to Monsters (VGM); Xanathar's Guide to Everything (XGE)

**2024:** Arcana Unleashed (AU); Astarion's Book of Hungers (ABH); Dungeon Master's Guide (2024) (XDMG); Eberron: Forge of the Artificer (EFA); Forgotten Realms: Adventures in Faerûn (FRAIF); Forgotten Realms: Heroes of Faerûn (FRHOF); Lorwyn: First Light (LFL); Monster Manual (2025) (XMM); Netheril's Fall (NF); Player's Handbook (2024) (XPHB); Project_Lamordia (PL); Ravenloft: The Horrors Within (RHW)

## Data issues found in the app

- `5e-SRD-Spells-Merged.json` has 963 spells tagged by source as {'2014': 519, '2024': 444}.
- Magic items are read from `magicItems.json` (one record per name and edition). `equipment.json` is the 2024 PHB gear (`loadEquipment` sets year 2024). Other mundane rows, including the 2014 printing of that gear, are in `mundaneGear.json`.
- Monsters are read from `monsterIndex.json` (one record per name and edition) plus the 2014 SRD file.
- Optional class features are read from `optionalFeatures.json`. 2024 fighting styles are feats, so they stay in the feats lane.

## Summary

| Lane | Unique entries | Present | Other edition only | Fuzzy | Missing | Multi-book reprints | App-only |
|---|---|---|---|---|---|---|---|
| Species / Races | 159 | 147 | 0 | 0 | 12 | 21 | 32 |
| Backgrounds | 146 | 146 | 0 | 0 | 0 | 0 | 0 |
| Feats | 293 | 292 | 0 | 0 | 1 | 0 | 10 |
| Classes | 29 | 26 | 0 | 0 | 3 | 0 | 0 |
| Subclasses | 193 | 193 | 0 | 0 | 0 | 0 | 0 |
| Optional Class Features (invocations, maneuvers, metamagic, etc.) | 221 | 221 | 0 | 0 | 0 | 0 | 0 |
| Spells | 963 | 963 | 0 | 0 | 0 | 0 | 0 |
| Magic Items | 2243 | 2243 | 0 | 0 | 0 | 4 | 34 |
| Monsters | 2239 | 2239 | 0 | 0 | 0 | 238 | 169 |

## Species / Races

159 unique entries (after collapsing same-name reprints within an edition): 147 present, 0 only in the other edition, 0 fuzzy, 12 missing.

### Appears in multiple books within the same edition — pick one canonical source

- [2014] Aarakocra: DMG, MPMM
- [2014] Aasimar: DMG, MPMM, VGM
- [2014] Bugbear: ERLW, MPMM, VGM
- [2014] Centaur: GGR, MOT, MPMM
- [2014] Changeling: ERLW, MPMM
- [2024] Elf: LFL, XPHB
- [2014] Elf (Eladrin): DMG, MTF
- [2014] Firbolg: MPMM, VGM
- [2014] Gnome (Deep): DMG, MTF
- [2014] Goblin: DMG, ERLW, GGR, MPMM, VGM
- [2014] Goliath: MPMM, VGM
- [2014] Hobgoblin: DMG, ERLW, MPMM, VGM
- [2014] Kenku: DMG, MPMM, VGM
- [2014] Kobold: DMG, MPMM, VGM
- [2014] Lizardfolk: DMG, MPMM, VGM
- [2014] Minotaur: GGR, MOT, MPMM
- [2014] Orc: DMG, EGW, ERLW, MPMM, VGM
- [2014] Satyr: MOT, MPMM
- [2014] Shifter: ERLW, MPMM
- [2014] Tabaxi: MPMM, VGM
- [2014] Triton: MOT, MPMM, VGM

### In the app but not matched by any inventory entry

Abyssal Tiefling, Aquatic Elf Descent (Swim Speed), Chthonic Tiefling, Cloud Giant Ancestry, Craftiness, Darkvision, Defiance, Draconic Sorcery, Drow (Dark Elf), Drow Descent (Drow Magic), Drow Lineage, Fire Giant Ancestry, Forest Gnome Lineage, Frost Giant Ancestry, High Elf Lineage, Hill Giant Ancestry, Infernal Legacy (variant), Infernal Tiefling, Moon or Sun Elf Descent (Cantrip), Moon or Sun Elf Descent (Weapon Training), Necrotic Shroud, Radiant Consumption, Radiant Soul, Rock Gnome Lineage, Skill Proficiency, Standard Human, Stone Giant Ancestry, Storm Giant Ancestry, Wood Elf Descent (Fleet of Foot), Wood Elf Descent (Mask of the Wild), Wood Elf Descent (Weapon Training), Wood Elf Lineage

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Backgrounds

146 unique entries (after collapsing same-name reprints within an edition): 146 present, 0 only in the other edition, 0 fuzzy, 0 missing.

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Feats

293 unique entries (after collapsing same-name reprints within an edition): 292 present, 0 only in the other edition, 0 fuzzy, 1 missing.

### In the app but not matched by any inventory entry

Magic Initiate (Cleric), Magic Initiate (Druid), Magic Initiate (Wizard), Strike of the Giants (Cloud), Strike of the Giants (Fire), Strike of the Giants (Frost), Strike of the Giants (Hill), Strike of the Giants (Stone), Strike of the Giants (Storm), Versatile

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Classes

29 unique entries (after collapsing same-name reprints within an edition): 26 present, 0 only in the other edition, 0 fuzzy, 3 missing.

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Subclasses

193 unique entries (after collapsing same-name reprints within an edition): 193 present, 0 only in the other edition, 0 fuzzy, 0 missing.

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Optional Class Features (invocations, maneuvers, metamagic, etc.)

221 unique entries (after collapsing same-name reprints within an edition): 221 present, 0 only in the other edition, 0 fuzzy, 0 missing.

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Spells

963 unique entries (after collapsing same-name reprints within an edition): 963 present, 0 only in the other edition, 0 fuzzy, 0 missing.

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Magic Items

2243 unique entries (after collapsing same-name reprints within an edition): 2243 present, 0 only in the other edition, 0 fuzzy, 0 missing.

### Appears in multiple books within the same edition — pick one canonical source

- [2014] Deck of Many Things: BMT, DMG
- [2024] Prosthetic Limb: FRHOF, XDMG
- [2014] Shawm: PHB, SCAG
- [2014] Trinket: AI, PHB

### In the app but not matched by any inventory entry

Alms Box, Arrows, Blowgun Needles, Bolts, Bottle, Glass, Bullets, Firearm, Bullets, Sling, Case, Crossbow Bolt, Case, Map or Scroll, Censer, Clothes, Fine, Clothes, Traveler's, Crossbow Bolts, Dice, Dragonchess, Holy Symbol, Horse, Incense (block), Lantern, Bullseye, Lantern, Hooded, Needles, Parchment (10 sheets), Poison, Basic, Pot, Iron, Prayer Book, Ram, Portable, Sling Bullets, Spikes, Iron, Stick of Incense, Three-dragon Ante, Trophy from Animal, Trophy from Fallen Enemy, Vestments, Winter Blanket

_Full per-entry status (including the missing list) is in `gap_report.json`._

## Monsters

2239 unique entries (after collapsing same-name reprints within an edition): 2239 present, 0 only in the other edition, 0 fuzzy, 0 missing.

### Appears in multiple books within the same edition — pick one canonical source

- [2014] Adult Kruthik: MPMM, MTF
- [2014] Adult Oblex: MPMM, MTF
- [2014] Air Elemental Myrmidon: MPMM, MTF
- [2014] Alhoon: MPMM, VGM
- [2014] Alkilith: MPMM, MTF
- [2014] Allip: MPMM, MTF
- [2014] Amnizu: MPMM, MTF
- [2014] Annis Hag: MPMM, VGM
- [2014] Apprentice Wizard: MPMM, VGM
- [2014] Archdruid: MPMM, VGM
- [2014] Archer: MPMM, VGM
- [2014] Armanite: MPMM, MTF
- [2014] Astral Dreadnought: MPMM, MTF
- [2014] Aurochs: MPMM, VGM
- [2014] Autumn Eladrin: MPMM, MTF
- [2014] Babau: MPMM, VGM
- [2014] Bael: MPMM, MTF
- [2014] Balhannoth: MPMM, MTF
- [2014] Banderhobb: MPMM, VGM
- [2014] Baphomet: MPMM, MTF
- [2014] Bard: MPMM, VGM
- [2014] Barghest: MPMM, VGM
- [2014] Berbalang: MPMM, MTF
- [2014] Bheur Hag: MPMM, VGM
- [2014] Black Abishai: MPMM, MTF
- [2014] Blackguard: MPMM, VGM
- [2014] Blue Abishai: MPMM, MTF
- [2014] Bodak: MPMM, VGM
- [2014] Boggle: MPMM, VGM
- [2014] Boneclaw: MPMM, MTF
- [2014] Brontosaurus: MPMM, VGM
- [2014] Bulezau: MPMM, MTF
- [2014] Cadaver Collector: MPMM, MTF
- [2014] Canoloth: MPMM, MTF
- [2014] Catoblepas: MPMM, VGM
- [2014] Cave Fisher: MPMM, VGM
- [2014] Champion: MPMM, VGM
- [2014] Chitine: MPMM, VGM
- [2014] Choker: MPMM, MTF
- [2014] Choldrith: MPMM, VGM
- [2014] Cloud Giant Smiling One: MPMM, VGM
- [2014] Corpse Flower: MPMM, MTF
- [2014] Cranium Rat: MPMM, VGM
- [2014] Darkling: MPMM, VGM
- [2014] Darkling Elder: MPMM, VGM
- [2014] Death Kiss: MPMM, VGM
- [2014] Deathlock: MPMM, MTF
- [2014] Deathlock Mastermind: MPMM, MTF
- [2014] Deathlock Wight: MPMM, MTF
- [2014] Deep Rothé: MPMM, VGM
- [2014] Deep Scion: MPMM, VGM
- [2014] Deinonychus: MPMM, VGM
- [2014] Demogorgon: MPMM, MTF
- [2014] Derro: MPMM, MTF
- [2014] Derro Savant: MPMM, MTF
- [2014] Devourer: MPMM, VGM
- [2014] Dhergoloth: MPMM, MTF
- [2014] Dimetrodon: MPMM, VGM
- [2014] Dire Troll: MPMM, MTF
- [2014] Dolphin: MPMM, VGM
- [2014] Draegloth: MPMM, VGM
- [2014] Drow Arachnomancer: MPMM, MTF
- [2014] Drow Favored Consort: MPMM, MTF
- [2014] Drow House Captain: MPMM, MTF
- [2014] Drow Inquisitor: MPMM, MTF
- [2014] Drow Matron Mother: MPMM, MTF
- [2014] Drow Shadowblade: MPMM, MTF
- [2014] Duergar Despot: MPMM, MTF
- [2014] Duergar Hammerer: MPMM, MTF
- [2014] Duergar Kavalrachni: MPMM, MTF
- [2014] Duergar Mind Master: MPMM, MTF
- [2014] Duergar Screamer: MPMM, MTF
- [2014] Duergar Soulblade: MPMM, MTF
- [2014] Duergar Stone Guard: MPMM, MTF
- [2014] Duergar Warlord: MPMM, MTF
- [2014] Duergar Xarrorn: MPMM, MTF
- [2014] Dybbuk: MPMM, MTF
- [2014] Earth Elemental Myrmidon: MPMM, MTF
- [2014] Eidolon: MPMM, MTF
- [2014] Elder Brain: MPMM, VGM
- [2014] Elder Oblex: MPMM, MTF
- [2014] Elder Tempest: MPMM, MTF
- [2014] Female Steeder: MPMM, MTF
- [2014] Fire Elemental Myrmidon: MPMM, MTF
- [2014] Fire Giant Dreadnought: MPMM, VGM
- [2014] Firenewt Warlock of Imix: MPMM, VGM
- [2014] Firenewt Warrior: MPMM, VGM
- [2014] Flail Snail: MPMM, VGM
- [2014] Flind: MPMM, VGM
- [2014] Fraz-Urb'luu: MPMM, MTF
- [2014] Froghemoth: MPMM, VGM
- [2014] Frost Giant Everlasting One: MPMM, VGM
- [2014] Frost Salamander: MPMM, MTF
- [2014] Gauth: MPMM, VGM
- [2014] Gazer: MPMM, VGM
- [2014] Geryon: MPMM, MTF
- [2014] Giant Strider: MPMM, VGM
- [2014] Giff: MPMM, MTF
- [2014] Girallon: MPMM, VGM
- [2014] Githyanki Gish: MPMM, MTF
- [2014] Githyanki Kith'rak: MPMM, MTF
- [2014] Githyanki Supreme Commander: MPMM, MTF
- [2014] Githzerai Anarch: MPMM, MTF
- [2014] Githzerai Enlightened: MPMM, MTF
- [2014] Gnoll Flesh Gnawer: MPMM, VGM
- [2014] Gnoll Hunter: MPMM, VGM
- [2014] Gnoll Witherling: MPMM, VGM
- [2014] Gray Render: MPMM, MTF
- [2014] Graz'zt: MPMM, MTF
- [2014] Green Abishai: MPMM, MTF
- [2014] Grung: MPMM, VGM
- [2014] Grung Elite Warrior: MPMM, VGM
- [2014] Grung Wildling: MPMM, VGM
- [2014] Hadrosaurus: MPMM, VGM
- [2014] Hellfire Engine: MPMM, MTF
- [2014] Hobgoblin Devastator: MPMM, VGM
- [2014] Hobgoblin Iron Shadow: MPMM, VGM
- [2014] Howler: MPMM, MTF
- [2014] Hutijin: MPMM, MTF
- [2014] Hydroloth: MPMM, MTF
- [2014] Juiblex: MPMM, MTF
- [2014] Ki-rin: MPMM, VGM
- [2014] Kobold Dragonshield: MPMM, VGM
- [2014] Kobold Inventor: MPMM, VGM
- [2014] Kobold Scale Sorcerer: MPMM, VGM
- [2014] Korred: MPMM, VGM
- [2014] Kraken Priest: MPMM, VGM
- [2014] Kruthik Hive Lord: MPMM, MTF
- [2014] Leucrotta: MPMM, VGM
- [2014] Leviathan: MPMM, MTF
- [2014] Male Steeder: MPMM, MTF
- [2014] Martial Arts Adept: MPMM, VGM
- [2014] Marut: MPMM, MTF
- [2014] Master Thief: MPMM, VGM
- [2014] Maurezhi: MPMM, MTF
- [2014] Maw Demon: MPMM, VGM
- [2014] Meazel: MPMM, MTF
- [2014] Medusa: MM, MOT
- [2014] Meenlock: MPMM, VGM
- [2014] Merregon: MPMM, MTF
- [2014] Merrenoloth: MPMM, MTF
- [2014] Mindwitness: MPMM, VGM
- [2014] Moloch: MPMM, MTF
- [2014] Molydeus: MPMM, MTF
- [2014] Morkoth: MPMM, VGM
- [2014] Mouth of Grolantor: MPMM, VGM
- [2014] Nabassu: MPMM, MTF
- [2014] Nagpa: MPMM, MTF
- [2014] Narzugon: MPMM, MTF
- [2014] Neogi: MPMM, VGM
- [2014] Neogi Hatchling: MPMM, VGM
- [2014] Neogi Master: MPMM, VGM
- [2014] Neothelid: MPMM, VGM
- [2014] Nightwalker: MPMM, MTF
- [2014] Nilbog: MPMM, VGM
- [2014] Nupperibo: MPMM, MTF
- [2014] Oblex Spawn: MPMM, MTF
- [2014] Ogre Battering Ram: MPMM, MTF
- [2014] Ogre Bolt Launcher: MPMM, MTF
- [2014] Ogre Chain Brute: MPMM, MTF
- [2014] Ogre Howdah: MPMM, MTF
- [2014] Oinoloth: MPMM, MTF
- [2014] Orcus: MPMM, MTF
- [2014] Orthon: MPMM, MTF
- [2014] Ox: MPMM, VGM
- [2014] Phoenix: MPMM, MTF
- [2014] Quetzalcoatlus: MPMM, VGM
- [2014] Quickling: MPMM, VGM
- [2014] Red Abishai: MPMM, MTF
- [2014] Redcap: MPMM, VGM
- [2014] Retriever: MPMM, MTF
- [2014] Rot Troll: MPMM, MTF
- [2014] Rutterkin: MPMM, MTF
- [2014] Sacred Statue: MPMM, MTF
- [2014] Sea Spawn: MPMM, VGM
- [2014] Shadow Mastiff: MPMM, VGM
- [2014] Shoosuva: MPMM, VGM
- [2014] Sibriex: MPMM, MTF
- [2014] Skulk: MPMM, MTF
- [2014] Skull Lord: MPMM, MTF
- [2014] Slithering Tracker: MPMM, VGM
- [2014] Spawn of Kyuss: MPMM, VGM
- [2014] Spirit Troll: MPMM, MTF
- [2014] Spring Eladrin: MPMM, MTF
- [2014] Star Spawn Grue: MPMM, MTF
- [2014] Star Spawn Hulk: MPMM, MTF
- [2014] Star Spawn Larva Mage: MPMM, MTF
- [2014] Star Spawn Mangler: MPMM, MTF
- [2014] Star Spawn Seer: MPMM, MTF
- [2014] Steel Predator: MPMM, MTF
- [2014] Stegosaurus: MPMM, VGM
- [2014] Stench Kow: MPMM, VGM
- [2014] Stone Cursed: MPMM, MTF
- [2014] Stone Giant Dreamwalker: MPMM, VGM
- [2014] Storm Giant Quintessent: MPMM, VGM
- [2014] Summer Eladrin: MPMM, MTF
- [2014] Swarm of Cranium Rats: MPMM, VGM
- [2014] Swarm of Rot Grubs: MPMM, VGM
- [2014] Swashbuckler: MPMM, VGM
- [2014] Sword Wraith Commander: MPMM, MTF
- [2014] Sword Wraith Warrior: MPMM, MTF
- [2014] Tanarukk: MPMM, VGM
- [2014] Titivilus: MPMM, MTF
- [2014] Tlincalli: MPMM, VGM
- [2014] Tortle: MPMM, MTF
- [2014] Tortle Druid: MPMM, MTF
- [2014] Trapper: MPMM, VGM
- [2014] Ulitharid: MPMM, VGM
- [2014] Vampiric Mist: MPMM, MTF
- [2014] Vargouille: MPMM, VGM
- [2014] Vegepygmy: MPMM, VGM
- [2014] Vegepygmy Chief: MPMM, VGM
- [2014] Velociraptor: MPMM, VGM
- [2014] Venom Troll: MPMM, MTF
- [2014] War Priest: MPMM, VGM
- [2014] Warlock of the Archfey: MPMM, VGM
- [2014] Warlock of the Fiend: MPMM, VGM
- [2014] Warlock of the Great Old One: MPMM, VGM
- [2014] Warlord: MPMM, VGM
- [2014] Wastrilith: MPMM, MTF
- [2014] Water Elemental Myrmidon: MPMM, MTF
- [2014] White Abishai: MPMM, MTF
- [2014] Winter Eladrin: MPMM, MTF
- [2014] Wood Woad: MPMM, VGM
- [2014] Xvart: MPMM, VGM
- [2014] Xvart Warlock of Raxivort: MPMM, VGM
- [2014] Yagnoloth: MPMM, MTF
- [2014] Yeenoghu: MPMM, MTF
- [2014] Yeth Hound: MPMM, VGM
- [2014] Young Kruthik: MPMM, MTF
- [2014] Yuan-ti Anathema: MPMM, VGM
- [2014] Yuan-ti Broodguard: MPMM, VGM
- [2014] Yuan-ti Mind Whisperer: MPMM, VGM
- [2014] Yuan-ti Nightmare Speaker: MPMM, VGM
- [2014] Yuan-ti Pit Master: MPMM, VGM
- [2014] Zaratan: MPMM, MTF
- [2014] Zariel: MPMM, MTF
- [2014] Zuggtmoy: MPMM, MTF

### In the app but not matched by any inventory entry

Aberrant Spirit (Beholderkin), Aberrant Spirit (Mind Flayer), Aberrant Spirit (Slaad), Aberrant Spirit (Star Spawn), Animal Lord; Forager, Animal Lord; Hunter, Animal Lord; Sage, Animated Object (Medium or Smaller), Annis Hag (Coven), Annis Hag (Coven; Death), Annis Hag (Coven; Nature), Annis Hag (Coven; Prophecy), Archmage (Familiar), Battle Familiar (Brute), Battle Familiar (Flyer), Battle Familiar (Stalker), Bestial Spirit (Air), Bestial Spirit (Land), Bestial Spirit (Water), Bheur Hag (Coven), Bheur Hag (Coven; Death), Bheur Hag (Coven; Nature), Bheur Hag (Coven; Prophecy), Celestial Spirit (Avenger), Celestial Spirit (Defender), Construct Spirit (Clay), Construct Spirit (Metal), Construct Spirit (Stone), Dao (Disguises), Dao (Wishes), Deathlock (Archfey Patron), Deathlock (Fiend Patron), Deathlock (Great Old One Patron), Deathlock Mastermind (Archfey Patron), Deathlock Mastermind (Fiend Patron), Deathlock Mastermind (Great Old One Patron), Demilich (Trap Soul), Demonic Cambion (Baphomet), Demonic Cambion (Orcus), Dinosaur Spirit (Ankylosaur), Dinosaur Spirit (Triceratops), Dinosaur Spirit (Tyrannosaur), Djinni (Disguises), Djinni (Wishes), Draconic Spirit (Acid), Draconic Spirit (Chromatic), Draconic Spirit (Cold), Draconic Spirit (Fire), Draconic Spirit (Gem), Draconic Spirit (Lightning), Draconic Spirit (Metallic), Draconic Spirit (Poison), Drider Spellcaster, Drow (Magic Equipment), Drow Elite Warrior (Magic Equipment), Drow Priestess of Lolth (Magic Equipment), Duodrone (Rogue), Efreeti (Disguises), Efreeti (Wishes), Elemental Spirit (Air), Elemental Spirit (Earth), Elemental Spirit (Fire), Elemental Spirit (Water), Erinyes (Rope of Entanglement), Fey Spirit (Fuming), Fey Spirit (Mirthful), Fey Spirit (Tricksy), Fiendish Spirit (Demon), Fiendish Spirit (Devil), Fiendish Spirit (Yugoloth), Giant Insect (Centipede), Giant Insect (Spider), Giant Insect (Wasp), Giant Lizard (Hold Breath and Spider Climb), Giant Rat (Diseased), Gray Ooze (Psychic), Green Hag (Coven), Grung (Blue), Grung (Gold), Grung (Green), Grung (Orange), Grung (Purple), Grung (Red), Grung Elite Warrior (Blue), Grung Elite Warrior (Gold), Grung Elite Warrior (Green), Grung Elite Warrior (Orange), Grung Elite Warrior (Purple), Grung Elite Warrior (Red), Grung Wildling (Blue), Grung Wildling (Gold), Grung Wildling (Green), Grung Wildling (Orange), Grung Wildling (Purple), Grung Wildling (Red), Guard Drake (Black), Guard Drake (Blue), Guard Drake (Green), Guard Drake (Red), Guard Drake (White), Infernal Cambion, Inspired (Quori Vessel; Hashalaq), Inspired (Quori Vessel; Kalaraq), Inspired (Quori Vessel; Tsucora), Living Star (Necrotic), Living Star (Psychic), Mage (Familiar), Marid (Disguises), Marid (Wishes), Monodrone (Rogue), Night Hag (Coven), Otherworldly Steed (Celestial), Otherworldly Steed (Fey), Otherworldly Steed (Fiend), Pentadrone (Rogue), Plant Spirit (Fungus), Plant Spirit (Tree), Plant Spirit (Vine), Priest of Osybus (Blazing Boon), Priest of Osybus (Deathly Boon), Priest of Osybus (Dread Boon), Priest of Osybus (Ectoplasmic Boon), Priest of Osybus (Spectral Boon), Priest of Osybus (Vampiric Boon), Quadrone (Rogue), Sahuagin Warlock of Uk'otoa (Rod of Retribution), Sea Hag (Coven), Shadow Spirit (Despair), Shadow Spirit (Fear), Shadow Spirit (Fury), Succubus/Incubus, Thri-kreen (Weapons and Psionics), Tridrone (Rogue), Troll (Loathsome Limb; Severed Arm), Troll (Loathsome Limb; Severed Head), Troll (Loathsome Limb; Severed Leg), Undead Spirit (Ghostly), Undead Spirit (Putrid), Undead Spirit (Skeletal), Vampire, Bat Form, Vampire, Mist Form, Vampire, Vampire Form, Vestige Companion (Celestial), Vestige Companion (Fiend), Vestige Companion (Undead), Warhorse (Chain Mail Barding), Warhorse (Leather Barding), Warhorse (Plate Barding), Warhorse (Ring Mail Barding), Warhorse (Scale Mail Barding), Warhorse (Splint Barding), Warhorse (Studded Leather Barding), Werebear, Bear Form, Werebear, Human Form, Werebear, Hybrid Form, Wereboar, Boar Form, Wereboar, Human Form, Wereboar, Hybrid Form, Wererat, Human Form, Wererat, Hybrid Form, Wererat, Rat Form, Weretiger, Human Form, Weretiger, Hybrid Form, Weretiger, Tiger Form, Werewolf, Human Form, Werewolf, Hybrid Form, Werewolf, Wolf Form, Winged Felidar, Winged Kraul Warrior

_Full per-entry status (including the missing list) is in `gap_report.json`._
