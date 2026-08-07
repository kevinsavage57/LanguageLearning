"""
Apply the entry-by-entry review fixes to words_it.json.

Mirrors fix_review_es.py. Fixes live in review_fixes_it/*.json, one file per batch,
applied in filename order. Each row is {"it": ..., plus any of "en" / "pos" / "syn" /
"nc" / "override" / "plural" / "it_new"}.

"plural" is shorthand for the common case of a noun whose plural the engine cannot
derive: it sets noun_class to "irregular" and builds the override, deriving the
articles with the same rules lang_it.js uses so they cannot drift apart.

Note words_it.json is stored with a BOM, so it is read as utf-8-sig and written back
with one to keep the diff to the entries that actually changed.

Idempotent --- safe to re-run. Use --dry-run to preview.
"""
import json, io, sys, glob, os, re, shutil

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_it.json"
FIXDIR = os.path.join(BASE, "review_fixes_it")
DRY = "--dry-run" in sys.argv

DROP_IDS = []


def articles(gender, base):
    """Mirror of nounArticlesForClass() in lang_it.js."""
    w = (base or "").strip().lower()
    starts_vowel = bool(re.match(r"[aeiouàèìòùáéíóú]", w))
    needs_lo = bool(re.match(r"(z|gn|ps|x)", w)) or bool(re.match(r"s[^aeiou]", w))
    if gender == "f":
        return ("l'" if starts_vowel else "la"), "le"
    if starts_vowel:
        return "l'", "gli"
    if needs_lo:
        return "lo", "gli"
    return "il", "i"


def load_rows():
    rows, marks, drops = [], [], list(DROP_IDS)
    for path in sorted(glob.glob(os.path.join(FIXDIR, "*.json"))):
        blob = json.load(io.open(path, encoding="utf-8"))
        rows.extend(blob["rows"])
        drops.extend(blob.get("drop_ids", []))
        marks.append(blob.get("reviewed", os.path.basename(path)))
    return rows, marks, drops


def main():
    words = json.load(io.open(WORDS, encoding="utf-8-sig"))
    rows, marks, drop_ids = load_rows()
    dropped = [w for w in words if w.get("id") in drop_ids]
    words = [w for w in words if w.get("id") not in drop_ids]

    # Key each row by its old headword *and* its new one so a rename stays idempotent.
    # A headword touched by two batches has its rows *merged*, later file winning per
    # field. Replacing outright would silently drop the earlier batch's edits: pretendere
    # got its pastParticiple in 003 and its gloss in 009, and only the gloss survived.
    # A rename makes two spellings the same entry, so group them before merging:
    # 007 renames droghere -> droghiere and 011 then corrects droghiere's gloss. Keyed
    # naively, a rebuild from the pre-audit file would rename without re-glossing,
    # because the entry still reads "droghere" when the lookup happens.
    alias = {}
    for r in rows:
        if "it_new" in r:
            alias[r["it"]] = alias.get(r["it_new"], r["it_new"])
    canon = lambda k: alias.get(k, k)

    merged, spellings, multi = {}, {}, set()
    for r in rows:
        key = canon(r["it"])
        # Every spelling the group has ever had stays a valid lookup key, so the row
        # still matches whether the file holds the old headword or the renamed one.
        seen = spellings.setdefault(key, set())
        seen.update([r["it"], key])
        if "it_new" in r:
            seen.add(r["it_new"])
        if key in merged:
            multi.add(key)
            merged[key] = {**merged[key], **r}
        else:
            merged[key] = dict(r)

    fixes = {}
    for key, r in merged.items():
        for spelling in spellings[key]:
            fixes[spelling] = r
    if multi:
        print("note: headword fixed in more than one batch, rows merged: %s"
              % sorted(multi))

    changes = []
    for w in words:
        r = fixes.get((w.get("it") or "").strip())
        if not r:
            continue
        before = json.dumps(w, ensure_ascii=False, sort_keys=True)
        # The id is deliberately left alone on a rename so the learner's saved
        # progress for this word survives.
        if "it_new" in r:
            w["it"] = r["it_new"]
        if "en" in r:
            w["en"] = r["en"]
        if "pos" in r:
            w["pos"] = r["pos"]
            if w["pos"] != "noun":
                w.pop("noun_class", None)
                w.pop("noun_override", None)
        if "nc" in r:
            w["noun_class"] = r["nc"]
            if r["nc"] != "irregular":
                w.pop("noun_override", None)
        if "plural" in r:
            prev = w.get("noun_override") or {}
            base = r.get("base") or prev.get("base") or w["it"]
            # Only derive the articles when the entry has none; an entry that already
            # carries hand-set articles keeps them, so a plural repair cannot quietly
            # change the gender the app displays.
            sg, pl = articles(r.get("gender", "m"), base)
            w["noun_class"] = "irregular"
            w["noun_override"] = {"base": base, "plural": r["plural"],
                                  "article_sg": prev.get("article_sg") or sg,
                                  "article_pl": prev.get("article_pl") or pl}
        if "override" in r:
            w["noun_class"] = "irregular"
            w["noun_override"] = dict(r["override"])
        if "pp" in r:
            w["pastParticiple"] = r["pp"]
        if "aux" in r:
            w["aux"] = r["aux"]
        if "syn" in r:
            w["en_syn"] = list(r["syn"])
        after = json.dumps(w, ensure_ascii=False, sort_keys=True)
        if before != after:
            b, a = json.loads(before), json.loads(after)
            bits = []
            for k in ("it", "en", "pos", "en_syn", "noun_class", "pastParticiple", "aux"):
                if b.get(k) != a.get(k):
                    bits.append("%s: %r -> %r" % (k, b.get(k), a.get(k)))
            if b.get("noun_override") != a.get("noun_override"):
                bits.append("pl -> %r" % (a.get("noun_override") or {}).get("plural"))
            changes.append((r["it"], "; ".join(bits)))

    print("reviewed: " + " | ".join(marks))
    print("fix rows: %d | entries changed now: %d | dropped: %d"
          % (len(fixes), len(changes), len(dropped)))
    for it, what in changes:
        print("  %-22s %s" % (it[:22], what))
    for w in dropped:
        print("  DROPPED %r (%s = %s)" % (w.get("id"), w.get("it"), w.get("en")))

    present = {(w.get("it") or "").strip() for w in words}
    missing = {it for it in fixes if it not in present
               and fixes[it].get("it_new") not in present}
    if missing:
        print("\nWARNING: headwords not found: %s" % sorted(missing))

    if DRY:
        print("\n[dry run] nothing written")
        return
    shutil.copy2(WORDS, WORDS + ".bak")
    with io.open(WORDS, "w", encoding="utf-8-sig", newline="\n") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("\nWrote %s (%d entries)" % (WORDS, len(words)))


if __name__ == "__main__":
    main()
