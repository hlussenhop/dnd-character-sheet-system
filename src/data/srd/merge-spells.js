#!/usr/bin/env node

/**
 * Script to merge 2014 and 2024 SRD spell lists
 * Creates a unified spell database with source tracking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the current spell files
const spells2014Path = path.join(__dirname, '2014', '5e-SRD-Spells.json');
const spells2024Path = path.join(__dirname, '2024', '5e-SRD-spells.json');
const outputPath = path.join(__dirname, '5e-SRD-Spells-Merged.json');

console.log('Loading spell data...');

// Load spell data
const spells2014 = JSON.parse(fs.readFileSync(spells2014Path, 'utf8'));
const spells2024 = JSON.parse(fs.readFileSync(spells2024Path, 'utf8'));

console.log(`2014 spells: ${spells2014.length}`);
console.log(`2024 spells: ${spells2024.length}`);

// IMPORTANT: 2014 and 2024 spells with the same name are NOT the same data -
// wording, damage dice, and mechanics frequently differ between editions
// (e.g. Acid Splash's damage progression, Scorching Ray's targeting). Both
// editions' versions of a shared-name spell must be kept as separate
// entries, each correctly tagged by source, so edition-aware filtering
// (see src/utils/spellbookAdapter.ts) actually works. An earlier version of
// this script deduplicated by name and let the 2024 entry silently
// overwrite the 2014 one for every shared name, which left only 2 spells
// tagged '2014' in the output. Do not reintroduce that bug.

// Slug compatibility: transformSpell() (dataService.ts) derives a spell's slug
// from `index`, falling back to name.toLowerCase().replace(/\s+/g, '-').
// Saved characters, TRAIT_SPELL_MAP, class spell lists etc. all reference
// those legacy slugs, and until now the surviving entry for every shared name
// was the 2024 one. So:
//   - 2024 entries NEVER get an `index` override (they keep the legacy slug).
//   - 2014 entries whose name also exists in 2024 get '<legacy-slug>-2014'.
//   - 2014-only entries keep their original SRD index.
const legacySlug = name => name.toLowerCase().trim().replace(/\s+/g, '-');

const names2014 = new Set(spells2014.map(s => s.name.toLowerCase().trim()));
const names2024 = new Set(spells2024.map(s => s.name.toLowerCase().trim()));
const sharedNames = new Set([...names2014].filter(n => names2024.has(n)));

const mergedSpells = [];

spells2014.forEach(spell => {
  if (!spell.name || spell.level === undefined) return;
  const key = spell.name.toLowerCase().trim();
  const isShared = sharedNames.has(key);
  mergedSpells.push({
    ...spell,
    index: isShared ? `${legacySlug(spell.name)}-2014` : spell.index,
    source: '2014',
  });
});

spells2024.forEach(spell => {
  if (!spell.name || spell.level === undefined) return;
  mergedSpells.push({
    ...spell,
    source: '2024',
  });
});

console.log(`Shared names (kept as separate 2014 + 2024 entries): ${sharedNames.size}`);
console.log(`Merged spells: ${mergedSpells.length}`);

// Write merged file
fs.writeFileSync(outputPath, JSON.stringify(mergedSpells, null, 2));

console.log(`✅ Merged spell database created: ${outputPath}`);
console.log(`   - Total spells: ${mergedSpells.length}`);
console.log(`   - 2014 spells: ${mergedSpells.filter(s => s.source === '2014').length}`);
console.log(`   - 2024 spells: ${mergedSpells.filter(s => s.source === '2024').length}`);