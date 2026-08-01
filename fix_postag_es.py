"""
Correct wrong `pos` tags (and the glosses found alongside them) in words_es.json.

Why this matters at runtime: lang_es.js getNounForms() gates on pos === "noun" and builds
articles from noun_class, so a pronoun tagged noun renders as "el mí" / "los mís" and a
gerund as "el repitiendo". Correcting pos disables that path; noun_class is then dead
weight and is dropped.

`id` is deliberately left unchanged (e.g. mí_noun stays mí_noun) --- ids key the learner's
localStorage progress, so renaming them would orphan saved data.

Every entry below was reviewed individually against the full output of
audit_postag_es.py (115 hits), not sampled. Run with --dry-run to preview.
"""
import json, io, sys, shutil

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_es.json"
DRY = "--dry-run" in sys.argv

# --- pos corrections ---------------------------------------------------------------
# es -> correct pos. noun_class is dropped wherever pos stops being "noun".

CONJUNCTIONS = ["con tal de que", "en caso de que", "salvo que"]   # had pos == 2
VERBS_MISSING_POS = ["repatriar", "retroceder"]                     # had pos == None
PRONOUNS = ["conmigo", "contigo", "cuyo", "le", "lo", "me", "mí",
            "nos", "nosotras", "quien"]
GERUNDS = ["diciendo", "eligiendo", "hirviendo", "muriendo", "pidiendo", "repitiendo"]
# Preterite 1sg forms tagged as nouns.
CONJUGATED = ["crucé", "empaqué", "freí", "organicé"]
ADVERBS = ["recién"]

ADJECTIVES = [
    "acogedor", "afortunado", "agotador", "anónimo", "arrogante", "aventurero",
    "caído", "calvo", "cansador", "conversador", "cualquiera", "desanimado",
    "descalzo", "destrozado", "destruidos", "digital", "discreto", "distraído",
    "diverso", "elegante", "elíptica", "emocionados", "enamoradizo", "encantador",
    "entretenido", "escondidas", "estresante", "estupendo", "excelente", "exigente",
    "fascinante", "fatal", "fenomenal", "financiero", "frustrante", "gratificante",
    "guapo", "hinchado", "hispanohablante", "hábil", "impactante", "impresionante",
    "incapaz", "increíble", "indeciso", "indiferente", "indignante", "indígena",
    "ingenuo", "injusto", "innovador", "interesantes", "intimidante", "intrascendente",
    "inundado", "juguetón", "justo", "mandón", "mareado", "medieval", "moreno",
    "muchas", "muscular", "neoclásico", "ningún", "nublado", "organizada",
    "perseverante", "placentero", "preguntón", "preocupante", "propio", "puntual",
    "radiante", "realista", "rebozado", "relajante", "rizado", "templado",
]

POS_FIX = {}
for _es in CONJUNCTIONS:       POS_FIX[_es] = "conjunction"
for _es in VERBS_MISSING_POS:  POS_FIX[_es] = "verb"
for _es in PRONOUNS:           POS_FIX[_es] = "pronoun"
for _es in GERUNDS:            POS_FIX[_es] = "verb"
for _es in CONJUGATED:         POS_FIX[_es] = "verb"
for _es in ADVERBS:            POS_FIX[_es] = "adverb"
for _es in ADJECTIVES:         POS_FIX[_es] = "adjective"

# --- gloss corrections -------------------------------------------------------------
# Wrong primary glosses surfaced while reviewing the pos hits. Two clusters:
#   * comparative/superlative scraped in place of the base adjective
#   * a real noun given an adjectival or unrelated gloss
GLOSS_FIX = {
    # comparative/superlative artifacts
    "calzoncillos": "underpants",   # was "shortest"
    "caído":        "fallen",       # was "heavier"
    "cómico":       "funny",        # was "richer" -- unrelated word
    "elegante":     "elegant",      # was "smarter" (BrE "smart" = elegant)
    "moreno":       "dark-haired",  # was "darker"
    "templado":     "warm",         # was "warmer"
    # nouns given an adjectival or wrong gloss (pos stays noun)
    "calor":        "heat",         # was "hot"
    "codo":         "elbow",        # was "tightfisted" (colloquial sense only)
    "error":        "mistake",      # was "mistaken"
    "gallo":        "rooster",      # was "stuck"
    "maravilla":    "wonder",       # was "wonderful"
    "plan":         "plan",         # was "planned"
    "prácticas":    "internships",  # was "experienced"
    # pronouns given the wrong person/number
    "lo":           "it/him",       # was "they"
    "nos":          "us",           # was "we"
    "quien":        "who",          # was "whoever"
    # gerunds glossed from the wrong verb
    "diciendo":     "saying",       # was "thinking" (that is pensando)
    "pidiendo":     "asking for",   # was "wanting"
}


def main():
    words = json.load(io.open(WORDS, encoding="utf-8"))
    changes = []

    for w in words:
        es = (w.get("es") or "").strip()
        before = json.dumps(w, ensure_ascii=False, sort_keys=True)

        if es in POS_FIX:
            w["pos"] = POS_FIX[es]
            if w["pos"] != "noun":
                w.pop("noun_class", None)
                w.pop("noun_override", None)

        if es in GLOSS_FIX:
            w["en"] = GLOSS_FIX[es]

        after = json.dumps(w, ensure_ascii=False, sort_keys=True)
        if before != after:
            b, a = json.loads(before), json.loads(after)
            bits = []
            for k in ("pos", "en", "noun_class"):
                if b.get(k) != a.get(k):
                    bits.append(f"{k}: {b.get(k)!r} -> {a.get(k)!r}")
            changes.append((es, "; ".join(bits)))

    print(f"{len(changes)} entries changed\n" + "=" * 88)
    for es, what in changes:
        print(f"  {es[:24]:26s} {what}")

    unmatched = (set(POS_FIX) | set(GLOSS_FIX)) - {(w.get('es') or '').strip() for w in words}
    if unmatched:
        print(f"\nWARNING: headwords not found in data: {sorted(unmatched)}")

    if DRY:
        print("\n[dry run] nothing written")
        return

    shutil.copy2(WORDS, WORDS + ".bak")
    with io.open(WORDS, "w", encoding="utf-8", newline="\n") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\nWrote {WORDS}")


if __name__ == "__main__":
    main()
