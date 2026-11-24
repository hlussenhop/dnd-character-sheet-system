#!/usr/bin/env python3
"""Shared helpers for the content-integration lane scripts (see docs/content-integration/fast-lane-plan.md).

Everything a lane generator needs that is not lane-specific:

  * fetch()/fetch_dir(): cached download of any file from the 5etools data mirror
  * strip_tags()/render()/entry_text(): 5etools markup and entries -> plain text
  * resolve_copy()/apply_mod()/expand_versions(): the `_copy`, `_mod` and `_versions` mechanisms
  * edition_of(): source abbreviation -> '2014' | '2024' (publication date of the book)
  * classify_text(): reuse / accept / override / new / conflict decision for a named text
  * write_json(): the JSON format used by every file under src/data

The species batch scripts (build_species_b*.py) predate this module and keep their own copies.
"""
from __future__ import annotations

import copy
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Iterable

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'src' / 'data'
CACHE = Path(__file__).resolve().parent / '.cache'
BASE_RAW = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data'
EDITION_CUTOFF = '2024-09-01'


# ---------------------------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------------------------

def cache_path(rel_path: str) -> Path:
    return CACHE / rel_path


def fetch(rel_path: str, refresh: bool = False) -> Any:
    """JSON file under the mirror's data/ directory (e.g. 'feats.json', 'spells/spells-xge.json').

    Cached in sourcebooks/.cache/<rel_path>; the cache is used as-is unless refresh=True.
    """
    path = cache_path(rel_path)
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    url = f'{BASE_RAW}/{rel_path}'
    print(f'downloading {rel_path} ...', file=sys.stderr)
    last: Exception | None = None
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'nexus-forge-lanes/1.0'})
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
            break
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
            time.sleep(attempt)
    else:
        raise RuntimeError(f'could not fetch {url}: {last}')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return json.loads(raw)


def fetch_dir(directory: str, refresh: bool = False) -> dict[str, Any]:
    """Every file listed in <directory>/index.json (spells, bestiary, class), keyed by source.

    The index maps source abbreviation -> file name, e.g. {"XGE": "spells-xge.json"}.
    """
    index = fetch(f'{directory}/index.json', refresh)
    return {source: fetch(f'{directory}/{name}', refresh) for source, name in index.items()}


# ---------------------------------------------------------------------------------------------
# Editions
# ---------------------------------------------------------------------------------------------

_published: dict[str, str] | None = None


def _publication_dates() -> dict[str, str]:
    global _published
    if _published is None:
        dates: dict[str, str] = {}
        for rel, key in (('books.json', 'book'), ('adventures.json', 'adventure')):
            for b in fetch(rel).get(key, []):
                dates.setdefault(b['id'].upper(), b.get('published', ''))
        _published = dates
    return _published


def edition_of(source: str, dates: dict[str, str] | None = None) -> str:
    """'2024' for books published on/after 2024-09-01 (XPHB, XDMG, XMM, EFA, ...), else '2014'.

    Unknown sources (homebrew, UA, setting supplements missing from the catalog) count as 2014.
    """
    published = (dates if dates is not None else _publication_dates()).get(source.upper(), '')
    return '2024' if published >= EDITION_CUTOFF else '2014'


# ---------------------------------------------------------------------------------------------
# Text
# ---------------------------------------------------------------------------------------------

TAG_RE = re.compile(r'\{@(\w+)\s*([^{}]*)\}')


