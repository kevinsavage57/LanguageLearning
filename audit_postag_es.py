"""
Find entries in words_es.json whose `pos` tag is wrong.

Motivating cases (found by reading a random sample, not by any detector):
  mí          pronoun  tagged noun + noun_class m_std -> app renders "el mí" / "los mís"
  repitiendo  gerund   tagged noun + noun_class m_std -> "el repitiendo"
  hinchado    adj      tagged noun
  encantador  adj      tagged noun

This matters at runtime: lang_es.js getNounForms() gates on pos === "noun" and builds
articles from noun_class, so a mis-tagged entry teaches invented Spanish.

Unlike a gloss error, this IS mechanically detectable, because the English gloss carries
the part of speech. Three signals, each reported separately so they can be judged on
their own rather than lumped into one number:

  GERUND   es ends -ando/-iendo and the gloss ends in -ing
  ADJ_ONLY the English gloss has adjective senses in WordNet but no noun senses
  CLOSED   the headword is a closed-class function word

Read-only. Prints every hit -- reviewing only the head of the list is what let the
earlier defects survive.
"""
import json, io, re, sys
from nltk.corpus import wordnet as wn

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_es.json"

GERUND_ES = re.compile(r"(ando|[ií]endo)$", re.I)

# Spanish closed-class words that are never common nouns.
CLOSED = {
    "mí", "ti", "sí", "yo", "tú", "él", "ella", "usted", "ustedes", "nosotros",
    "nosotras", "vosotros", "vosotras", "ellos", "ellas", "conmigo", "contigo",
    "consigo", "me", "te", "se", "nos", "os", "lo", "la", "le", "les", "los", "las",
    "quien", "quienes", "cual", "cuales", "cuyo", "cuya", "esto", "eso", "aquello",
}


def norm_gloss(en):
    """First slash-variant of the gloss, stripped of articles and parentheticals."""
    head = re.split(r"[/;,]", en or "")[0]
    head = re.sub(r"\s*\([^)]*\)", "", head).strip().lower()
    head = re.sub(r"^(a|an|the|to)\s+", "", head)
    return re.sub(r"[^a-z' -]", "", head).strip()


def adj_only(gloss):
    """True when the gloss is an adjective in English and not a noun."""
    g = norm_gloss(gloss)
    if not g or " " in g:
        return False
    key = g.replace(" ", "_")
    nouns = wn.synsets(key, pos=wn.NOUN)
    adjs = wn.synsets(key, pos=wn.ADJ) + wn.synsets(key, pos=wn.ADJ_SAT)
    return bool(adjs) and not nouns


def classify(w):
    es = (w.get("es") or "").strip()
    en = w.get("en") or ""
    pos = w.get("pos")

    if not isinstance(pos, str) or not pos:
        return "BAD_POS", f"pos is {pos!r}"
    if pos != "noun":
        return None, None
    if " " in es:
        return None, None

    if es.lower() in CLOSED:
        return "CLOSED", "closed-class word tagged noun"
    if GERUND_ES.search(es) and norm_gloss(en).endswith("ing"):
        return "GERUND", f"gerund {es!r} with -ing gloss {en!r}"
    if adj_only(en):
        return "ADJ_ONLY", f"gloss {norm_gloss(en)!r} is adjective-only in WordNet"
    return None, None


def main():
    words = json.load(io.open(WORDS, encoding="utf-8"))
    buckets = {}
    for w in words:
        kind, why = classify(w)
        if kind:
            buckets.setdefault(kind, []).append((w.get("es"), w.get("en"), w.get("noun_class"), why))

    for kind in ("BAD_POS", "CLOSED", "GERUND", "ADJ_ONLY"):
        rows = buckets.get(kind, [])
        print(f"\n{'='*92}\n{kind}: {len(rows)}\n{'='*92}")
        for es, en, nc, why in rows:
            print(f"  {str(es)[:22]:24s} en={str(en)[:26]:28s} noun_class={str(nc):10s} {why}")
    print(f"\nTotal: {sum(len(v) for v in buckets.values())}")


if __name__ == "__main__":
    main()
