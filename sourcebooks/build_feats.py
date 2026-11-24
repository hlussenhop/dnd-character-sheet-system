#!/usr/bin/env python3
"""
build_feats.py: feats lane (fast-lane plan, step 2).

Regenerates src/data/feats.json from the 5etools mirror for every book in
content_inventory.json:

  * one record per feat and edition (2014 slug `alert`, 2024 slug `alert-2024`);
    `_versions` (Magic Initiate; Cleric, ...) become their own records
  * structured prerequisites (`prerequisites.anyOf`, OR of AND groups) plus a display string
  * ability score increases, and mechanical grants (TraitGrant shape) only from structured
    5etools fields, plus the small HAND_GRANTS table for text-only mechanics the app models
  * description and a short benefits list from the entries

Hand-kept records (HAND_KEPT) that have no mirror counterpart are carried over unchanged.

Usage:
    python3 sourcebooks/build_feats.py          # report only
    python3 sourcebooks/build_feats.py --apply  # write src/data/feats.json and update references
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter

import lanelib as L

FEATS_PATH = L.DATA / 'feats.json'
BACKGROUNDS_PATH = L.DATA / 'backgrounds.json'
INVENTORY = json.loads((L.ROOT / 'sourcebooks' / 'content_inventory.json').read_text())

# App records with no mirror feat (Versatile is the 2024 Human trait, modelled as a feat pick).
HAND_KEPT = {'versatile'}

# The wizard's own Ability Score Improvement choice is this feat.
SKIP_NAMES = {('ability score improvement', '2024')}

CATEGORY = {
    'O': 'origin', 'G': 'general', 'EB': 'epic_boon', 'FS': 'fighting_style', 'FS:P': 'fighting_style',
    'FS:R': 'fighting_style', 'D': 'dragonmark', 'DG': 'dark_gift',
}
CATEGORY_LABEL = {'D': 'Dragonmark', 'DG': 'Dark Gift', 'O': 'Origin', 'G': 'General', 'EB': 'Epic Boon',
                  'FS': 'Fighting Style'}

ABILITY = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}
ABILITY_NAME = {'str': 'Strength', 'dex': 'Dexterity', 'con': 'Constitution', 'int': 'Intelligence',
                'wis': 'Wisdom', 'cha': 'Charisma'}

SKILL = {
    'acrobatics': 'Acrobatics', 'animal handling': 'AnimalHandling', 'arcana': 'Arcana', 'athletics': 'Athletics',
    'deception': 'Deception', 'history': 'History', 'insight': 'Insight', 'intimidation': 'Intimidation',
    'investigation': 'Investigation', 'medicine': 'Medicine', 'nature': 'Nature', 'perception': 'Perception',
    'performance': 'Performance', 'persuasion': 'Persuasion', 'religion': 'Religion',
    'sleight of hand': 'SleightOfHand', 'stealth': 'Stealth', 'survival': 'Survival',
}

_TOOLS = json.loads((L.DATA / 'speciesTraitGrants.json').read_text())['Specialized Design']['toolChoices']['from']
ARTISAN_TOOLS = _TOOLS[:17]
INSTRUMENTS = _TOOLS[_TOOLS.index('Bagpipes'):_TOOLS.index('Viol') + 1]

ARMOR = {'light': 'Light Armor', 'medium': 'Medium Armor', 'heavy': 'Heavy Armor', 'shield': 'Shields'}
WEAPON = {'martial': 'Martial Weapons', 'simple': 'Simple Weapons', 'firearms': 'Firearms',
          'improvised': 'Improvised Weapons'}

# Text-only mechanics the app models (keyed by name, edition). Everything else stays text.
HAND_GRANTS: dict[tuple[str, str], dict] = {
    ('alert', '2014'): {'initiativeBonus': 5},
    ('alert', '2024'): {'initiativeProficiency': True},
    ('mobile', '2014'): {'speedBonus': 10},
    ('speedy', '2024'): {'speedBonus': 10},
    ('squat nimbleness', '2014'): {'speedBonus': 5},
    ('boon of speed', '2024'): {'speedBonus': 30},
    ('tough', '2014'): {'hpPerLevel': 2},
    ('tough', '2024'): {'hpPerLevel': 2},
    ('dragon hide', '2014'): {'naturalArmor': {'base': 13, 'abilities': ['DEX']}},
}


def title(s: str) -> str:
    return s[:1].upper() + s[1:]


def feat_slug(name: str, edition: str) -> str:
    return L.slugify(name) + ('-2024' if edition == '2024' else '')


def display_name(name: str) -> str:
    """`Magic Initiate; Cleric` -> `Magic Initiate (Cleric)`."""
    if ';' in name:
        base, version = (p.strip() for p in name.split(';', 1))
        return f'{base} ({version})'
    return name


# ---------------------------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------------------------

class Resolver:
    """Maps `feat|source` references to app slugs once every feat is known."""

    def __init__(self, feats: list[dict]):
        self.by_key = {(f['name'].lower(), f['source'].lower()): f for f in feats}

    def slug(self, ref: str) -> str | None:
        parts = ref.split('|')
        name, source = parts[0].strip().lower(), (parts[1].strip().lower() if len(parts) > 1 else 'phb')
        f = self.by_key.get((name, source))
        return feat_slug(f['name'], L.edition_of(f['source'])) if f else None


def prereq_group(p: dict, resolver: Resolver, flags: list[str], feat_name: str) -> dict:
    g: dict = {}
    for key, val in p.items():
        if key == 'level':
            if isinstance(val, dict):
                g['level'] = val['level']
                if val.get('class'):
                    g['className'] = val['class']['name']
            else:
                g['level'] = val
        elif key == 'ability':
            g['abilities'] = [{ABILITY[k]: v for k, v in a.items()} for a in val]
        elif key == 'race':
            g['species'] = [{k: title(v) for k, v in r.items() if k in ('name', 'subrace')} for r in val]
        elif key in ('spellcasting', 'spellcasting2020', 'spellcastingFeature'):
            g['spellcasting'] = True
        elif key == 'feature':
            g['features'] = list(val)
        elif key == 'feat':
            slugs = [resolver.slug(r) for r in val]
            if None in slugs:
                flags.append(f'{feat_name}: unresolved feat prerequisite {val}')
            g['feats'] = [s for s in slugs if s]
        elif key == 'proficiency':
            profs = []
            for pr in val:
                if 'armor' in pr:
                    profs.append({'armor': ARMOR.get(pr['armor'], title(pr['armor']))})
                elif 'weapon' in pr or 'weaponGroup' in pr:
                    w = pr.get('weapon') or pr.get('weaponGroup')
                    profs.append({'weapon': WEAPON.get(w, title(w))})
                elif 'tool' in pr:
                    profs.extend({'tool': title(t)} for t in pr['tool'])
            g['proficiencies'] = profs
        elif key == 'background':
            g['backgrounds'] = [b['name'] for b in val]
        elif key == 'campaign':
            g['campaign'] = list(val)
        elif key == 'featCategory':
            g['featCategories'] = [CATEGORY[c] for c in val]
        elif key == 'exclusiveFeatCategory':
            g['exclusiveFeatCategories'] = [CATEGORY[c] for c in val]
        elif key == 'otherSummary':
            g['other'] = L.strip_tags(val['entry'])
        elif key == 'other':
            g['other'] = L.strip_tags(val)
        else:
            flags.append(f'{feat_name}: unknown prerequisite key {key}')
    return g


def group_text(g: dict) -> list[str]:
    parts = []
    if 'level' in g:
        parts.append(f"Level {g['level']} {g['className']}" if 'className' in g else f"Level {g['level']}+")
    if 'abilities' in g:
        alts = []
        for a in g['abilities']:
            alts.append(' and '.join(f'{ABILITY_NAME[k.lower()]} {v}+' for k, v in a.items()))
        parts.append(' or '.join(alts))
    if 'species' in g:
        parts.append(' or '.join(f"{s['name']} ({s['subrace']})" if 'subrace' in s else s['name'] for s in g['species']))
    if g.get('spellcasting'):
        parts.append('Spellcasting or Pact Magic Feature')
    if 'features' in g:
        parts.append(' or '.join(f'{f} Feature' for f in g['features']))
    if 'feats' in g:
        parts.append(' or '.join(f'{s} feat' for s in g['feats']))
    if 'proficiencies' in g:
        parts.append('Proficiency with ' + ' or '.join(next(iter(p.values())) for p in g['proficiencies']))
    if 'backgrounds' in g:
        parts.append(' or '.join(f'{b} Background' for b in g['backgrounds']))
    if 'featCategories' in g:
        parts.append(' or '.join(f"{c.replace('_', ' ').title()} Feat" for c in g['featCategories']))
    if 'exclusiveFeatCategories' in g:
        parts.append(' or '.join(f"No other {c.replace('_', ' ').title()} Feat" for c in g['exclusiveFeatCategories']))
    if 'other' in g:
        parts.append(g['other'])
    if 'campaign' in g:
        parts.append(' or '.join(f'{c} Campaign' for c in g['campaign']))
    return parts


def prereq_text(groups: list[dict], name_of: dict[str, str]) -> str | None:
    if not groups:
        return None
    named = []
    for g in groups:
        g = dict(g)
        if 'feats' in g:
            g['feats'] = [name_of.get(s, s) for s in g['feats']]
        named.append(g)
    # Alternatives that differ only in the ability score read as one line ("Strength or Dexterity 13+").
    rest = [{k: v for k, v in g.items() if k != 'abilities'} for g in named]
    if len(named) > 1 and all(r == rest[0] for r in rest) and all('abilities' in g for g in named):
        merged = dict(rest[0], abilities=[a for g in named for a in g['abilities']])
        values = {v for a in merged['abilities'] for v in a.values()}
        if len(values) == 1 and all(len(a) == 1 for a in merged['abilities']):
            v = values.pop()
            parts = group_text(rest[0])
            parts.insert(1 if 'level' in rest[0] else 0,
                         ' or '.join(ABILITY_NAME[next(iter(a)).lower()] for a in merged['abilities']) + f' {v}+')
            return ', '.join(parts)
    return '; or '.join(', '.join(group_text(g)) for g in named)


# ---------------------------------------------------------------------------------------------
# Ability score increase and grants
# ---------------------------------------------------------------------------------------------

def ability_increase(f: dict, flags: list[str]) -> dict | None:
    abil = f.get('ability')
    if not abil:
        return None
    visible = [a for a in abil if not a.get('hidden')]
    if len(visible) != 1:
        flags.append(f"{f['name']}: {len(abil)} alternative ability increases (text only)")
        return None
    a = visible[0]
    out: dict
    if 'choose' in a:
        ch = a['choose']
        out = {'choices': ch.get('count', 1), 'options': [ABILITY[x] for x in ch['from']], 'amount': ch.get('amount', 1)}
    else:
        fixed = {ABILITY[k]: v for k, v in a.items() if k in ABILITY}
        if len(fixed) != 1:
            flags.append(f"{f['name']}: several fixed ability increases (text only)")
            return None
        (k, v), = fixed.items()
        out = {'choices': 1, 'options': [k], 'amount': v}
    if a.get('max'):
        out['max'] = a['max']
    return out


def grants_for(f: dict, edition: str, flags: list[str]) -> dict:
    g: dict = {}
    name = f['name']

    for sp in f.get('skillProficiencies', []):
        fixed = [SKILL[k] for k, v in sp.items() if v is True and k in SKILL]
        if fixed:
            g['skills'] = fixed
        if 'choose' in sp:
            g['skillChoices'] = {'count': sp['choose'].get('count', 1), 'from': [SKILL[s] for s in sp['choose']['from']]}
        if 'any' in sp:
            g['skillChoices'] = {'count': sp['any']}

    tools, tool_choices = [], []
    for tp in f.get('toolProficiencies', []):
        tools += [title(k) for k, v in tp.items() if v is True]
        if 'anyArtisansTool' in tp:
            tool_choices.append({'count': tp['anyArtisansTool'], 'from': ARTISAN_TOOLS})
        if 'anyMusicalInstrument' in tp:
            tool_choices.append({'count': tp['anyMusicalInstrument'], 'from': INSTRUMENTS})
        if 'any' in tp:
            tool_choices.append({'count': tp['any'], 'from': _TOOLS})
        if 'choose' in tp:
            tool_choices.append({'count': tp['choose'].get('count', 1), 'from': [title(t) for t in tp['choose']['from']]})
    if tools:
        g['tools'] = tools
    if tool_choices:
        g['toolChoices'] = tool_choices[0]
        if len(tool_choices) > 1:
            flags.append(f'{name}: several tool choices, only the first is modelled')

    langs, lang_choices = [], 0
    for lp in f.get('languageProficiencies', []):
        langs += [title(k) for k, v in lp.items() if v is True]
        lang_choices += lp.get('any', 0) + lp.get('anyStandard', 0)
    if langs:
        g['languages'] = langs
    if lang_choices:
        g['languageChoices'] = lang_choices

    armor = [ARMOR[k] for ap in f.get('armorProficiencies', []) for k, v in ap.items() if v is True]
    if armor:
        g['armor'] = armor
    weapons = []
    for wp in f.get('weaponProficiencies', []):
        weapons += [WEAPON.get(k, title(k)) for k, v in wp.items() if v is True]
        if 'choose' in wp:
            flags.append(f'{name}: weapon proficiency choice (text only)')
    if weapons:
        g['weapons'] = weapons

    for r in f.get('resist', []):
        if isinstance(r, str):
            g.setdefault('resistances', []).append(r)
        elif 'choose' in r:
            g['resistanceChoices'] = {'count': r['choose'].get('count', 1), 'from': r['choose']['from']}
    if f.get('immune'):
        g['damageImmunities'] = [i for i in f['immune'] if isinstance(i, str)]
    if f.get('conditionImmune'):
        g['conditionImmunities'] = [c for c in f['conditionImmune'] if isinstance(c, str)]

    senses = {k: v for s in f.get('senses', []) for k, v in s.items()}
    for s in f.get('bonusSenses', []):
        for k, v in s.items():
            senses[k] = max(senses.get(k, 0), v)
            g['note'] = f'If you already have {k.title()}, its range increases by {v} feet instead.'
    if senses:
        g['senses'] = senses

    for st in f.get('savingThrowProficiencies', []):
        if 'choose' in st:
            g['savingThrowChoices'] = {'count': st['choose'].get('count', 1), 'from': [ABILITY[a] for a in st['choose']['from']]}
        fixed = [ABILITY[k] for k, v in st.items() if v is True]
        if fixed:
            g['savingThrows'] = fixed

    for ex in f.get('expertise', []):
        fixed = [SKILL[k] for k, v in ex.items() if v is True and k in SKILL]
        if fixed:
            g['expertise'] = fixed
        if 'anyProficientSkill' in ex:
            flags.append(f'{name}: expertise choice (text only)')

    if f.get('skillToolLanguageProficiencies'):
        # Skilled: three skills or tools in any combination (Step 3 adds the picks).
        flags.append(f'{name}: skill-or-tool choice handled by the class step, not as a grant')

    g.update(HAND_GRANTS.get((name.lower(), edition), {}))
    return g


# ---------------------------------------------------------------------------------------------
# Text
# ---------------------------------------------------------------------------------------------

FIRST_SENTENCE = re.compile(r'^(.+?[.!?])(\s|$)')


def first_sentence(text: str, limit: int = 160) -> str:
    m = FIRST_SENTENCE.match(text.strip())
    s = m.group(1) if m else text.strip()
    return s if len(s) <= limit else s[:limit - 1].rstrip() + '…'


def description_for(entries: list) -> str:
    """Entry text with the benefit names kept as run-in headings ("Two Cantrips. You learn ...")."""
    paras = []
    for e in entries:
        if isinstance(e, dict) and e.get('type', 'entries') == 'entries' and e.get('name'):
            paras.append(f"{L.strip_tags(e['name'])}. {L.entry_text(e.get('entries', []))}")
        else:
            paras.append(L.entry_text(e))
    return '\n'.join(p for p in paras if p)


def benefits_for(entries: list) -> list[str]:
    out = []
    for e in entries:
        if isinstance(e, dict) and e.get('type', 'entries') == 'entries' and e.get('name'):
            body = L.entry_text(e.get('entries', []))
            out.append(f"{L.strip_tags(e['name'])}: {first_sentence(body)}" if body else L.strip_tags(e['name']))
        elif isinstance(e, dict) and e.get('type') == 'list':
            for item in e.get('items', []):
                text = L.entry_text(item)
                if text:
                    out.append(first_sentence(text))
    if not out:
        paras = [L.entry_text(e) for e in entries if isinstance(e, str)]
        paras = [p for p in paras if p and not p.lower().startswith('you gain the following')]
        out = [first_sentence(p) for p in paras[:3]]
    return out


# ---------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------

def inventory_sources() -> set[str]:
    return {s.upper() for s in INVENTORY['data']['Feats']}


def mirror_feats() -> list[dict]:
    sources = inventory_sources()
    raw = L.fetch('feats.json')['feat']
    lookup = L.make_lookup(raw)
    out = []
    for f in raw:
        if f['source'].upper() not in sources:
            continue
        f = L.resolve_copy(f, lookup) if '_copy' in f else f
        out.append({k: v for k, v in f.items() if k != '_versions'})
        out.extend(L.expand_versions(f))
    return out


def build(flags: list[str]) -> list[dict]:
    feats = mirror_feats()
    resolver = Resolver(feats)
    records = []
    for f in feats:
        edition = L.edition_of(f['source'])
        if (f['name'].lower(), edition) in SKIP_NAMES:
            continue
        name = display_name(f['name'])
        category = CATEGORY.get(f.get('category'), 'general') if f.get('category') else 'general'
        groups = [prereq_group(p, resolver, flags, name) for p in f.get('prerequisite', [])]
        rec: dict = {
            'slug': feat_slug(f['name'], edition),
            'name': name,
            'source': f['source'],
            'edition': edition,
            'year': int(edition),
            'category': category,
            'prerequisite': None,
            'prerequisites': {},
        }
        levels = [g['level'] for g in groups if 'level' in g]
        if levels and len(levels) == len(groups):
            rec['prerequisites']['level'] = min(levels)
        if groups:
            rec['prerequisites']['anyOf'] = groups
        if not rec['prerequisites']:
            del rec['prerequisites']
        asi = ability_increase(f, flags)
        if asi:
            rec['abilityScoreIncrease'] = asi
        if f.get('repeatable'):
            rec['repeatable'] = True
        grants = grants_for(f, edition, flags)
        if grants:
            rec['grants'] = grants
        rec['benefits'] = benefits_for(f['entries'])
        rec['description'] = description_for(f['entries'])
        if not rec['description']:
            flags.append(f'{name}: no text')
        records.append(rec)

    name_of = {r['slug']: r['name'] for r in records}
    for rec in records:
        rec['prerequisite'] = prereq_text(rec.get('prerequisites', {}).get('anyOf', []), name_of)
    return records


def report_against_app(records: list[dict], app: list[dict]) -> tuple[list[dict], list[str]]:
    """Carry over hand-kept records and hand-written benefits; list what changes for existing feats."""
    lines = []
    by_name_ed = {(L.norm(r['name']), r['edition']): r for r in records}
    kept = []
    for old in app:
        if old['slug'] in HAND_KEPT:
            kept.append({'slug': old['slug'], 'name': old['name'], 'source': old['source'],
                         'edition': str(old.get('edition') or old['year']), **old})
            continue
        old_ed = str(old.get('edition') or old.get('year'))
        same = by_name_ed.get((L.norm(old['name']), old_ed))
        other = by_name_ed.get((L.norm(old['name']), '2024' if old_ed == '2014' else '2014'))
        if not same and not other:
            lines.append(f"- dropped `{old['slug']}` ({old['name']}, {old_ed}): not in the mirror")
            continue
        # Old records were partly mislabelled; match by text when the other edition's text is the closer one.
        target, how = same, 'same edition'
        if other and (not same or _similar(old['description'], other['description']) > _similar(old['description'], same['description'])):
            target, how = other, f"edition corrected {old_ed} -> {other['edition']}"
        if old.get('benefits') and _similar(old['description'], target['description']) > 0.6:
            target['benefits'] = old['benefits']
        notes = []
        if how != 'same edition':
            notes.append(how)
        if old['category'] != target['category']:
            notes.append(f"category {old['category']} -> {target['category']}")
        if old['slug'] != target['slug']:
            notes.append(f"slug {old['slug']} -> {target['slug']}")
        if notes:
            lines.append(f"- `{old['slug']}` ({old['name']}): " + '; '.join(notes))
    return kept, lines


def _similar(a: str, b: str) -> float:
    wa, wb = set(L.norm(a).split()), set(L.norm(b).split())
    return len(wa & wb) / max(1, len(wa | wb))


def update_backgrounds(slugs: set[str], apply: bool) -> list[str]:
    """2024 background Origin Feats now point at the `-2024` records (Acolyte/Sage get their Magic Initiate version)."""
    data = L.read_json(BACKGROUNDS_PATH)
    items = data if isinstance(data, list) else data.get('backgrounds', data)
    lines = []
    version = {'acolyte': 'magic-initiate-cleric-2024', 'sage': 'magic-initiate-wizard-2024'}
    for bg in items:
        ref = bg.get('originFeat')
        if not ref or ref.endswith('-2024') and ref in slugs:
            continue
        new = version.get(bg['slug'].removesuffix('-2024')) if ref == 'magic-initiate' else None
        new = new or (f'{ref}-2024' if f'{ref}-2024' in slugs else None)
        if not new:
            lines.append(f"- background `{bg['slug']}`: originFeat `{ref}` does not resolve")
            continue
        lines.append(f"- background `{bg['slug']}`: originFeat `{ref}` -> `{new}`")
        bg['originFeat'] = new
    if apply:
        L.write_json(BACKGROUNDS_PATH, data)
    return lines


def main() -> None:
    apply = '--apply' in sys.argv
    flags: list[str] = []
    records = build(flags)
    app = L.read_json(FEATS_PATH)
    kept, changes = report_against_app(records, app)
    final = sorted(records + kept, key=lambda r: (r['name'].lower(), r['edition'] if 'edition' in r else str(r['year'])))
    slugs = [r['slug'] for r in final]
    dupes = [s for s, c in Counter(slugs).items() if c > 1]
    assert not dupes, dupes
    bg_lines = update_backgrounds(set(slugs), apply)

    counts = Counter((r.get('edition') or str(r['year']), r['category']) for r in final)
    print(f'{len(final)} feats ({len(records)} generated, {len(kept)} hand-kept)')
    for (ed, cat), n in sorted(counts.items()):
        print(f'  {ed} {cat}: {n}')
    print('\nChanges to existing app feats:')
    print('\n'.join(changes) or '  none')
    print('\nReferences:')
    print('\n'.join(bg_lines) or '  none')
    print(f'\nFlags ({len(flags)}):')
    print('\n'.join(f'  {f}' for f in sorted(set(flags))))
    if apply:
        # Descriptions are the bulk of the lane; they load lazily per source (src/data/content/feats/).
        chunks: dict[str, list] = {}
        for r in records:
            chunks.setdefault(r['source'], []).append({'slug': r['slug'], 'description': r.pop('description')})
        L.write_json(FEATS_PATH, final)
        written = L.write_chunks('feats', chunks)
        print(f'\nwrote {FEATS_PATH.relative_to(L.ROOT)} and {len(written)} description chunks')


if __name__ == '__main__':
    main()
