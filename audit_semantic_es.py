"""
High-precision pass: find English glosses that are semantically UNRELATED to the Spanish word.

audit_bilingual_es.py flags any gloss missing from OMW's lemma list, which over-fires --- OMW
simply doesn't list every valid translation ("reloj" -> "watch" is fine but OMW says "clock").
The real defect signature is distance: "watch"/"clock" are near-neighbours in WordNet, while
gota's "squeeze" and "drop" share almost no structure.

So: score max Wu-Palmer similarity between the gloss and OMW's translation set. Low score with
good OMW coverage = genuine suspect. Sorted worst-first for review. Read-only.
"""
import json, io, re, sys
from nltk.corpus import wordnet as wn

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_es.json"

MIN_SENSES = 2       # OMW must know the Spanish word reasonably well
SIM_THRESHOLD = 0.42 # below this, gloss and OMW set look unrelated

POS_MAP = {"noun": wn.NOUN, "verb": wn.VERB, "adjective": wn.ADJ, "adverb": wn.ADV}


def norm(s):
    s = re.sub(r"\s*\([^)]*\)", "", (s or "").strip().lower())
    s = re.sub(r"^(to|the|a|an)\s+", "", s)
    return re.sub(r"[^a-z ]", "", s).strip()


def gloss_synsets(gloss, pos):
    """Synsets for the primary gloss (first slash-variant only)."""
    head = re.split(r"[/,;]", gloss or "")[0]
    n = norm(head)
    if not n:
        return []
    kwargs = {"pos": POS_MAP[pos]} if pos in POS_MAP else {}
    ss = wn.synsets(n.replace(" ", "_"), **kwargs) or wn.synsets(n.split()[-1], **kwargs)
    return ss[:6]


def omw_synsets(es_word, pos):
    kwargs = {"lang": "spa"}
    if pos in POS_MAP:
        kwargs["pos"] = POS_MAP[pos]
    try:
        return wn.synsets(es_word, **kwargs)[:10]
    except Exception:
        return []


def max_sim(a_list, b_list):
    best = 0.0
    for a in a_list:
        for b in b_list:
            if a.pos() != b.pos():
                continue
            try:
                s = a.wup_similarity(b) or 0.0
            except Exception:
                s = 0.0
            best = max(best, s)
    return best


def main():
    words = json.load(io.open(WORDS, encoding="utf-8"))
    suspects = []

    for w in words:
        es = (w.get("es") or "").strip().lower()
        en = w.get("en") or ""
        pos = w.get("pos")
        if not es or not en or " " in es:
            continue

        omw = omw_synsets(es, pos)
        if len(omw) < MIN_SENSES:
            continue
        gl = gloss_synsets(en, pos)
        if not gl:
            continue

        sim = max_sim(gl, omw)
        if sim >= SIM_THRESHOLD:
            continue

        # Does any synonym land closer? That's the likely intended answer.
        rescue, rescue_sim = None, sim
        for syn in (w.get("en_syn") or []):
            ss = gloss_synsets(syn, pos)
            s = max_sim(ss, omw)
            if s > rescue_sim:
                rescue, rescue_sim = syn, s

        lemmas = sorted({l for s in omw for l in s.lemma_names("eng") if "_" not in l})[:6]
        suspects.append((sim, es, en, pos, rescue, round(rescue_sim, 2), ", ".join(lemmas)))

    suspects.sort(key=lambda r: r[0])
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 60

    print(f"Semantically unrelated glosses: {len(suspects)} (worst first)\n" + "=" * 100)
    for sim, es, en, pos, rescue, rsim, lemmas in suspects[:limit]:
        line = f"  sim={sim:.2f}  {es:18s} en={en[:22]:24s} [{pos or '?':9s}] omw={lemmas}"
        if rescue:
            line += f"\n{'':14s}-> better syn: {rescue!r} (sim={rsim})"
        print(line)
    if len(suspects) > limit:
        print(f"\n  ... and {len(suspects)-limit} more")


if __name__ == "__main__":
    main()
