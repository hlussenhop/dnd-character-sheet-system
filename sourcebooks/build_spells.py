#!/usr/bin/env python3
"""
build_spells.py: spells lane (fast-lane plan, step 4).

Rebuilds src/data/srd/5e-SRD-Spells-Merged.json from the 5etools mirror for every
book in content_inventory.json:

  * one record per spell and edition (edition is the printing book's publication date)
  * 2024 spells keep the unsuffixed slug saved characters already use; the 2014
    copy of a spell that also exists in 2024 keeps its `-2014` slug
  * class lists come from spells/sources.json, and only classes of the same edition
  * the long description and "at higher levels" text go in src/data/content/spells/

Usage:
    python3 sourcebooks/build_spells.py          # report only
    python3 sourcebooks/build_spells.py --apply  # write the data
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict

import lanelib as L

OUT = L.DATA / 'srd' / '5e-SRD-Spells-Merged.json'
BACKGROUNDS = L.DATA / 'backgrounds.json'
INVENTORY = json.loads((L.ROOT / 'sourcebooks' / 'content_inventory.json').read_text())

# Classes the app can prepare spells for. Setting classes (Mage, Priest, ...) are not.
PLAYER_CLASSES = {
    'artificer', 'bard', 'cleric', 'druid', 'monk', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard',
}

SCHOOL = {
    'A': 'Abjuration', 'C': 'Conjuration', 'D': 'Divination', 'E': 'Enchantment',
    'V': 'Evocation', 'I': 'Illusion', 'N': 'Necromancy', 'T': 'Transmutation',
}
SAVE = {
    'strength': 'str', 'dexterity': 'dex', 'constitution': 'con',
    'intelligence': 'int', 'wisdom': 'wis', 'charisma': 'cha',
}

# SRD printed these without the wizard's name. Saved characters use the short slug.
BOOK_TO_SRD = {
    "bigby's hand": 'arcane hand',
    "mordenkainen's sword": 'arcane sword',
}

UNIT = {
    'action': 'action', 'bonus': 'bonus action', 'reaction': 'reaction', 'round': 'round',
    'minute': 'minute', 'hour': 'hour', 'day': 'day', 'week': 'week', 'year': 'year',
}
AREA = {'cone', 'line', 'cube', 'sphere', 'radius', 'hemisphere', 'emanation'}


def core_name(name: str) -> str:
    """'Melf's Acid Arrow' -> 'Acid Arrow', matching the gap report."""
    return re.sub(r"^[A-Za-z][\w-]*['’]s\s+", '', name).strip()


def plural(n: int, unit: str) -> str:
    label = UNIT.get(unit, unit)
    if n == 1:
        return f'1 {label}'
    if label == 'foot':
        return f'{n} feet'
    return f'{n} {label}s' if not label.endswith('s') else f'{n} {label}'


def distance_phrase(distance: dict) -> str:
    kind = distance.get('type')
    amount = distance.get('amount')
    if kind == 'feet':
        return '1 foot' if amount == 1 else f'{amount} feet'
    if kind == 'miles':
        return '1 mile' if amount == 1 else f'{amount} miles'
    if kind in ('touch', 'self', 'sight', 'unlimited'):
        return kind[:1].upper() + kind[1:]
    return str(amount or kind or 'Special')


def range_text(spell: dict) -> str:
    rng = spell.get('range') or {}
    kind = rng.get('type')
    if kind == 'special':
        return 'Special'
    distance = rng.get('distance') or {}
    if kind in AREA:
        amount = distance.get('amount')
        unit = 'foot' if amount == 1 else 'feet'
        return f'Self ({amount}-{unit} {kind})'
    return distance_phrase(distance)


def time_text(spell: dict) -> str:
    parts = []
    for entry in spell.get('time') or []:
        base = plural(entry.get('number') or 1, entry.get('unit') or 'action')
        condition = entry.get('condition')
        if condition:
            base = f'{base}, {L.strip_tags(condition)}'
        parts.append(base)
    return ' or '.join(parts) or '1 action'


