"""
Merges verbs_it_addon.json and verbs_it_irregulars.json into verbs_it.json.
Run once from the same directory: python3 merge_verbs_it.py
"""
import json

with open('verbs_it.json') as f:        base     = json.load(f)
with open('verbs_it_addon.json') as f:  addon    = json.load(f)
with open('verbs_it_irregulars.json') as f: irr  = json.load(f)

existing_ids = {v["id"] for v in base}
new = [v for v in addon + irr if v["id"] not in existing_ids]
merged = base + new
merged.sort(key=lambda v: v["infinitive"])

with open('verbs_it.json', 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)

print(f"Merged: {len(base)} base + {len(new)} new = {len(merged)} total")
print(f"  Regular addon:   {len(addon)}")
print(f"  Irregulars:      {len(irr)}")
