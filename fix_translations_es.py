"""
Apply the confirmed translation fixes found by the audit scripts to words_es.json.

Every change here was verified individually against Open Multilingual WordNet and the
entry's own data -- this is not a heuristic sweep. Run with --dry-run to preview.

  1. gota   -> primary was "squeeze"; correct answer "drop" was buried in a definitional
               en_syn, and French "goutte" had leaked in.
  2. habito -> primary was "to renounce one's vows", the idiom 'colgar los habitos';
               a noun glossed as a verb phrase, real answer "habit" demoted to last.
  3. Wiktionary editorial notes ("ellipsis of ...") left in as if they were translations.
  4. en_syn entries repeating the Spanish headword when it is NOT valid English. en_syn are
     accepted answers, so these let a Spanish response be graded correct. Cognates that are
     genuinely English (campus, doctor, error, ideal) are deliberately left alone.
  5. manzanilla -> "Andalucia", a place name, listed as an English translation.
"""
import json, io, sys, shutil, unicodedata

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_es.json"
DRY = "--dry-run" in sys.argv

# es headword -> replacement primary gloss and synonym list
REWRITE = {
    "gota":   {"en": "drop",  "en_syn": ["droplet", "gout", "eyedrops"]},
    "hábito": {"en": "habit", "en_syn": ["custom", "routine"]},
    # Found by reading a 120-entry random sample, not by any detector. Same shape as
    # gota: the right answer ("juicy") sat in en_syn while the primary was the oblique
    # figurative sense ("un contrato jugoso" -> a fat/lucrative contract).
    "jugoso": {"en": "juicy", "en_syn": ["succulent", "lucrative"]},
}

# es headword -> en_syn strings to delete
DROP_SYN = {
    "bachillerato": ["ellipsis of bachillerato universitario"],
    "cordillera":   ["ellipsis of cordillera de los Andes"],
    "manzanilla":   ["Andalucía"],
    # Also from the manual sample. "my ankle" is an example-sentence fragment;
    # "a resident or inhabitant of an area" is a dictionary definition, not a
    # translation; "freeman" is a wrong sense; "too big" is demasiado grande.
    "tobillo":      ["my ankle"],
    "vecino":       ["a resident or inhabitant of an area", "freeman"],
    "grandes":      ["too big"],
}

# Self-referential en_syn where the headword is not valid English (verified via
# WordNet + English word frequency); the primary gloss in each is already correct.
SELF_REF = ["armónico", "carnaval", "cordillera", "corrector", "costumbrismo", "cría",
            "cuartilla", "empanadilla", "escabeche", "fabada asturiana", "latifundio",
            "sobremesa", "subdirector", "sofrito"]


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def main():
    words = json.load(io.open(WORDS, encoding="utf-8"))
    selfref = {fold(x) for x in SELF_REF}
    changes = []

    for w in words:
        es = w.get("es", "")
        before = json.dumps(w, ensure_ascii=False, sort_keys=True)

        if es in REWRITE:
            w["en"] = REWRITE[es]["en"]
            w["en_syn"] = list(REWRITE[es]["en_syn"])

        if es in DROP_SYN and w.get("en_syn"):
            kill = {s.strip().lower() for s in DROP_SYN[es]}
            w["en_syn"] = [s for s in w["en_syn"] if s.strip().lower() not in kill]

        if fold(es) in selfref and w.get("en_syn"):
            w["en_syn"] = [s for s in w["en_syn"] if fold(s) != fold(es)]

        after = json.dumps(w, ensure_ascii=False, sort_keys=True)
        if before != after:
            changes.append((es, before, after))

    print(f"{len(changes)} entries changed\n" + "=" * 78)
    for es, b, a in changes:
        bj, aj = json.loads(b), json.loads(a)
        print(f"\n  {es}")
        for k in ("en", "en_syn"):
            if bj.get(k) != aj.get(k):
                print(f"     {k}: {bj.get(k)!r}\n       -> {aj.get(k)!r}")

    if DRY:
        print("\n[dry run] nothing written")
        return

    shutil.copy2(WORDS, WORDS + ".bak")
    with io.open(WORDS, "w", encoding="utf-8", newline="\n") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nWrote {WORDS} (backup at words_es.json.bak)")


if __name__ == "__main__":
    main()