def strip_tags(text: str) -> str:
    """Turn 5etools {@tag a|b|c} markup into plain text (innermost tags first)."""
    def sub(m: re.Match) -> str:
        tag, body = m.group(1), m.group(2)
        parts = body.split('|')
        if tag == 'dc':
            return f'DC {parts[0]}'
        if tag in ('dice', 'damage', 'd20', 'scaledice', 'scaledamage'):
            return parts[-1] if tag.startswith('scale') else parts[0]
        if tag == 'hit':
            return f'+{parts[0]}' if not parts[0].startswith(('+', '-')) else parts[0]
        if tag in ('filter', 'quickref', 'book', 'adventure', 'note', 'b', 'bold', 'i', 'italic', 'u', 's', 'strike', 'code'):
            return parts[0]
        if tag == 'atk':
            return {'mw': 'Melee Weapon Attack:', 'rw': 'Ranged Weapon Attack:', 'ms': 'Melee Spell Attack:',
                    'rs': 'Ranged Spell Attack:', 'mw,rw': 'Melee or Ranged Weapon Attack:',
                    'm': 'Melee Attack Roll:', 'r': 'Ranged Attack Roll:', 'm,r': 'Melee or Ranged Attack Roll:'}.get(parts[0], parts[0])
        if tag == 'h':
            return 'Hit: '
        if tag == 'recharge':
            return f'(Recharge {parts[0]}-6)' if parts[0] and parts[0] != '6' else '(Recharge 6)'
        # tags whose 3rd segment is display text ({@spell name|source|display})
        if len(parts) >= 3 and parts[2]:
            return parts[2]
        return parts[0]
    prev = None
    while prev != text:
        prev = text
        text = TAG_RE.sub(sub, text)
    return text


def _table_text(entry: dict) -> list[str]:
    caption = entry.get('caption')
    labels = [strip_tags(str(c)) for c in entry.get('colLabels', [])]
    rows = []
    for row in entry.get('rows', []):
        cells = row.get('row', []) if isinstance(row, dict) else row
        rows.append(' | '.join(' '.join(render(c)) if not isinstance(c, (str, int, float)) else strip_tags(str(c)) for c in cells))
    head = [caption] if caption else []
    if labels:
        head.append(' | '.join(labels))
    return head + rows


def render(entry: Any) -> list[str]:
    """Flatten a 5etools entry tree into plain-text paragraphs."""
    if entry is None:
        return []
    if isinstance(entry, (str, int, float)):
        return [strip_tags(str(entry))]
    if isinstance(entry, list):
        return [p for sub in entry for p in render(sub)]
    t = entry.get('type')
    if t == 'list':
        out = []
        for item in entry.get('items', []):
            if isinstance(item, dict) and item.get('type') in ('item', 'itemSub'):
                body = item.get('entry') if item.get('entry') is not None else ' '.join(render(item.get('entries', [])))
                out.append(f"{strip_tags(item['name'])}: {strip_tags(body)}" if item.get('name') else strip_tags(body))
            else:
                out.extend(render(item))
        return out
    if t == 'table':
        return _table_text(entry)
    if t in ('item', 'itemSub'):
        body = entry.get('entry') if entry.get('entry') is not None else ' '.join(render(entry.get('entries', [])))
        return [f"{strip_tags(entry.get('name', ''))}: {strip_tags(body)}".strip(': ')]
    if t in ('quote',):
        return render(entry.get('entries', []))
    if t in ('abilityDc', 'abilityAttackMod'):
        attrs = '/'.join(a.upper() for a in entry.get('attributes', []))
        what = 'save DC = 8 + your proficiency bonus' if t == 'abilityDc' else 'attack modifier = your proficiency bonus'
        return [f"{entry.get('name', '')} {what} + your {attrs} modifier".strip()]
    if 'entries' in entry:  # entries, inset, insetReadaloud, section, variant, variantSub, options, ...
        return render(entry['entries'])
    if 'entry' in entry:
        return render(entry['entry'])
    return []


def entry_text(entry: Any, drop_insets: bool = True) -> str:
    """Plain text of one named entry (feat, trait, item...). Tip insets are dropped by default."""
    if isinstance(entry, dict) and drop_insets:
        entry = dict(entry)
        entry['entries'] = [e for e in entry.get('entries', []) if not (isinstance(e, dict) and e.get('type') == 'inset')]
    return '\n'.join(p for p in render(entry) if p)


def norm(s: str) -> str:
    """Comparison key: lower-case alphanumerics only (wording-insensitive to punctuation/case)."""
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()


