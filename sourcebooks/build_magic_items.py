#!/usr/bin/env python3
"""Magic items. Report by default; --apply writes the catalog and the lazy chunks.

Reads items.json for every book in content_inventory.json. Mundane records
(rarity "none": gear, gems, vehicles) stay out; equipment.json already covers
the gear the app uses. One record per name and edition. The newest printing
in that edition wins, and the others are listed in sources.

Descriptions go to src/data/content/magic-items/<SOURCE>.json. The catalog
src/data/magicItems.json is the same records without the description, so the
app can list items without pulling every book's text into the bundle.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict

import lanelib as L

INVENTORY = json.loads((L.ROOT / 'sourcebooks' / 'content_inventory.json').read_text())
BOOKS = {code.upper() for code in INVENTORY['source_books']}
CATALOG = L.DATA / 'magicItems.json'
SPELLS = L.DATA / 'srd' / '5e-SRD-Spells-Merged.json'
EQUIPMENT = L.DATA / 'equipment.json'

ABILITY = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}
SPEEDS = ('walk', 'fly', 'climb', 'swim', 'burrow')
SPELL_SKIP = {'ability', 'slot', 'name', 'hidden', 'type', 'choose', 'filter'}


def dates() -> dict[str, str]:
    found: dict[str, str] = {}
    for rel, key in (('books.json', 'book'), ('adventures.json', 'adventure')):
        for book in L.fetch(rel).get(key, []):
            found.setdefault(book['id'].upper(), book.get('published', ''))
    return found


def bonus(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if text[:1] in '+-':
        text = text[1:] if text[:1] == '+' else text
    try:
        return int(text)
    except ValueError:
        return None


def strings(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def type_names(base: dict) -> dict[str, str]:
    """Abbreviation -> display name. A later book of the same code overwrites."""
    names: dict[str, str] = {}
    for row in base.get('itemType', []):
        code = row.get('abbreviation')
        if code and row.get('name'):
            names[code] = row['name']
    return names


def property_names(base: dict) -> dict[str, str]:
    names: dict[str, str] = {}
    for row in base.get('itemProperty', []):
        code = row.get('abbreviation')
        entries = row.get('entries') or []
        title = entries[0].get('name') if entries and isinstance(entries[0], dict) else None
        if code and title:
            names[code] = title
    return names


def equipment_index() -> dict[str, str]:
    """Normalized equipment name -> index (the slug the app already uses)."""
    found: dict[str, str] = {}
    for row in json.loads(EQUIPMENT.read_text()):
        found.setdefault(L.norm(row['name']), row.get('index') or row.get('slug') or L.slugify(row['name']))
    return found


def spell_index() -> dict[str, list[dict]]:
    by_name: dict[str, list[dict]] = defaultdict(list)
    for spell in json.loads(SPELLS.read_text()):
        by_name[L.norm(spell['name'])].append(spell)
    return by_name


def lookup_of(rows: list[dict]):
    table = {(row.get('name'), (row.get('source') or '').upper()): row for row in rows}

    def lookup(name: str, source: str):
        return table.get((name, (source or '').upper()))

    return lookup


def walk_spells(node, found: list[str], choices: list[str]) -> None:
    if isinstance(node, str):
        found.append(node)
        return
    if isinstance(node, list):
        for child in node:
            walk_spells(child, found, choices)
        return
    if not isinstance(node, dict):
        return
    if any(key in node for key in ('choose', 'filter', '_')):
        choices.append('choose')
    for key, value in node.items():
        if key in SPELL_SKIP:
            continue
        walk_spells(value, found, choices)


def resolve_spell(ref: str, edition: str, spells: dict[str, list[dict]]) -> str | None:
    body = ref.split('#', 1)[0]
    name, source = (body.split('|', 1) + [''])[:2]
    options = spells.get(L.norm(name), [])
    if not options:
        return None
    source = source.upper()
    if source:
        by_book = [spell for spell in options if (spell.get('book') or '').upper() == source]
        if by_book:
            return by_book[0]['index']
        edition = L.edition_of(source)
    same = [spell for spell in options if spell.get('source') == edition]
    return (same or options)[0]['index']


def movement_of(raw) -> tuple[dict | None, list[str]]:
    if not isinstance(raw, dict):
        return None, ['movement is not an object']
    out: dict = {}
    flags: list[str] = []
    equal = raw.get('equal')
    if isinstance(equal, dict):
        matched = [mode for mode, target in equal.items() if target == 'walk' and mode in SPEEDS]
        if matched:
            out['equalToWalk'] = matched
        if any(target != 'walk' or mode not in SPEEDS for mode, target in equal.items()):
            flags.append('movement equal has a mode other than matching walk')
    static = raw.get('static')
    if isinstance(static, dict):
        speeds = {mode: int(value) for mode, value in static.items() if mode in SPEEDS and isinstance(value, (int, float))}
        if speeds:
            out['set'] = speeds
        if any(mode not in SPEEDS for mode in static):
            flags.append('movement set has an unknown mode')
    multiply = raw.get('multiply')
    if isinstance(multiply, dict) and isinstance(multiply.get('walk'), (int, float)):
        out['multiplyWalk'] = multiply['walk']
    elif 'multiply' in raw:
        flags.append('movement multiply is not a walk multiplier')
    if set(raw) - {'equal', 'static', 'multiply'}:
        flags.append('movement has an unmodelled mode')
    return (out or None), flags


def ability_of(raw) -> tuple[dict, dict, list[str]]:
    score: dict[str, int] = {}
    bonus_map: dict[str, int] = {}
    flags: list[str] = []
    if not isinstance(raw, dict):
        return score, bonus_map, ['ability is not an object']
    if 'choose' in raw or 'from' in raw:
        flags.append('ability choice')
    static = raw.get('static') if isinstance(raw.get('static'), dict) else {}
    direct = {key: value for key, value in raw.items() if key not in ('static', 'choose', 'from', 'count', 'amount')}
    for code, value in {**direct, **{f'static:{key}': val for key, val in static.items()}}.items():
        ability = code.split(':', 1)[-1]
        if ability not in ABILITY or not isinstance(value, int):
            flags.append(f'ability {code}')
            continue
        (score if code.startswith('static:') else bonus_map)[ABILITY[ability]] = value
    return score, bonus_map, flags


def build_record(raw: dict, edition: str, published: str, types: dict[str, str], props: dict[str, str],
                 gear: dict[str, str], spells: dict[str, list[dict]]) -> tuple[dict, list[str]]:
    flags: list[str] = []
    code = ''
    raw_type = raw.get('type')
    if isinstance(raw_type, str) and raw_type:
        code = raw_type.split('|', 1)[0]
    item_type = types.get(code) or ('Staff' if raw.get('staff') else 'Wondrous Item' if raw.get('wondrous') else 'Magic Item')
    attune = raw.get('reqAttune')
    record: dict = {
        'name': raw['name'],
        'edition': edition,
        'source': (raw.get('source') or '').upper(),
        'rarity': raw.get('rarity') or 'unknown',
        'attunement': bool(attune),
        'itemType': item_type,
        '_date': published,
    }
    if isinstance(attune, str) and attune.strip():
        record['attunementRequirement'] = L.strip_tags(attune).strip()
    if code:
        record['typeCode'] = code
    if raw.get('wondrous'):
        record['wondrous'] = True
    if raw.get('staff'):
        record['staff'] = True
    if raw.get('curse') is True:
        record['cursed'] = True
    if raw.get('sentient') is True:
        record['sentient'] = True
    if raw.get('tier') in ('minor', 'major'):
        record['tier'] = raw['tier']
    if isinstance(raw.get('weight'), (int, float)):
        record['weight'] = raw['weight']
    if isinstance(raw.get('value'), int):
        record['valueCp'] = raw['value']
    if isinstance(raw.get('charges'), int):
        record['charges'] = raw['charges']
    if isinstance(raw.get('recharge'), str):
        record['recharge'] = L.strip_tags(raw['recharge'])
    amount = raw.get('rechargeAmount')
    if amount is not None:
        record['rechargeAmount'] = L.strip_tags(str(amount)) if not isinstance(amount, (int, float)) else str(amount)
    if raw.get('grantsProficiency') is True:
        record['proficient'] = True

    for field in ('bonusAc', 'bonusWeapon', 'bonusWeaponAttack', 'bonusWeaponDamage', 'bonusSpellAttack',
                  'bonusSpellSaveDc', 'bonusSavingThrow', 'bonusAbilityCheck', 'bonusProficiencyBonus',
                  'bonusSavingThrowConcentration'):
        parsed = bonus(raw.get(field)) if field in raw else None
        if parsed is not None:
            record[field] = parsed
        elif field in raw:
            flags.append(f'{field} {raw.get(field)!r}')

    score, ability_bonus, ability_flags = ability_of(raw.get('ability')) if 'ability' in raw else ({}, {}, [])
    flags += ability_flags
    if score:
        record['abilityScoreSet'] = score
    if ability_bonus:
        record['abilityBonus'] = ability_bonus

    for field in ('resist', 'immune', 'conditionImmune'):
        values = strings(raw.get(field))
        if values:
            record[field] = values
        elif field in raw and raw.get(field):
            flags.append(f'{field} is not a list of names')

    move, move_flags = movement_of(raw.get('modifySpeed')) if 'modifySpeed' in raw else (None, [])
    flags += move_flags
    if move:
        record['movement'] = move

    focus = strings(raw.get('focus'))
    if focus:
        record['focus'] = focus

    prop_list = []
    for code_or_obj in raw.get('property') or []:
        abbr = code_or_obj.split('|', 1)[0] if isinstance(code_or_obj, str) else None
        if abbr and abbr in props:
            prop_list.append(props[abbr])
        elif abbr:
            flags.append(f'property {abbr}')
    if prop_list:
        record['properties'] = prop_list

    base = raw.get('baseItem')
    if isinstance(base, str) and base:
        base_name = base.split('|', 1)[0]
        matched = gear.get(L.norm(base_name.replace('-', ' '))) or gear.get(L.norm(base_name))
        if matched:
            record['baseItem'] = matched
        else:
            flags.append(f'base item {base_name}')

    found: list[str] = []
    choices: list[str] = []
    if raw.get('attachedSpells'):
        walk_spells(raw['attachedSpells'], found, choices)
    if choices:
        flags.append('spell choice')
    resolved: list[str] = []
    for ref in found:
        slug = resolve_spell(ref, edition, spells)
        if slug and slug not in resolved:
            resolved.append(slug)
        elif not slug:
            flags.append(f'spell {ref.split("#", 1)[0]}')
    if resolved:
        record['spells'] = resolved

    text = L.entry_text(raw).strip()
    record['description'] = text
    if not text:
        flags.append('no description')
    return record, flags


def main() -> None:
    apply = '--apply' in sys.argv
    published = dates()
    items = L.fetch('items.json')
    base = L.fetch('items-base.json')
    types = type_names(base)
    props = property_names(base)
    gear = equipment_index()
    spells = spell_index()
    rows = items.get('item', []) + base.get('baseitem', [])
    lookup = lookup_of(rows)

    kept: list[dict] = []
    flag_rows: list[tuple[str, str, str]] = []
    copy_failures: list[str] = []
    mundane = 0
    outside = 0

    for raw in items.get('item', []):
        source = (raw.get('source') or '').upper()
        if source not in BOOKS:
            outside += 1
            continue
        if raw.get('rarity') == 'none':
            mundane += 1
            continue
        try:
            resolved = L.resolve_copy(raw, lookup, strict=False) if '_copy' in raw else raw
        except L.ModError as exc:
            copy_failures.append(f"{raw.get('name')}|{source}: {exc}")
            resolved = raw
        if resolved.get('rarity') == 'none':
            mundane += 1
            continue
        edition = L.edition_of(source, published)
        record, flags = build_record(resolved, edition, published.get(source, ''), types, props, gear, spells)
        for flag in flags:
            flag_rows.append((record['name'], edition, flag))
        kept.append(record)

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for record in kept:
        grouped[(L.norm(record['name']), record['edition'])].append(record)

    winners: list[dict] = []
    rarity_clashes: list[str] = []
    for group in grouped.values():
        group.sort(key=lambda record: (record['_date'], record['source'], len(record.get('description', ''))))
        winner = group[-1]
        ordered = [winner['source']]
        for record in sorted(group, key=lambda item: (item['_date'], item['source']), reverse=True):
            if record['source'] not in ordered:
                ordered.append(record['source'])
        winner['sources'] = ordered
        rarities = sorted({record['rarity'] for record in group})
        if len(rarities) > 1:
            rarity_clashes.append(f"{winner['name']} [{winner['edition']}] {' / '.join(rarities)}")
        winners.append(winner)

    used: set[str] = set()
    slug_clashes: list[str] = []
    for record in sorted(winners, key=lambda item: (item['edition'], item['name'])):
        shown = f"plus {record['name'][1:]}" if record['name'].startswith('+') else record['name']
        slug = L.slugify(shown) + ('-2024' if record['edition'] == '2024' else '')
        candidate = slug
        number = 2
        while candidate in used:
            slug_clashes.append(f"{record['name']} -> {candidate}")
            candidate = f'{slug}-{number}'
            number += 1
        record['slug'] = candidate
        used.add(candidate)

    by_edition = defaultdict(int)
    by_rarity = defaultdict(int)
    by_source = defaultdict(int)
    for record in winners:
        by_edition[record['edition']] += 1
        by_rarity[record['rarity']] += 1
        by_source[record['source']] += 1

    print(f'Inventory item rows outside this catalog: {outside} other books, {mundane} mundane (rarity none)')
    print(f'Records: {len(winners)} ({by_edition["2014"]} for 2014, {by_edition["2024"]} for 2024) from {len(kept)} printings')
    print('Rarity:', ', '.join(f'{name} {count}' for name, count in sorted(by_rarity.items())))
    print('Sources:', ', '.join(f'{name} {count}' for name, count in sorted(by_source.items())))
    print(f'Copy failures: {len(copy_failures)}')
    for line in copy_failures[:12]:
        print(f'  {line}')
    print(f'Rarity clashes within an edition: {len(rarity_clashes)}')
    for line in rarity_clashes[:12]:
        print(f'  {line}')
    print(f'Slug clashes: {len(slug_clashes)}')
    if L.UNSUPPORTED_MODES:
        print('Unsupported _mod modes:', ', '.join(sorted(L.UNSUPPORTED_MODES)))

    kinds: dict[str, list[str]] = defaultdict(list)
    for name, edition, flag in flag_rows:
        kind = flag.split(' ', 1)[0]
        kinds[kind].append(f'{name} [{edition}] {flag}')
    print('Flags:')
    for kind in sorted(kinds):
        samples = kinds[kind][:8]
        print(f'  {kind}: {len(kinds[kind])}')
        for line in samples:
            print(f'    {line}')

    if not apply:
        print('\nDry run. Pass --apply to write the catalog and chunks.')
        return

    catalog = []
    chunks: dict[str, list] = defaultdict(list)
    for record in sorted(winners, key=lambda item: item['slug']):
        full = {key: value for key, value in record.items() if key != '_date'}
        chunks[full['source']].append(full)
        catalog.append({key: value for key, value in full.items() if key != 'description'})
    L.write_json(CATALOG, catalog)
    written = L.write_chunks('magic-items', chunks)
    print(f'\nWrote {CATALOG.relative_to(L.ROOT)} ({len(catalog)} records) and {len(written)} chunks.')


if __name__ == '__main__':
    main()
