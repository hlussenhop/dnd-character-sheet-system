#!/usr/bin/env python3
"""
scrape_5etools_books.py

Downloads the full text of every sourcebook listed on 5e.tools and writes
one Markdown file per book into the /sourcebooks directory.

Rather than driving a browser against 5e.tools itself (which sits behind
Cloudflare bot-protection and renders everything client-side via JS), this
pulls the same underlying JSON data 5e.tools uses to render pages, from the
public GitHub mirror of its data repo. That mirror is plain, unauthenticated
HTTP/JSON, so no browser automation is required.

Each book's JSON is a tree of "entries" (sections, lists, tables, quotes,
insets, etc.) plus "statblock" placeholders that just point at a name/source
in a separate reference file (races.json, feats.json, backgrounds.json,
items.json, a per-source spell file, a per-source bestiary file, or a
per-class file for class/subclass features). This script resolves all of
those references and inlines a rendered version of the referenced content,
so the output is a genuine full transcription rather than a shell full of
"see Races chapter" placeholders.

Usage:
    python3 scrape_5etools_books.py                  # all books
    python3 scrape_5etools_books.py --books ERLW,VGM  # just these book IDs
    python3 scrape_5etools_books.py --list            # list available book IDs and exit
    python3 scrape_5etools_books.py --out-dir sourcebooks

Notes:
    - This is intended for personal/offline use. The content pulled here is
      the full copyrighted text of each book (not just SRD content), mirrored
      via a third-party GitHub repo. Treat the output accordingly (keep it
      local/private; don't redistribute it).
    - Network access is required. If a particular book or reference file
      fails to download, that book is skipped with a warning rather than
      aborting the whole run.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

BASE_RAW = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data"
REQUEST_DELAY_SECONDS = 0.25
REQUEST_TIMEOUT_SECONDS = 30
MAX_RETRIES = 3

SCRIPT_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# HTTP + caching
# ---------------------------------------------------------------------------

_json_cache: dict[str, Any] = {}
_failed_paths: set[str] = set()


def _http_get(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "homebrew-sourcebook-fetcher/1.0"})
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(0.5 * attempt)
    print(f"  ! Failed to fetch {url}: {last_error}", file=sys.stderr)
    return None


def fetch_json(relative_path: str) -> Any | None:
    """Fetch+parse a JSON file under BASE_RAW, cached for the life of the run."""
    if relative_path in _json_cache:
        return _json_cache[relative_path]
    if relative_path in _failed_paths:
        return None

    import json as _json

    url = f"{BASE_RAW}/{relative_path}"
    raw = _http_get(url)
    time.sleep(REQUEST_DELAY_SECONDS)
    if raw is None:
        _failed_paths.add(relative_path)
        return None
    try:
        data = _json.loads(raw)
    except _json.JSONDecodeError as exc:
        print(f"  ! Failed to parse JSON from {url}: {exc}", file=sys.stderr)
        _failed_paths.add(relative_path)
        return None
    _json_cache[relative_path] = data
    return data


# ---------------------------------------------------------------------------
# Inline tag stripping, e.g. "{@condition poisoned}" -> "poisoned"
# ---------------------------------------------------------------------------

_TAG_RE = re.compile(r"\{@(\w+)\s*([^{}]*)\}")

_WRAP_TAGS = {
    "b": "**{}**",
    "bold": "**{}**",
    "i": "*{}*",
    "italic": "*{}*",
    "u": "__{}__",
    "underline": "__{}__",
    "s": "~~{}~~",
    "strike": "~~{}~~",
    "code": "`{}`",
}

_SIMPLE_PREFIX_TAGS = {
    "dc": "DC {}",
    "hit": "+{}",
    "h": "",  # "{@h}" is a hit/damage divider in attack blocks; no useful text
}


def _tag_replacer(match: re.Match[str]) -> str:
    tag = match.group(1).lower()
    content = match.group(2).strip()
    parts = [p.strip() for p in content.split("|")] if content else [""]

    if tag in _WRAP_TAGS:
        return _WRAP_TAGS[tag].format(parts[0])
    if tag in _SIMPLE_PREFIX_TAGS:
        template = _SIMPLE_PREFIX_TAGS[tag]
        return template.format(parts[0]) if template else ""
    if tag == "note":
        return f"({parts[0]})" if parts[0] else ""

    # Generic reference tags, e.g. {@creature goblin|mm|goblins},
    # {@spell fireball}, {@item longsword|phb}, {@skill Perception}.
    # Convention: if there's explicit display text (3+ pipe segments), it's
    # last; with exactly 2 segments it's "name|source" so display is first;
    # with 1 segment it's just the name.
    if len(parts) >= 3 and parts[-1]:
        return parts[-1]
    return parts[0]


def strip_tags(text: str) -> str:
    if not isinstance(text, str):
        return str(text)
    prev = None
    current = text
    # Run a few passes in case of (rare) tag content that itself looks tag-ish.
    for _ in range(3):
        if current == prev:
            break
        prev = current
        current = _TAG_RE.sub(_tag_replacer, current)
    return current


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return normalized or "untitled"


# ---------------------------------------------------------------------------
# Reference resolvers: statblock {tag, name, source} -> rendered Markdown
# ---------------------------------------------------------------------------

def _find_by_name_source(items: list[dict], name: str, source: str | None) -> dict | None:
    name_l = name.lower()
    candidates = [i for i in items if i.get("name", "").lower() == name_l]
    if not candidates:
        return None
    if source:
        for c in candidates:
            if c.get("source", "").lower() == source.lower():
                return c
    return candidates[0]


_SIZE_NAMES = {
    "T": "Tiny", "S": "Small", "M": "Medium", "L": "Large",
    "H": "Huge", "G": "Gargantuan", "V": "Varies",
}

_ABILITY_NAMES = {
    "str": "Strength", "dex": "Dexterity", "con": "Constitution",
    "int": "Intelligence", "wis": "Wisdom", "cha": "Charisma",
}


def _format_size(size_value: Any) -> str:
    codes = size_value if isinstance(size_value, list) else [size_value]
    return " or ".join(_SIZE_NAMES.get(c, str(c)) for c in codes)


def _format_speed(speed_value: Any) -> str:
    if isinstance(speed_value, (int, float)):
        return f"{speed_value} ft."
    if isinstance(speed_value, dict):
        return ", ".join(f"{k} {v} ft." for k, v in speed_value.items())
    return str(speed_value)


def _format_ability_entry(ability_entry: dict) -> str:
    parts = []
    for key, value in ability_entry.items():
        if key == "choose":
            choose = value
            from_list = choose.get("from", [])
            count = choose.get("count", 1)
            names = ", ".join(_ABILITY_NAMES.get(a, a.upper()) for a in from_list)
            parts.append(f"+1 to {count} of your choice from: {names}")
        elif key in _ABILITY_NAMES:
            parts.append(f"{_ABILITY_NAMES[key]} +{value}")
    return "; ".join(parts)


def _format_ability(ability_value: Any) -> str:
    if not isinstance(ability_value, list):
        return strip_tags(str(ability_value))
    return " / ".join(_format_ability_entry(a) for a in ability_value if isinstance(a, dict))


def render_generic_statblock(entry_obj: dict, heading_level: int) -> list[str]:
    """Render a simple 'name + entries (+ a few known scalar fields)' object."""
    lines: list[str] = []
    name = entry_obj.get("name")
    if name:
        lines.append(f"{'#' * heading_level} {strip_tags(name)}\n")

    if entry_obj.get("size"):
        lines.append(f"*Size:* {_format_size(entry_obj['size'])}\n")
    if entry_obj.get("speed"):
        lines.append(f"*Speed:* {_format_speed(entry_obj['speed'])}\n")
    if entry_obj.get("ability"):
        lines.append(f"*Ability Score Increase:* {_format_ability(entry_obj['ability'])}\n")

    scalar_fields = [
        ("type", "Type"),
        ("rarity", "Rarity"),
        ("level", "Level"),
        ("school", "School"),
    ]
    for key, label in scalar_fields:
        if key in entry_obj and entry_obj[key] not in (None, "", []):
            lines.append(f"*{label}:* {strip_tags(str(entry_obj[key]))}\n")

    prereq = entry_obj.get("prerequisite")
    if prereq:
        if isinstance(prereq, list):
            rendered_prereqs = []
            for p in prereq:
                if isinstance(p, dict):
                    rendered_prereqs.append(
                        p.get("other")
                        or _format_ability({k: v for k, v in p.items() if k in _ABILITY_NAMES}) if any(k in _ABILITY_NAMES for k in p) else str(p)
                    )
                else:
                    rendered_prereqs.append(str(p))
            lines.append(f"*Prerequisite:* {'; '.join(strip_tags(str(r)) for r in rendered_prereqs)}\n")
        else:
            lines.append(f"*Prerequisite:* {strip_tags(str(prereq))}\n")

    if entry_obj.get("entries"):
        lines.extend(render_entries(entry_obj["entries"], heading_level + 1))
    return lines


def resolve_class_or_subclass(name: str, source: str | None, is_subclass: bool, heading_level: int) -> list[str]:
    class_index = fetch_json("class/index.json")
    if not class_index:
        return [f"*[Unable to resolve {'subclass' if is_subclass else 'class'} '{name}': class index unavailable]*\n"]

    for class_slug, filename in class_index.items():
        class_data = fetch_json(f"class/{filename}")
        if not class_data:
            continue

        if not is_subclass:
            match = _find_by_name_source(class_data.get("class", []), name, source)
            if match:
                return render_class(match, class_data.get("classFeature", []), heading_level)
        else:
            match = _find_by_name_source(class_data.get("subclass", []), name, source)
            if match:
                return render_subclass(match, class_data.get("subclassFeature", []), heading_level)

    return [f"*[Could not find {'subclass' if is_subclass else 'class'} '{name}' ({source}) in any class file]*\n"]


def _lookup_feature_ref(ref: str, feature_list: list[dict], is_subclass_feature: bool) -> dict | None:
    """Resolve a classFeatures/subclassFeatures reference string into its full entry.

    Format: "Name|ClassName|ClassSource|Level[|FeatureSource]" for class features,
    or "Name|ClassName|ClassSource|SubclassShortName|SubclassSource|Level[|FeatureSource]"
    for subclass features.
    """
    parts = ref.split("|")
    name = parts[0]
    level = None
    for p in reversed(parts):
        if p.isdigit():
            level = int(p)
            break
    name_l = name.lower()
    for feat in feature_list:
        if feat.get("name", "").lower() == name_l and (level is None or feat.get("level") == level):
            return feat
    return None


def render_feature_list(feature_refs: list, feature_defs: list[dict], is_subclass_feature: bool, heading_level: int) -> list[str]:
    lines: list[str] = []
    current_level = None
    for ref in feature_refs:
        if isinstance(ref, dict):
            ref_str = ref.get("classFeature") or ref.get("subclassFeature")
            if not ref_str:
                continue
        else:
            ref_str = ref

        feature = _lookup_feature_ref(ref_str, feature_defs, is_subclass_feature)
        if feature is None:
            lines.append(f"*[Unresolved feature reference: {ref_str}]*\n")
            continue

        level = feature.get("level")
        if level is not None and level != current_level:
            current_level = level
            lines.append(f"{'#' * heading_level} Level {level}\n")

        lines.append(f"{'#' * (heading_level + 1)} {strip_tags(feature.get('name', 'Feature'))}\n")
        if feature.get("entries"):
            lines.extend(render_entries(feature["entries"], heading_level + 2))
    return lines


def render_class(class_obj: dict, feature_defs: list[dict], heading_level: int) -> list[str]:
    lines = [f"{'#' * heading_level} {strip_tags(class_obj.get('name', 'Class'))}\n"]
    if class_obj.get("hd"):
        hd = class_obj["hd"]
        lines.append(f"*Hit Die:* d{hd.get('faces', '?')}\n")
    if class_obj.get("proficiency"):
        lines.append(f"*Saving Throw Proficiencies:* {', '.join(p.upper() for p in class_obj['proficiency'])}\n")
    if class_obj.get("classFeatures"):
        lines.extend(render_feature_list(class_obj["classFeatures"], feature_defs, False, heading_level + 1))
    return lines


def render_subclass(subclass_obj: dict, feature_defs: list[dict], heading_level: int) -> list[str]:
    lines = [f"{'#' * heading_level} {strip_tags(subclass_obj.get('name', 'Subclass'))}\n"]
    if subclass_obj.get("subclassFeatures"):
        lines.extend(render_feature_list(subclass_obj["subclassFeatures"], feature_defs, True, heading_level + 1))
    return lines


def resolve_statblock(entry_obj: dict, heading_level: int) -> list[str]:
    tag = entry_obj.get("tag")
    name = entry_obj.get("name", "")
    source = entry_obj.get("source")

    if not tag or not name:
        return []

    if tag == "class":
        return resolve_class_or_subclass(name, source, is_subclass=False, heading_level=heading_level)
    if tag == "subclass":
        return resolve_class_or_subclass(name, source, is_subclass=True, heading_level=heading_level)

    # Simple "flat file with a single relevant array" lookups.
    flat_lookup: dict[str, tuple[str, list[str]]] = {
        "race": ("races.json", ["race"]),
        "feat": ("feats.json", ["feat"]),
        "background": ("backgrounds.json", ["background"]),
        "item": ("items.json", ["item"]),
        "object": ("objects.json", ["object"]),
        "optfeature": ("optionalfeatures.json", ["optionalfeature"]),
        "condition": ("conditionsdiseases.json", ["condition", "disease", "status"]),
        "disease": ("conditionsdiseases.json", ["disease", "condition", "status"]),
        "trap": ("trapshazards.json", ["trap", "hazard"]),
        "hazard": ("trapshazards.json", ["hazard", "trap"]),
        "deity": ("deities.json", ["deity"]),
        "reward": ("rewards.json", ["reward"]),
        "variantrule": ("variantrules.json", ["variantrule"]),
        "action": ("actions.json", ["action"]),
    }

    if tag in flat_lookup:
        path, keys = flat_lookup[tag]
        data = fetch_json(path)
        if data:
            for key in keys:
                match = _find_by_name_source(data.get(key, []), name, source)
                if match:
                    return render_generic_statblock(match, heading_level)
        # Fall back to the base-items file for simple items.
        if tag == "item":
            base_data = fetch_json("items-base.json")
            if base_data:
                match = _find_by_name_source(base_data.get("baseitem", []), name, source)
                if match:
                    return render_generic_statblock(match, heading_level)
        # Races are frequently referenced by a composite display name like
        # "Human (Mark of Making)" or "Shifter (Beasthide)", where the part in
        # parentheses is the actual entry name, stored as a "subrace" rather
        # than a top-level "race". Try that before giving up.
        if tag == "race":
            paren_match = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", name)
            race_data = fetch_json("races.json")
            if race_data:
                subraces = race_data.get("subrace", [])
                if paren_match:
                    parent_name, variant_name = paren_match.group(1).strip(), paren_match.group(2).strip()
                    variant_name = re.sub(r"^Variant;\s*", "", variant_name)
                    candidates = [
                        s for s in subraces
                        if s.get("name", "").lower() == variant_name.lower()
                        and s.get("raceName", "").lower() == parent_name.lower()
                    ] or [s for s in subraces if s.get("name", "").lower() == variant_name.lower()]
                else:
                    candidates = [s for s in subraces if s.get("name", "").lower() == name.lower()]
                match = None
                if source:
                    match = next((s for s in candidates if s.get("source", "").lower() == source.lower()), None)
                match = match or (candidates[0] if candidates else None)
                if match:
                    rendered = render_generic_statblock(match, heading_level)
                    race_name = match.get("raceName")
                    if race_name and rendered:
                        rendered[0] = f"{'#' * heading_level} {strip_tags(match.get('name', name))} ({race_name})\n"
                    return rendered
        return [f"*[Could not resolve {tag} '{name}' ({source})]*\n"]

    if tag == "spell":
        if source:
            index = fetch_json("spells/index.json") or {}
            filename = index.get(source) or index.get(source.upper())
            if filename:
                data = fetch_json(f"spells/{filename}")
                if data:
                    match = _find_by_name_source(data.get("spell", []), name, source)
                    if match:
                        return render_generic_statblock(match, heading_level)
        return [f"*[Could not resolve spell '{name}' ({source})]*\n"]

    if tag == "creature":
        if source:
            index = fetch_json("bestiary/index.json") or {}
            filename = index.get(source) or index.get(source.upper())
            if filename:
                data = fetch_json(f"bestiary/{filename}")
                if data:
                    match = _find_by_name_source(data.get("monster", []), name, source)
                    if match:
                        return render_generic_statblock(match, heading_level)
        return [f"*[Could not resolve creature '{name}' ({source})]*\n"]

    return [f"*[Unsupported statblock reference type '{tag}': {name}]*\n"]


# ---------------------------------------------------------------------------
# Generic entry-tree renderer
# ---------------------------------------------------------------------------

def render_table(entry_obj: dict) -> list[str]:
    lines: list[str] = []
    caption = entry_obj.get("caption")
    if caption:
        lines.append(f"**{strip_tags(caption)}**\n")

    col_labels = entry_obj.get("colLabels") or []
    rows = entry_obj.get("rows") or []
    if col_labels:
        lines.append("| " + " | ".join(strip_tags(str(c)) for c in col_labels) + " |")
        lines.append("| " + " | ".join("---" for _ in col_labels) + " |")
    for row in rows:
        cells = row if isinstance(row, list) else [row]
        rendered_cells = []
        for cell in cells:
            if isinstance(cell, dict):
                rendered_cells.append(strip_tags(str(cell.get("entries", cell.get("name", "")))))
            else:
                rendered_cells.append(strip_tags(str(cell)))
        lines.append("| " + " | ".join(rendered_cells) + " |")
    lines.append("")
    return lines


def render_entries(entries: Any, heading_level: int = 2) -> list[str]:
    """Render a 5etools 'entries' value (string, dict, or list of either) to Markdown lines."""
    lines: list[str] = []

    if entries is None:
        return lines

    if isinstance(entries, str):
        text = strip_tags(entries)
        if text:
            lines.append(text + "\n")
        return lines

    if isinstance(entries, list):
        for item in entries:
            lines.extend(render_entries(item, heading_level))
        return lines

    if not isinstance(entries, dict):
        return lines

    entry_type = entries.get("type")

    if entry_type == "statblock":
        lines.extend(resolve_statblock(entries, heading_level))
        return lines

    if entry_type in ("section", "entries"):
        name = entries.get("name")
        if name:
            lines.append(f"{'#' * min(heading_level, 6)} {strip_tags(name)}\n")
        lines.extend(render_entries(entries.get("entries"), heading_level + 1))
        return lines

    if entry_type == "list":
        for item in entries.get("items", []):
            if isinstance(item, dict):
                item_name = item.get("name")
                prefix = f"**{strip_tags(item_name)}.** " if item_name else ""
                sub_lines = render_entries(item.get("entries", item), heading_level)
                if sub_lines:
                    first, *rest = sub_lines
                    lines.append(f"- {prefix}{first.rstrip()}")
                    lines.extend(f"  {line}" for line in rest)
                elif prefix:
                    lines.append(f"- {prefix}")
            else:
                lines.append(f"- {strip_tags(str(item))}")
        lines.append("")
        return lines

    if entry_type == "table":
        lines.extend(render_table(entries))
        return lines

    if entry_type in ("quote",):
        quote_lines = render_entries(entries.get("entries"), heading_level)
        for q in quote_lines:
            lines.append(f"> {q.rstrip()}")
        by = entries.get("by")
        if by:
            lines.append(f"> — {strip_tags(by)}")
        lines.append("")
        return lines

    if entry_type in ("inset", "insetReadaloud"):
        name = entries.get("name")
        if name:
            lines.append(f"> **{strip_tags(name)}**")
        for sub in render_entries(entries.get("entries"), heading_level + 1):
            lines.append(f"> {sub.rstrip()}")
        lines.append("")
        return lines

    if entry_type == "image":
        caption = entries.get("title") or entries.get("name") or "image"
        href = entries.get("href", {})
        path = href.get("path") if isinstance(href, dict) else href
        lines.append(f"*[Image: {strip_tags(str(caption))} ({path})]*\n")
        return lines

    if entry_type == "gallery":
        for img in entries.get("images", []):
            lines.extend(render_entries(img, heading_level))
        return lines

    # Fallback: if it has an 'entries' field, just recurse into it; otherwise
    # render whatever text fields are available so nothing silently vanishes.
    if "entries" in entries:
        name = entries.get("name")
        if name:
            lines.append(f"**{strip_tags(name)}**\n")
        lines.extend(render_entries(entries["entries"], heading_level))
        return lines

    if "name" in entries or "entry" in entries:
        name = entries.get("name", "")
        single_entry = entries.get("entry", "")
        text = " ".join(filter(None, [strip_tags(str(name)), strip_tags(str(single_entry))]))
        if text:
            lines.append(text + "\n")
        return lines

    return lines


# ---------------------------------------------------------------------------
# Book-level orchestration
# ---------------------------------------------------------------------------

def load_book_catalog() -> list[dict]:
    data = fetch_json("books.json")
    if not data:
        raise RuntimeError("Could not fetch books.json catalog")
    return data.get("book", [])


def render_book(book_meta: dict) -> str | None:
    book_id = book_meta["id"]
    filename = f"book-{book_id.lower()}.json"
    book_json = fetch_json(f"book/{filename}")
    if not book_json:
        return None

    book_data_list = book_json.get("bookData") or book_json.get("data") or []
    if book_data_list and isinstance(book_data_list, list) and "data" in book_data_list[0]:
        sections = book_data_list[0]["data"]
    else:
        sections = book_data_list

    out_lines: list[str] = [f"# {book_meta.get('name', book_id)}\n"]
    meta_bits = []
    if book_meta.get("author"):
        meta_bits.append(f"Author: {book_meta['author']}")
    if book_meta.get("published"):
        meta_bits.append(f"Published: {book_meta['published']}")
    meta_bits.append(f"Source ID: {book_id}")
    out_lines.append(f"*{' | '.join(meta_bits)}*\n")
    out_lines.append("---\n")

    for section in sections:
        out_lines.extend(render_entries(section, heading_level=2))

    return "\n".join(out_lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--books", help="Comma-separated list of book IDs to fetch (default: all)")
    parser.add_argument("--out-dir", default=str(SCRIPT_DIR), help="Output directory for Markdown files")
    parser.add_argument("--list", action="store_true", help="List available book IDs and exit")
    args = parser.parse_args()

    print("Fetching book catalog...")
    catalog = load_book_catalog()
    print(f"Found {len(catalog)} books in catalog.\n")

    if args.list:
        for b in sorted(catalog, key=lambda x: x["id"]):
            print(f"  {b['id']:10s} {b.get('name', '')}")
        return

    wanted_ids = None
    if args.books:
        wanted_ids = {b.strip().upper() for b in args.books.split(",")}

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for i, book_meta in enumerate(catalog, start=1):
        book_id = book_meta["id"]
        if wanted_ids and book_id.upper() not in wanted_ids:
            continue

        name = book_meta.get("name", book_id)
        print(f"[{i}/{len(catalog)}] {book_id}: {name}")

        try:
            markdown = render_book(book_meta)
        except Exception as exc:  # noqa: BLE001 - keep the batch going on any single-book failure
            print(f"  ! Error rendering {book_id}: {exc}", file=sys.stderr)
            continue

        if markdown is None:
            print(f"  ! Skipping {book_id}: could not fetch book data")
            continue

        out_path = out_dir / f"{slugify(name)}.md"
        out_path.write_text(markdown, encoding="utf-8")
        print(f"  -> wrote {out_path} ({len(markdown):,} chars)")

    print("\nDone.")


if __name__ == "__main__":
    main()