def duration_text(entry: dict) -> str:
    kind = entry.get('type')
    if kind == 'instant':
        return 'Instantaneous'
    if kind == 'special':
        return 'Special'
    if kind == 'permanent':
        ends = entry.get('ends') or []
        words = {'dispel': 'dispelled', 'trigger': 'triggered', 'discharge': 'discharged'}
        if not ends:
            return 'Permanent'
        return 'Until ' + ' or '.join(words.get(e, e) for e in ends)
    if kind == 'timed':
        duration = entry.get('duration') or {}
        return plural(duration.get('amount') or 1, duration.get('type') or 'minute')
    return 'Special'


def material_text(raw) -> str | None:
    if isinstance(raw, str):
        return L.strip_tags(raw)
    if isinstance(raw, dict) and raw.get('text'):
        return L.strip_tags(str(raw['text']))
    return None


def classes_of(info: dict, edition: str) -> tuple[list[str], int]:
    """Player classes whose own book is the same edition. Returns (slugs, other-edition grants)."""
    found: list[str] = []
    other = 0
    for bucket in ('class', 'classVariant'):
        for entry in info.get(bucket) or []:
            name = (entry.get('name') or '').lower()
            if name not in PLAYER_CLASSES:
                continue
            if L.edition_of(entry.get('source') or '') != edition:
                other += 1
                continue
            if name not in found:
                found.append(name)
    return found, other


def old_slug_index(spells: list[dict]) -> dict[tuple[str, str], str]:
    """(normalized name, edition) -> slug. A shortened SRD name is also indexed by that shortening
    ('Arcanist's Magic Aura' under 'magic aura') so the book name can reuse the slug."""
    exact: dict[tuple[str, str], str] = {}
    shortened: dict[tuple[str, str], list[str]] = defaultdict(list)
    for spell in spells:
        edition = str(spell.get('source') or '2014')
        slug = spell.get('index') or L.slugify(spell['name'])
        exact[(L.norm(spell['name']), edition)] = slug
        core = L.norm(core_name(spell['name']))
        if core != L.norm(spell['name']):
            shortened[(core, edition)].append(slug)
    for key, slugs in shortened.items():
        if key not in exact and len(set(slugs)) == 1:
            exact[key] = slugs[0]
    return exact


def lookup_old_slug(index: dict, name: str, edition: str, spell_names: set[str]) -> str | None:
    """Reuse a saved slug. The core name matches an SRD shortening ('Melf's Acid Arrow' -> 'Acid Arrow')
    and is ignored when that core is itself a different spell ('Jim's Magic Missile')."""
    hit = index.get((L.norm(name), edition))
    if hit:
        return hit
    core = core_name(name)
    if L.norm(core) != L.norm(name) and L.norm(core) not in spell_names:
        hit = index.get((L.norm(core), edition))
        if hit:
            return hit
    alias = BOOK_TO_SRD.get(name.lower())
    return index.get((L.norm(alias), edition)) if alias else None