def slugify(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', strip_tags(s).lower().replace("'", '')).strip('-')


# ---------------------------------------------------------------------------------------------
# _copy / _mod / _versions
# ---------------------------------------------------------------------------------------------

# Parent properties that describe the parent's own publication, not the copy
COPY_DROP = {'_versions', '_copy', 'srd', 'srd52', 'basicRules', 'basicRules2024', 'reprintedAs', 'otherSources',
             'additionalSources', 'hasFluff', 'hasFluffImages', 'page', 'isReprinted', 'legendaryGroup'}

UNSUPPORTED_MODES: set[str] = set()


class ModError(ValueError):
    pass


def _named(item: Any) -> str | None:
    return item.get('name') if isinstance(item, dict) else (item if isinstance(item, str) else None)


def _as_list(v: Any) -> list:
    return v if isinstance(v, list) else [v]


def _find_index(arr: list, replace: Any) -> int:
    if isinstance(replace, dict):
        if 'index' in replace:
            return replace['index']
        if 'regex' in replace:
            rx = re.compile(replace['regex'], re.I if 'i' in replace.get('flags', '') else 0)
            return next((i for i, x in enumerate(arr) if isinstance(_named(x), str) and rx.search(_named(x))), -1)
    return next((i for i, x in enumerate(arr) if _named(x) == replace), -1)


TEXT_KEYS = {'entries', 'entry', 'items', 'headerEntries', 'footerEntries'}


def _replace_txt(value: Any, rx: re.Pattern, repl: str, keys: set[str]) -> Any:
    """Rewrite strings inside entry trees: bare strings and values under `keys` (never names/sources)."""
    if isinstance(value, str):
        return rx.sub(repl, value)
    if isinstance(value, list):
        return [_replace_txt(v, rx, repl, keys) for v in value]
    if isinstance(value, dict):
        return {k: (_replace_txt(v, rx, repl, keys) if k in keys else v) for k, v in value.items()}
    return value


def _scalar(value: Any, scalar: float, mult: bool, floor: bool) -> Any:
    """Add/multiply a number or a signed numeric string ("+5")."""
    signed = isinstance(value, str) and re.fullmatch(r'[+-]?\d+', value.strip() or 'x')
    if not isinstance(value, (int, float)) and not signed:
        return value
    num = int(value) if signed else value
    res = num * scalar if mult else num + scalar
    if floor or isinstance(num, int) and not mult:
        res = int(res // 1) if floor else int(res)
    return f'{res:+d}' if signed else res


def apply_mod(obj: dict, mod: dict, strict: bool = True, handlers: dict[str, Callable] | None = None) -> dict:
    """Apply a 5etools `_mod` block to a (deep-copied) entity, in place; returns the entity.

    Generic modes are handled here. Lane-specific modes (bestiary: addSpells, replaceSpells, removeSpells,
    addSkills, addSenses, scalarAddHit, ...; these usually sit under the entity-level prop "_") can be passed
    in `handlers` as {mode: fn(obj, prop, m)}. Unknown modes raise ModError when strict, otherwise they are
    recorded in UNSUPPORTED_MODES and skipped.
    """
    handlers = handlers or {}
    for prop, mods in mod.items():
        for m in _as_list(mods):
            if isinstance(m, str):  # "remove" shorthand: {"prop": "remove"}
                if m == 'remove':
                    obj.pop(prop, None)
                    continue
                raise ModError(f'unknown string mod {m!r} on {prop}')
            mode = m.get('mode')
            if mode in handlers:
                handlers[mode](obj, prop, m)
                continue
            if prop == '*' and mode != 'replaceTxt':
                raise ModError(f'mode {mode} not valid on "*"')
            if mode == 'replaceTxt':
                rx = re.compile(m['replace'], re.I if 'i' in m.get('flags', '') else 0)
                keys = TEXT_KEYS | set(m.get('props') or [])
                for k in ([k for k in obj if not k.startswith('_')] if prop == '*' else [prop]):
                    if isinstance(obj.get(k), (list, dict)) or (k == prop and isinstance(obj.get(k), str)):
                        obj[k] = _replace_txt(obj[k], rx, m['with'], keys)
                continue
            if mode == 'prefixSuffixStringProp':
                if isinstance(obj.get(prop), str):
                    obj[prop] = f"{m.get('prefix', '')}{obj[prop]}{m.get('suffix', '')}"
                continue
            if mode in ('scalarAddProp', 'scalarMultProp'):
                target = obj.get(prop)
                mult = mode == 'scalarMultProp'
                if isinstance(target, dict):
                    for k in (list(target) if m['prop'] == '*' else [m['prop']]):
                        if k in target:
                            target[k] = _scalar(target[k], m['scalar'], mult, m.get('floor', False))
                elif target is not None:
                    obj[prop] = _scalar(target, m['scalar'], mult, m.get('floor', False))
                continue
            if mode == 'setProp':
                path = m['prop'].split('.')
                target = obj if prop in ('_', '*') else obj.setdefault(prop, {})
                for k in path[:-1]:
                    target = target.setdefault(k, {})
                target[path[-1]] = copy.deepcopy(m['value'])
                continue
            arr = obj.setdefault(prop, [])
            if not isinstance(arr, list):
                raise ModError(f'{mode} on non-array property {prop}')
            items = _as_list(m.get('items', []))
            if mode == 'appendArr':
                arr.extend(copy.deepcopy(items))
            elif mode == 'prependArr':
                arr[0:0] = copy.deepcopy(items)
            elif mode == 'appendIfNotExistsArr':
                arr.extend(copy.deepcopy(i) for i in items if i not in arr)
            elif mode == 'insertArr':
                arr[m['index']:m['index']] = copy.deepcopy(items)
            elif mode in ('replaceArr', 'replaceOrAppendArr'):
                i = _find_index(arr, m['replace'])
                if i < 0:
                    if mode == 'replaceOrAppendArr':
                        arr.extend(copy.deepcopy(items))
                        continue
                    if strict:
                        raise ModError(f'replaceArr: {m["replace"]!r} not found in {prop}')
                    continue
                arr[i:i + 1] = copy.deepcopy(items)
            elif mode == 'renameArr':
                for r in _as_list(m['renames']):
                    i = _find_index(arr, r['rename'])
                    if i < 0:
                        if strict:
                            raise ModError(f'renameArr: {r["rename"]!r} not found in {prop}')
                        continue
                    arr[i] = {**arr[i], 'name': r['with']}
            elif mode == 'removeArr':
                names = _as_list(m.get('names', []))
                remove_items = _as_list(m['items']) if 'items' in m else []
                before = len(arr)
                arr[:] = [x for x in arr if _named(x) not in names and x not in remove_items]
                if strict and before - len(arr) < len(names) + len(remove_items) and not m.get('force'):
                    raise ModError(f'removeArr: not all of {names or remove_items} found in {prop}')
            else:
                if strict:
                    raise ModError(f'unsupported _mod mode {mode!r} (prop {prop})')
                UNSUPPORTED_MODES.add(mode)
    return obj


def resolve_copy(entity: dict, lookup: Callable[[str, str], dict | None], strict: bool = True,
                 handlers: dict[str, Callable] | None = None, _depth: int = 0) -> dict:
    """Return a new entity with its `_copy` chain resolved.

    `lookup(name, source)` returns the raw parent entity (or None). The parent is resolved first
    (recursively), its publication-only properties (COPY_DROP) are dropped unless listed in the copy's
    `_preserve`, the child's own properties override, a child value of None deletes the property
    (e.g. `"lineage": null`), and finally the copy's `_mod` is applied.
    """
    if '_copy' not in entity:
        return copy.deepcopy(entity)
    if _depth > 10:
        raise ModError(f'_copy chain too deep at {entity.get("name")}')
    ref = entity['_copy']
    parent_raw = lookup(ref['name'], ref['source'])
    if parent_raw is None:
        raise ModError(f'_copy parent not found: {ref["name"]}|{ref["source"]} (for {entity.get("name")}|{entity.get("source")})')
    parent = resolve_copy(parent_raw, lookup, strict, handlers, _depth + 1)
    preserve = set((ref.get('_preserve') or {}).keys())
    out = {k: v for k, v in parent.items() if k not in COPY_DROP or k in preserve}
    for k, v in entity.items():
        if k == '_copy':
            continue
        if v is None:
            out.pop(k, None)
        else:
            out[k] = copy.deepcopy(v)
    if ref.get('_mod'):
        apply_mod(out, ref['_mod'], strict, handlers)
    return out


def make_lookup(entities: Iterable[dict]) -> Callable[[str, str], dict | None]:
    """Case-insensitive (name, source) lookup over a list of raw entities."""
    index = {(e['name'].lower(), e['source'].lower()): e for e in entities if 'name' in e and 'source' in e}
    return lambda name, source: index.get((name.lower(), source.lower()))


def _fill_template(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return re.sub(r'\{\{(\w+)\}\}', lambda m: str(variables.get(m.group(1), m.group(0))), value)
    if isinstance(value, list):
        return [_fill_template(v, variables) for v in value]
    if isinstance(value, dict):
        return {k: _fill_template(v, variables) for k, v in value.items()}
    return value


def expand_versions(entity: dict, strict: bool = True, handlers: dict[str, Callable] | None = None) -> list[dict]:
    """The entity's `_versions` as full entities (base minus `_versions`, version props, version `_mod`).

    Supports both plain versions ({name, source, _mod, ...}) and abstract templates
    ({_abstract: {...}, _implementations: [{_variables: {...}, ...}]}), whose `{{var}}` placeholders are
    filled from each implementation's `_variables`.
    """
    base = {k: v for k, v in entity.items() if k != '_versions'}
    out = []
    for version in entity.get('_versions', []):
        if '_abstract' in version:
            for impl in version.get('_implementations', []):
                variables = impl.get('_variables', {})
                template = _fill_template(copy.deepcopy(version['_abstract']), variables)
                merged = {**template, **{k: v for k, v in impl.items() if k != '_variables'}}
                out.append(_apply_version(base, merged, strict, handlers))
        else:
            out.append(_apply_version(base, version, strict, handlers))
    return out


def _apply_version(base: dict, version: dict, strict: bool, handlers: dict[str, Callable] | None) -> dict:
    v = copy.deepcopy(base)
    for k, val in version.items():
        if k == '_mod':
            continue
        if val is None:
            v.pop(k, None)
        else:
            v[k] = copy.deepcopy(val)
    if version.get('_mod'):
        apply_mod(v, version['_mod'], strict, handlers)
    return v


# ---------------------------------------------------------------------------------------------
# Conflict classifier
# ---------------------------------------------------------------------------------------------

def classify_text(name: str, text: str, store: dict[str, dict], edition: str,
                  accept: set[str] = frozenset(), key: str = 'description') -> tuple[str, str]:
    """Decide how a named text joins a name-keyed store such as featureDescriptions.json.

    Returns (action, store_key):
      'new'      -> write store[name]                     (name not stored yet)
      'reuse'    -> nothing to write                      (stored text is the same, wording-insensitive)
      'accept'   -> nothing to write                      (differs, but `name` is in `accept`)
      'override' -> write store[f'{name} [2024]']         (2024 text for a name whose stored text is 2014)
      'conflict' -> needs a rename                        (same edition, different text)

    The edition rule: the plain key holds the 2014 (or only) text, `"<name> [2024]"` the 2024 text.
    """
    plain, over = store.get(name), store.get(f'{name} [2024]')
    if edition == '2024' and over is not None:
        if norm(over[key]) == norm(text):
            return 'reuse', f'{name} [2024]'
        return ('accept' if name in accept else 'conflict'), f'{name} [2024]'
    if plain is None:
        return 'new', name
    if norm(plain[key]) == norm(text):
        return 'reuse', name
    if name in accept:
        return 'accept', name
    if edition == '2024':
        return 'override', f'{name} [2024]'
    return 'conflict', name


# ---------------------------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------------------------

def dumps(obj: Any) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + '\n'


def write_json(path: Path | str, obj: Any) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(obj))


CONTENT = DATA / 'content'


def write_chunks(lane: str, records_by_source: dict[str, list], root: Path = CONTENT) -> list[Path]:
    """Write a lazy-loaded lane as src/data/content/<lane>/<SOURCE>.json (read by src/services/contentChunks.ts).

    One JSON array per source; chunks of sources no longer present are deleted so the lane is exactly
    what was generated. Returns the written paths.
    """
    lane_dir = root / lane
    lane_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for source, records in sorted(records_by_source.items()):
        if not records:
            continue
        path = lane_dir / f'{source.upper()}.json'
        write_json(path, records)
        written.append(path)
    for stale in set(lane_dir.glob('*.json')) - set(written):
        stale.unlink()
    return written


def read_json(path: Path | str) -> Any:
    return json.loads(Path(path).read_text())
