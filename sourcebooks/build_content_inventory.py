#!/usr/bin/env python3
"""
build_content_inventory.py

Builds a master inventory of every mechanically-relevant named entry
(species/races, feats, backgrounds, classes, subclasses, spells, magic
items, and monsters) sourced from the books in /content-sourcebooks.

Unlike grepping the rendered Markdown (which only sees whatever made it
into a "## "-level heading), this goes back to the same 5etools JSON data
the scraper used and filters each canonical reference file (races.json,
feats.json, backgrounds.json, items.json, class/*.json, spells/*.json,
bestiary/*.json) by the book's source ID. That's the authoritative list of
"everything this book added," independent of how the book's prose happened
to structure its headings.

Output: sourcebooks/content_inventory.md - one section per content type,
grouped by source book, name-sorted. Also writes
sourcebooks/content_inventory.json with the same data in structured form
for later programmatic use (e.g. diffing against the app's existing JSON).

This script only reads data and writes the two inventory files above. It
does not touch any book Markdown or any app source files.

Usage:
    python3 build_content_inventory.py
    python3 build_content_inventory.py --content-dir content-sourcebooks
"""

from __future__ import annotations

import argparse
import json as json_mod
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

BASE_RAW = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data"
REQUEST_DELAY_SECONDS = 0.2
REQUEST_TIMEOUT_SECONDS = 30
MAX_RETRIES = 3

SCRIPT_DIR = Path(__file__).resolve().parent

_json_cache: dict[str, Any] = {}
_failed_paths: set[str] = set()


def _http_get(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "homebrew-sourcebook-inventory/1.0"})
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
    if relative_path in _json_cache:
        return _json_cache[relative_path]
    if relative_path in _failed_paths:
        return None
    url = f"{BASE_RAW}/{relative_path}"
    raw = _http_get(url)
    time.sleep(REQUEST_DELAY_SECONDS)
    if raw is None:
        _failed_paths.add(relative_path)
        return None
    try:
        data = json_mod.loads(raw)
    except json_mod.JSONDecodeError as exc:
        print(f"  ! Failed to parse JSON from {url}: {exc}", file=sys.stderr)
        _failed_paths.add(relative_path)
        return None
    _json_cache[relative_path] = data
    return data


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return normalized or "untitled"


_TAG_RE = re.compile(r"\{@(\w+)\s*([^{}]*)\}")


def strip_tags(text: Any) -> str:
    if not isinstance(text, str):
        return str(text)

    def _repl(m: re.Match[str]) -> str:
        parts = [p.strip() for p in m.group(2).split("|")] if m.group(2) else [""]
        if len(parts) >= 3 and parts[-1]:
            return parts[-1]
        return parts[0]

    prev, current = None, text
    for _ in range(3):
        if current == prev:
            break
        prev = current
        current = _TAG_RE.sub(_repl, current)
    return current


# ---------------------------------------------------------------------------
# Map our content-sourcebooks/*.md filenames back to 5etools source IDs
# ---------------------------------------------------------------------------

def build_slug_to_source_map() -> dict[str, dict]:
    catalog = fetch_json("books.json")
    if not catalog:
        raise RuntimeError("Could not fetch books.json catalog")
    mapping: dict[str, dict] = {}
    for book in catalog.get("book", []):
        slug = slugify(book.get("name", book["id"]))
        mapping[slug] = book
    return mapping


# ---------------------------------------------------------------------------
# Per-content-type collectors
# ---------------------------------------------------------------------------

def collect_races(source_ids: set[str]) -> dict[str, list[dict]]:
    data = fetch_json("races.json") or {}
    by_source: dict[str, list[dict]] = {}
    for key in ("race", "subrace"):
        for entry in data.get(key, []):
            src = (entry.get("source") or "").upper()
            if src not in source_ids:
                continue
            name = entry.get("name", "?")
            if key == "subrace" and entry.get("raceName"):
                name = f"{entry['raceName']} ({name})"
            by_source.setdefault(src, []).append({"name": name, "kind": key})
    return by_source