def build() -> tuple[list[dict], dict[str, list], list[str]]:
    books = {s.upper() for s in INVENTORY['data']['Spells']}
    lists = L.fetch('spells/sources.json')
    flags: list[str] = []
    drafted: list[dict] = []
    by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)

    for source, filename in L.fetch('spells/index.json').items():
        if source.upper() not in books:
            continue
        data = L.fetch(f'spells/{filename}')
        for spell in data.get('spell', []):
            if spell.get('source', '').upper() not in books:
                continue
            if spell.get('_copy'):
                flags.append(f"{spell.get('name')} ({spell.get('source')}): _copy was not expected on a spell")
            edition = L.edition_of(spell['source'])
            by_key[(L.norm(spell['name']), edition)].append(spell)

    for (key, edition), group in by_key.items():
        group.sort(key=lambda s: L._publication_dates().get(s['source'].upper(), ''), reverse=True)
        spell = group[0]
        reprints = [s['source'] for s in group[1:]]
        info = (lists.get(spell['source']) or {}).get(spell['name']) or {}
        if not info:
            flags.append(f"{spell['name']} ({spell['source']}): no class-list entry")
        classes, other = classes_of(info, edition)
        if other:
            flags.append(
                f"{spell['name']} ({spell['source']}): {other} class grant(s) belong to the other edition "
                "and stay off this record"
            )
        if not classes and info:
            flags.append(f"{spell['name']} ({spell['source']}): no player-class list")

        durations = spell.get('duration') or [{}]
        components = spell.get('components') or {}
        material = material_text(components.get('m'))
        record = {
            'name': spell['name'],
            'level': spell.get('level', 0),
            'school': SCHOOL.get(spell.get('school'), spell.get('school') or 'Evocation'),
            'classes': classes,
            'casting_time': time_text(spell),
            'concentration': any(bool(d.get('concentration')) for d in durations),
            'ritual': bool((spell.get('meta') or {}).get('ritual')),
            'range': range_text(spell),
            'components': [c for c, present in (('V', components.get('v')), ('S', components.get('s')), ('M', components.get('m'))) if present],
            'duration': duration_text(durations[0]),
            'source': edition,
            'book': spell['source'].upper(),
            '_key': key,
            '_reprints': reprints,
        }
        if material:
            record['material'] = material
        if spell.get('damageInflict'):
            damage = str(spell['damageInflict'][0])
            record['damage'] = {'damage_type': {'index': damage.lower(), 'name': damage[:1].upper() + damage[1:]}}
        if spell.get('savingThrow'):
            save = SAVE.get(str(spell['savingThrow'][0]).lower())
            if save:
                record['dc'] = {'dc_type': {'index': save, 'name': save.upper()}}
        description = '\n\n'.join(p for p in L.render(spell.get('entries') or []) if p)
        higher = '\n\n'.join(p for p in L.render(spell.get('entriesHigherLevel') or []) if p)
        record['_text'] = {'description': description, 'atHigherLevels': higher}
        if not description:
            flags.append(f"{spell['name']} ({spell['source']}): no description")
        drafted.append(record)

    old = old_slug_index(json.loads(OUT.read_text()))
    spell_names = {L.norm(r['name']) for r in drafted}
    bases_2024 = {L.slugify(r['name']) for r in drafted if r['source'] == '2024'}
    used: dict[str, str] = {}
    for record in drafted:
        slug = lookup_old_slug(old, record['name'], record['source'], spell_names)
        if not slug:
            base = L.slugify(record['name'])
            slug = f'{base}-2014' if record['source'] == '2014' and base in bases_2024 else base
        owner = used.get(slug)
        if owner and owner != record['name']:
            flags.append(f"slug {slug} is wanted by {record['name']} and {owner}")
            slug = f"{slug}-{record['book'].lower()}"
        used[slug] = record['name']
        record['index'] = slug
        record['_text']['slug'] = slug

    drafted.sort(key=lambda r: (r['name'].lower(), r['source']))
    chunks: dict[str, list] = defaultdict(list)
    for record in drafted:
        text = record.pop('_text')
        chunks[record['book']].append({k: v for k, v in text.items() if v})
    return drafted, chunks, flags


