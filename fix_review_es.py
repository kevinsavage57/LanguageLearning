"""
Apply the entry-by-entry review fixes to words_es.json.

This is the pass heuristics could not do. Detectors only find defects that are
structurally odd; the errors that actually reach learners --- gota "squeeze", jugoso
"fat", manera "so that", red "internet" --- are well-formed English of the right part of
speech, and the only way to find them is to read the entries and know the Spanish.

Fixes live in review_fixes/*.json, one file per batch of reviewed entries, applied in
filename order. Each row is {"es": ..., plus any of "en" / "pos" / "syn" / "nc"}.
Splitting them per batch keeps any single file small.

Entries are reviewed in rating order (most-shown first) via dump_chunk.py, so the
highest-traffic vocabulary is corrected first.

Idempotent --- safe to re-run. Use --dry-run to preview.
"""
import json, io, sys, glob, os, shutil

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_es.json"
FIXDIR = os.path.join(BASE, "review_fixes")
DRY = "--dry-run" in sys.argv

# Duplicate entries to drop, by id. "retroce verb" was a malformed-id duplicate of
# retroceder_verb, which carries the conjugation group and overrides; keeping both put
# the same word in the practice pool twice.
DROP_IDS = ["retroce verb"]


def load_rows():
    """Collect fix rows and drop-ids from every review_fixes/*.json, in filename order."""
    rows, marks, drops = [], [], list(DROP_IDS)
    for path in sorted(glob.glob(os.path.join(FIXDIR, "*.json"))):
        blob = json.load(io.open(path, encoding="utf-8"))
        rows.extend(blob["rows"])
        drops.extend(blob.get("drop_ids", []))
        marks.append(blob.get("reviewed", os.path.basename(path)))
    return rows, marks, drops


def main():
    words = json.load(io.open(WORDS, encoding="utf-8"))
    rows, marks, drop_ids = load_rows()
    dropped = [w for w in words if w.get("id") in drop_ids]
    words = [w for w in words if w.get("id") not in drop_ids]

    seen, dupes = set(), set()
    for r in rows:
        (dupes if r["es"] in seen else seen).add(r["es"])
    if dupes:
        print(f"WARNING: same headword fixed in two batches: {sorted(dupes)}")
    # Key each row by its old headword *and* its new one, so a rename still matches
    # after it has been applied once. Without this a rename row silently stops firing
    # and any other field it sets (pos, syn, noun_class) never lands.
    fixes = {}
    for r in rows:
        fixes[r["es"]] = r
        if "es_new" in r:
            fixes[r["es_new"]] = r

    changes = []
    for w in words:
        r = fixes.get((w.get("es") or "").strip())
        if not r:
            continue
        before = json.dumps(w, ensure_ascii=False, sort_keys=True)
        # Repair a corrupted Spanish headword. The id is deliberately left alone so the
        # learner's localStorage progress for this word survives the rename.
        if "es_new" in r:
            w["es"] = r["es_new"]
        if "en" in r:
            w["en"] = r["en"]
        if "pos" in r:
            w["pos"] = r["pos"]
            if w["pos"] != "noun":
                w.pop("noun_class", None)
                w.pop("noun_override", None)
        # A word promoted *to* noun needs a gender, or getNounForms() returns null
        # and the entry silently loses its articles.
        if "nc" in r:
            w["noun_class"] = r["nc"]
            # noun_override only applies to the "irregular" class; leaving one behind on
            # a regular noun means getNounForms() keeps using the stale override base.
            if r["nc"] != "irregular":
                w.pop("noun_override", None)
        if "override" in r:
            w["noun_override"] = dict(r["override"])
        if "syn" in r:
            w["en_syn"] = list(r["syn"])
        after = json.dumps(w, ensure_ascii=False, sort_keys=True)
        if before != after:
            b, a = json.loads(before), json.loads(after)
            bits = [f"{k}: {b.get(k)!r} -> {a.get(k)!r}"
                    for k in ("en", "pos", "en_syn", "noun_class") if b.get(k) != a.get(k)]
            changes.append((r["es"], "; ".join(bits)))

    print("reviewed: " + " | ".join(marks))
    print(f"fix rows: {len(fixes)} | entries changed now: {len(changes)} | dropped: {len(dropped)}")
    for es, what in changes:
        print(f"  {es[:22]:24s} {what}")
    for w in dropped:
        print(f"  DROPPED {w.get('id')!r} ({w.get('es')} = {w.get('en')})")

    # A rename that has already been applied no longer matches its old headword. That is
    # the expected idempotent state, not a missing entry, so don't warn about it.
    present = {(w.get("es") or "").strip() for w in words}
    missing = {es for es in fixes if es not in present
               and fixes[es].get("es_new") not in present}
    if missing:
        print(f"\nWARNING: headwords not found: {sorted(missing)}")

    if DRY:
        print("\n[dry run] nothing written")
        return
    shutil.copy2(WORDS, WORDS + ".bak")
    with io.open(WORDS, "w", encoding="utf-8", newline="\n") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nWrote {WORDS} ({len(words)} entries)")


if __name__ == "__main__":
    main()