def collect_simple(path: str, array_key: str, source_ids: set[str]) -> dict[str, list[dict]]:
    data = fetch_json(path) or {}
    by_source: dict[str, list[dict]] = {}
    for entry in data.get(array_key, []):
        src = (entry.get("source") or "").upper()
        if src not in source_ids:
            continue
        by_source.setdefault(src, []).append({"name": entry.get("name", "?")})
    return by_source


def collect_items(source_ids: set[str]) -> dict[str, list[dict]]:
    by_source: dict[str, list[dict]] = {}
    for path, key in (("items.json", "item"), ("items-base.json", "baseitem")):
        data = fetch_json(path) or {}
        for entry in data.get(key, []):
            src = (entry.get("source") or "").upper()
            if src not in source_ids:
                continue
            rarity = entry.get("rarity")
            label = entry.get("name", "?")
            by_source.setdefault(src, []).append({"name": label, "rarity": rarity})
    return by_source


def collect_classes_and_subclasses(source_ids: set[str]) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    class_index = fetch_json("class/index.json") or {}
    classes_by_source: dict[str, list[dict]] = {}
    subclasses_by_source: dict[str, list[dict]] = {}
    seen_files: set[str] = set()
    for filename in class_index.values():
        if filename in seen_files:
            continue
        seen_files.add(filename)
        class_data = fetch_json(f"class/{filename}")
        if not class_data:
            continue
        for cls in class_data.get("class", []):
            src = (cls.get("source") or "").upper()
            if src in source_ids:
                classes_by_source.setdefault(src, []).append({"name": cls.get("name", "?")})
        for sub in class_data.get("subclass", []):
            src = (sub.get("source") or "").upper()
            if src in source_ids:
                subclasses_by_source.setdefault(src, []).append(
                    {"name": sub.get("name", "?"), "class": sub.get("className", "?")}
                )
    return classes_by_source, subclasses_by_source


def collect_spells(source_ids: set[str]) -> dict[str, list[dict]]:
    index = fetch_json("spells/index.json") or {}
    by_source: dict[str, list[dict]] = {}
    seen_files: set[str] = set()
    for src_key, filename in index.items():
        if (src_key or "").upper() not in source_ids:
            continue
        if filename in seen_files:
            continue
        seen_files.add(filename)
        data = fetch_json(f"spells/{filename}")
        if not data:
            continue
        for spell in data.get("spell", []):
            src = (spell.get("source") or "").upper()
            if src in source_ids:
                by_source.setdefault(src, []).append(
                    {"name": spell.get("name", "?"), "level": spell.get("level")}
                )
    return by_source


def collect_monsters(source_ids: set[str]) -> dict[str, list[dict]]:
    index = fetch_json("bestiary/index.json") or {}
    by_source: dict[str, list[dict]] = {}
    seen_files: set[str] = set()
    for src_key, filename in index.items():
        if (src_key or "").upper() not in source_ids:
            continue
        if filename in seen_files:
            continue
        seen_files.add(filename)
        data = fetch_json(f"bestiary/{filename}")
        if not data:
            continue
        for mon in data.get("monster", []):
            src = (mon.get("source") or "").upper()
            if src in source_ids:
                by_source.setdefault(src, []).append(
                    {"name": mon.get("name", "?"), "cr": mon.get("cr")}
                )
    return by_source


