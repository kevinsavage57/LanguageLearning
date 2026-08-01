"""
Precise detector for the 'idiom harvested as gloss' corruption in words_es.json.

Confirmed instances:
  gota   (noun) -> "squeeze",              real answer "drop" demoted into en_syn
  habito (noun) -> "to renounce one's vows" (from the idiom 'colgar los habitos'),
                                            real answer "habit" last in en_syn

Signature: a single-word headword whose primary gloss is the wrong part of speech, an
idiom fragment, or a dictionary definition rather than a translation.

Unlike find_bad_nouns.py this anchors on word boundaries -- that script's regex lacks \\b,
so 'open' matches "opening" and 'wait' matches "waiter", giving ~200 false positives that
bury the real hits. Read-only; prints a review list.
"""
import json, io, re, sys
from collections import defaultdict

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_es.json"

# Infinitive gloss: "to " + a real word, not part of a longer token.
INFINITIVE = re.compile(r"^to\s+[a-z]", re.I)
# Idiom/definition markers that should never open a single-word gloss.
IDIOM_MARK = re.compile(r"\b(one's|someone's|somebody's|oneself|sth\b|sb\b)", re.I)
DEFINITIONAL = re.compile(r"^(a|an|the)\s+.*\b(of|for|with|to)\s*$", re.I)

NOUNISH = {"noun"}
VERBISH = {"verb"}


def first_gloss(en):
    return re.split(r"[/;]", en or "")[0].strip()


def check(w):
    """Return a list of (severity, reason) findings for one entry."""
    es = (w.get("es") or "").strip()
    en = (w.get("en") or "").strip()
    pos = w.get("pos") or ""
    syns = w.get("en_syn") or []
    out = []
    if not es or not en:
        return out

    single = " " not in es
    head = first_gloss(en)

    # 1. POS mismatch: a noun glossed as an infinitive.
    if pos in NOUNISH and INFINITIVE.match(head):
        out.append(("HIGH", f"noun glossed as infinitive: {en!r}"))

    # 2. A verb glossed with no infinitive anywhere and no verbal synonym.
    if pos in VERBISH and not INFINITIVE.match(head):
        if not any(INFINITIVE.match(first_gloss(s)) for s in syns):
            out.append(("MED", f"verb glossed as non-infinitive: {en!r}"))

    # 3. Idiom fragment as the gloss of a single word. Reflexive verbs are exempt:
    #    "lavarse" -> "to wash (oneself)" is the correct gloss, not idiom contamination.
    reflexive = pos in VERBISH and es.lower().endswith(("se", "sé"))
    if single and not reflexive and IDIOM_MARK.search(en):
        out.append(("HIGH", f"idiom fragment as gloss of a single word: {en!r}"))

    # 4. Single word glossed by a long phrase (definition, not translation).
    if single and len(head.split()) >= 4:
        out.append(("MED", f"single word glossed by {len(head.split())}-word phrase: {head!r}"))

    # 5. Definitional en_syn (dangling preposition / article-led) on a single word.
    if single:
        bad = [s for s in syns if DEFINITIONAL.match(s.strip())]
        if bad:
            out.append(("MED", f"definitional en_syn: {bad}"))

    # 6. Noun whose en_syn are mostly infinitives -> idiom contamination.
    if pos in NOUNISH and syns:
        inf = [s for s in syns if INFINITIVE.match(first_gloss(s))]
        if len(inf) >= 2:
            out.append(("HIGH", f"noun with infinitive synonyms: {inf}"))

    return out


def main():
    words = json.load(io.open(WORDS, encoding="utf-8"))
    findings = defaultdict(list)
    for w in words:
        for sev, reason in check(w):
            findings[sev].append((w.get("id"), w.get("es"), w.get("en"), reason))

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    for sev in ("HIGH", "MED"):
        rows = findings[sev]
        print(f"\n{'='*94}\n{sev}: {len(rows)}\n{'='*94}")
        for wid, es, en, reason in rows[:limit]:
            print(f"  {str(es)[:24]:26s} {reason}")
        if len(rows) > limit:
            print(f"  ... and {len(rows)-limit} more")
    print(f"\nTotal: {sum(len(v) for v in findings.values())} findings across {len(words)} entries")


if __name__ == "__main__":
    main()