def expanded_spells(records: list[dict]) -> tuple[dict[str, list[str]], list[str]]:
    """Background expanded lists (Ravnica, Strixhaven) resolved to slugs of the background's edition."""
    by_name: dict[tuple[str, str], str] = {}
    for record in records:
        by_name[(L.norm(record['name']), record['source'])] = record['index']
        by_name.setdefault((L.norm(core_name(record['name'])), record['source']), record['index'])
    flags: list[str] = []
    out: dict[str, list[str]] = {}
    for background in L.fetch('backgrounds.json').get('background', []):
        blocks = background.get('additionalSpells') or []
        if not blocks or 'expanded' not in blocks[0]:
            continue
        edition = L.edition_of(background['source'])
        slugs: list[str] = []
        missing: list[str] = []
        for level in blocks[0]['expanded'].values():
            for token in level:
                name = str(token).split('#')[0].split('|')[0].strip()
                slug = by_name.get((L.norm(name), edition)) or by_name.get((L.norm(core_name(name)), edition))
                if slug:
                    slugs.append(slug)
                else:
                    missing.append(name)
        out[f"{L.norm(background['name'])}|{background['source'].upper()}"] = slugs
        if missing:
            flags.append(f"{background['name']} ({background['source']}): expanded spells not found: {', '.join(missing)}")
    return out, flags


def apply_backgrounds(expanded: dict[str, list[str]]) -> int:
    backgrounds = json.loads(BACKGROUNDS.read_text())
    changed = 0
    for background in backgrounds:
        key = f"{L.norm(background['name'])}|{(background.get('source') or '').upper()}"
        slugs = expanded.get(key)
        if slugs:
            background['expandedSpells'] = slugs
            changed += 1
        else:
            background.pop('expandedSpells', None)
    L.write_json(BACKGROUNDS, backgrounds)
    return changed


def report(records: list[dict]) -> None:
    old = json.loads(OUT.read_text())
    old_classes: dict[tuple[str, str], set[str]] = {}
    for spell in old:
        edition = str(spell.get('source') or '2014')
        slug = spell.get('index') or L.slugify(spell['name'])
        classes = spell.get('classes') or []
        slugs = {c['index'] if isinstance(c, dict) else str(c).lower() for c in classes}
        old_classes[(slug, edition)] = slugs
    class_changes = []
    for record in records:
        previous = old_classes.get((record['index'], record['source']))
        if previous is not None and previous != set(record['classes']):
            class_changes.append(record['name'])
    print(f"{len(records)} spells ({sum(r['source']=='2014' for r in records)} for 2014, "
          f"{sum(r['source']=='2024' for r in records)} for 2024)")
    print(f"  class lists changed on {len(class_changes)} spells that already existed")
    by_slug = {r['index']: r for r in records}
    renamed, dropped = [], []
    for spell in old:
        slug = spell.get('index') or L.slugify(spell['name'])
        nxt = by_slug.get(slug)
        if nxt and L.norm(nxt['name']) != L.norm(spell['name']):
            renamed.append(f"{spell['name']} -> {nxt['name']}")
        elif nxt is None:
            dropped.append(f"{spell['name']} ({spell.get('source')})")
    if renamed:
        print(f"  renamed, slug kept: {', '.join(renamed)}")
    if dropped:
        print(f"  dropped {len(dropped)}: {', '.join(dropped[:12])}")


def main() -> None:
    apply = '--apply' in sys.argv
    records, chunks, flags = build()
    expanded, expand_flags = expanded_spells(records)
    flags.extend(expand_flags)
    report(records)
    # The cross-edition class grants are one line per spell and drown the real flags.
    quiet = [f for f in flags if 'other edition' in f]
    loud = [f for f in flags if 'other edition' not in f]
    print(f"\nFlags ({len(loud)}), plus {len(quiet)} spells that a later class list also names:")
    for line in loud:
        print(f'  {line}')
    if apply:
        clean = []
        for record in records:
            record.pop('_key', None)
            record.pop('_reprints', None)
            clean.append(record)
        L.write_json(OUT, clean)
        written = L.write_chunks('spells', chunks)
        changed = apply_backgrounds(expanded)
        print(f"\nwrote {OUT} ({len(clean)} spells), {len(written)} text chunks, {changed} background spell lists")


if __name__ == '__main__':
    main()