def collect_optionalfeatures(source_ids: set[str]) -> dict[str, list[dict]]:
    data = fetch_json("optionalfeatures.json") or {}
    by_source: dict[str, list[dict]] = {}
    for entry in data.get("optionalfeature", []):
        src = (entry.get("source") or "").upper()
        if src not in source_ids:
            continue
        types = entry.get("featureType", [])
        by_source.setdefault(src, []).append({"name": entry.get("name", "?"), "type": ",".join(types)})
    return by_source


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--content-dir", default="content-sourcebooks")
    args = parser.parse_args()

    content_dir = (SCRIPT_DIR.parent / args.content_dir).resolve()
    md_files = sorted(content_dir.glob("*.md"))
    if not md_files:
        print(f"No .md files found in {content_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(md_files)} books in {content_dir}")
    print("Fetching books.json catalog to map filenames -> source IDs...")
    slug_to_book = build_slug_to_source_map()

    book_by_source: dict[str, dict] = {}
    unmatched: list[str] = []
    for md_path in md_files:
        slug = md_path.stem
        book = slug_to_book.get(slug)
        if not book:
            unmatched.append(md_path.name)
            continue
        book_by_source[book["id"].upper()] = book

    if unmatched:
        print("  ! Could not map these files to a catalog source ID (skipped):")
        for name in unmatched:
            print(f"      {name}")

    source_ids = set(book_by_source.keys())
    print(f"Resolved {len(source_ids)} source IDs. Fetching reference data...\n")

    print("  races/species...")
    races = collect_races(source_ids)
    print("  feats...")
    feats = collect_simple("feats.json", "feat", source_ids)
    print("  backgrounds...")
    backgrounds = collect_simple("backgrounds.json", "background", source_ids)
    print("  classes & subclasses...")
    classes, subclasses = collect_classes_and_subclasses(source_ids)
    print("  optional features (invocations/maneuvers/metamagic/etc.)...")
    optfeatures = collect_optionalfeatures(source_ids)
    print("  spells...")
    spells = collect_spells(source_ids)
    print("  magic items...")
    items = collect_items(source_ids)
    print("  monsters...")
    monsters = collect_monsters(source_ids)

    sections: list[tuple[str, dict[str, list[dict]]]] = [
        ("Species / Races", races),
        ("Backgrounds", backgrounds),
        ("Feats", feats),
        ("Classes", classes),
        ("Subclasses", subclasses),
        ("Optional Class Features (invocations, maneuvers, metamagic, etc.)", optfeatures),
        ("Spells", spells),
        ("Magic Items", items),
        ("Monsters", monsters),
    ]

    # Build Markdown report
    lines: list[str] = ["# Content Inventory\n"]
    lines.append(
        "Generated from the 5etools JSON data mirror, filtered to the "
        f"{len(source_ids)} source books currently in `/{args.content_dir}`. "
        "This lists every named entry each book contributes per content "
        "type, independent of the book's prose structure.\n"
    )

    totals: dict[str, int] = {}
    for section_name, by_source in sections:
        lines.append(f"## {section_name}\n")
        section_total = 0
        for source_id in sorted(by_source.keys(), key=lambda s: book_by_source[s].get("name", s)):
            entries = by_source[source_id]
            book_name = book_by_source[source_id].get("name", source_id)
            entries_sorted = sorted(entries, key=lambda e: e["name"])
            section_total += len(entries_sorted)
            lines.append(f"### {book_name} ({source_id}) — {len(entries_sorted)}\n")
            for e in entries_sorted:
                extra_bits = []
                if e.get("kind") == "subrace":
                    extra_bits.append("subrace")
                if e.get("class"):
                    extra_bits.append(f"class: {e['class']}")
                if e.get("rarity"):
                    extra_bits.append(str(e["rarity"]))
                if e.get("cr") is not None:
                    extra_bits.append(f"CR {e['cr']}")
                if e.get("level") is not None:
                    extra_bits.append(f"level {e['level']}")
                if e.get("type"):
                    extra_bits.append(e["type"])
                suffix = f" _({', '.join(str(b) for b in extra_bits)})_" if extra_bits else ""
                lines.append(f"- {strip_tags(e['name'])}{suffix}")
            lines.append("")
        totals[section_name] = section_total
        if not by_source:
            lines.append("_(none found)_\n")

    summary_lines = ["## Summary\n"]
    for section_name, _ in sections:
        summary_lines.append(f"- **{section_name}:** {totals[section_name]}")
    lines = lines[:2] + summary_lines + [""] + lines[2:]

    out_md = content_dir.parent / "sourcebooks" / "content_inventory.md"
    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {out_md}")

    out_json = content_dir.parent / "sourcebooks" / "content_inventory.json"
    json_payload = {
        "source_books": {sid: book_by_source[sid].get("name", sid) for sid in source_ids},
        "unmatched_files": unmatched,
        "data": {
            section_name: by_source for section_name, by_source in sections
        },
    }
    out_json.write_text(json_mod.dumps(json_payload, indent=2), encoding="utf-8")
    print(f"Wrote {out_json}")

    print("\nTotals:")
    for section_name, _ in sections:
        print(f"  {section_name}: {totals[section_name]}")


if __name__ == "__main__":
    main()
