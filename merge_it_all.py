"""
merge_it_all.py
===============
Merges all Italian addon files into their respective base files.

INPUT FILES (must be in same directory or provide full paths):
  words_it.json                    — base vocabulary
  verbs_it.json                    — base verb conjugation data
  verbs_it_addon.json              — verb conjugation entries
  verbs_it_irregulars.json         — irregular compound verb entries
  words_it_duo_addon.json          — Duo gap entries
  words_it_duo_verb_cards.json     — verb word-cards for Duo gap verbs
  verbs_it_duo_addon.json          — verb conjugation entries for Duo gap verbs
  words_it_duo_missing.json        — remaining Duo gap word-cards
  verbs_it_duo_missing.json        — verb conjugation entries from missing Duo words

  ES→IT gap fill addon batches:
  addon_it_nouns_batch1.json  … addon_it_nouns_batch25.json
  addon_it_verbs_batch1.json  … addon_it_verbs_batch6.json
  addon_it_adjs_batch1.json   … addon_it_adjs_batch5.json
  addon_it_advs_batch1.json   … addon_it_advs_batch2.json
  addon_it_phrases_batch1.json … addon_it_phrases_batch2.json

  IT→ES gap fill addon batches (once generated):
  addon_es_from_it_batch*.json

OUTPUT FILES:
  words_it_merged.json        — merged vocabulary
  verbs_it_merged.json        — merged verb conjugation data

MERGE RULES:
  - Deduplicate by 'id' field (first occurrence wins)
  - Deduplicate by 'it' field for words (case-insensitive, first occurrence wins)
  - Deduplicate by 'infinitive' field for verbs (first occurrence wins)
"""

import json
import os
import glob

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def path(filename):
    return os.path.join(BASE_DIR, filename)

def load(filename):
    fp = path(filename)
    if not os.path.exists(fp):
        print(f"  WARNING: {filename} not found, skipping")
        return []
    with open(fp, encoding='utf-8') as f:
        data = json.load(f)
    print(f"  Loaded {len(data):>5} entries from {filename}")
    return data

def save(data, filename):
    fp = path(filename)
    with open(fp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved  {len(data):>5} entries -> {filename}")

# ── merge words ─────────────────────────────────────────────────────────────
print("\n=== MERGING WORDS ===")

seen_ids = {}
seen_it  = {}
merged_words = []
dup_count = 0

def add_entries(entries, source):
    global dup_count
    added = 0
    for entry in entries:
        eid = entry.get('id', '')
        eit = entry.get('it', '').lower().strip()
        if eid in seen_ids:
            dup_count += 1
            continue
        if eit and eit in seen_it:
            dup_count += 1
            continue
        seen_ids[eid] = source
        if eit:
            seen_it[eit] = source
        merged_words.append(entry)
        added += 1
    return added

# Base word sources
for source in [
    'words_it.json',
    'words_it_duo_addon.json',
    'words_it_duo_verb_cards.json',
    'words_it_duo_missing.json',
]:
    entries = load(source)
    add_entries(entries, source)

# ES->IT gap fill addon batches
print("\n  --- ES->IT gap fill addon batches ---")
for pattern in [
    'addon_it_nouns_batch*.json',
    'addon_it_verbs_batch*.json',
    'addon_it_adjs_batch*.json',
    'addon_it_advs_batch*.json',
    'addon_it_phrases_batch*.json',
]:
    for fp in sorted(glob.glob(os.path.join(BASE_DIR, pattern))):
        source = os.path.basename(fp)
        with open(fp, encoding='utf-8') as f:
            entries = json.load(f)
        n = add_entries(entries, source)
        print(f"  Loaded {len(entries):>5} from {source}  (+{n} new)")

# IT->ES gap fill addon batches
print("\n  --- IT->ES gap fill addon batches ---")
it_es = sorted(glob.glob(os.path.join(BASE_DIR, 'addon_es_from_it_batch*.json')))
if not it_es:
    print("  (none found yet)")
for fp in it_es:
    source = os.path.basename(fp)
    with open(fp, encoding='utf-8') as f:
        entries = json.load(f)
    n = add_entries(entries, source)
    print(f"  Loaded {len(entries):>5} from {source}  (+{n} new)")

print(f"\n  Total words: {len(merged_words)}  (skipped {dup_count} duplicates)")
save(merged_words, 'words_it_merged.json')

# ── merge verbs ─────────────────────────────────────────────────────────────
print("\n=== MERGING VERBS ===")

seen_verb_ids = {}
seen_inf      = {}
merged_verbs  = []
vdup_count    = 0

for source in [
    'verbs_it.json',
    'verbs_it_addon.json',
    'verbs_it_irregulars.json',
    'verbs_it_duo_addon.json',
    'verbs_it_duo_missing.json',
]:
    entries = load(source)
    for entry in entries:
        eid = entry.get('id', '')
        inf = entry.get('infinitive', '').lower().strip()
        if eid and eid in seen_verb_ids:
            vdup_count += 1
            continue
        if inf and inf in seen_inf:
            vdup_count += 1
            continue
        if eid:
            seen_verb_ids[eid] = source
        if inf:
            seen_inf[inf] = source
        merged_verbs.append(entry)

print(f"\n  Total verbs: {len(merged_verbs)}  (skipped {vdup_count} duplicates)")
save(merged_verbs, 'verbs_it_merged.json')

print("\n=== DONE ===")
print(f"  words_it_merged.json : {len(merged_words)} entries")
print(f"  verbs_it_merged.json : {len(merged_verbs)} entries")
