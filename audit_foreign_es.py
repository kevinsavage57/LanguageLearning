"""
Detect non-English words leaking into the English glosses of words_es.json.

This is how gota's corruption was first spotted: its en_syn carried the French "goutte".
Signal is a token that is rare in English but common in a Romance language --- "goutte"
scores 1.2 in English against 4.0 in French.

Deliberately narrow. An earlier version of this file also checked "en equals es"
(513 hits, almost all real cognates: actor, animal, alcohol), "primary gloss rarer than a
synonym" (225 hits, nearly all fine: albanil -> bricklayer is correct even though "mason"
is commoner), and "definitional en_syn" (343 hits, mostly legitimate prepositional
phrases). Those three drowned the real defects, so they were removed --- the same failure
mode as find_bad_nouns.py, whose missing word boundaries make "open" match "opening".

Keep this file high-precision. Read-only.
"""
import json, io, re, sys
from wordfreq import zipf_frequency as zipf
from nltk.corpus import wordnet as wn

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_es.json"

TOKEN = re.compile(r"[A-Za-zÀ-ÿ]{3,}")
MAX_EN = 2.0    # above this the token is plausibly English
MIN_ROMANCE = 3.2  # below this the token isn't clearly foreign either

# Function words WordNet handles poorly or that are legitimately rare in English.
ALLOW = {"oneself", "someone", "something", "somebody", "anyone", "anything",
         "himself", "herself", "itself", "themselves", "myself", "yourself",
         "ourselves", "yourselves", "whom", "whose", "shall", "ought"}


def is_english(tok):
    return tok in ALLOW or bool(wn.synsets(tok)) or zipf(tok, "en") >= 2.8


def leaks(entry):
    """Tokens in en / en_syn that look like Spanish, French, Italian or Portuguese."""
    fields = [(entry.get("en", ""), "en")]
    fields += [(s, "en_syn") for s in (entry.get("en_syn") or [])]

    hits = []
    for text, field in fields:
        for tok in TOKEN.findall(text):
            low = tok.lower()
            if is_english(low):
                continue
            ze = zipf(low, "en")
            score, lang = max((zipf(low, l), l) for l in ("es", "fr", "it", "pt"))
            if ze < MAX_EN and score >= MIN_ROMANCE:
                hits.append(f"{tok!r} in {field} (en={ze:.1f}, {lang}={score:.1f})")
    return hits


def main():
    words = json.load(io.open(WORDS, encoding="utf-8"))
    found = []
    for w in words:
        if h := leaks(w):
            found.append((w.get("es"), w.get("en"), "; ".join(h)))

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    print(f"Foreign-language tokens in English glosses: {len(found)}\n" + "=" * 88)
    for es, en, note in found[:limit]:
        print(f"  {str(es)[:26]:28s} en={str(en)[:22]:24s} {note}")
    if len(found) > limit:
        print(f"  ... and {len(found)-limit} more")
    print("\nNote: culinary/art borrowings (consommé, dénouement, crème fraîche, digestif,")
    print("aquarelle, empanada) score as foreign but are valid English. Expect a few.")


if __name__ == "__main__":
    main()
