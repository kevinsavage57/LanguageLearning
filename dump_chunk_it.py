"""Page through the live words_it.json entries in rating order for manual review.

Usage: python dump_chunk_it.py START COUNT

Sorted by (rating, headword) so the words learners actually meet come first:
RATING_WEIGHTS makes an r1 word roughly 400x more likely to unlock than an r10.
"""
import json, io, sys

WORDS = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning\words_it.json"

start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
count = int(sys.argv[2]) if len(sys.argv) > 2 else 200

words = json.load(io.open(WORDS, encoding="utf-8-sig"))
live = [w for w in words if not w.get("technical") and not w.get("archaic")]
live.sort(key=lambda w: (w.get("rating", 99), (w.get("it") or "").lower()))

print("live entries: %d" % len(live))
for i, w in enumerate(live[start:start + count], start):
    syn = ", ".join(w.get("en_syn") or [])
    pos = (w.get("pos") or "?")[:4]
    line = "%d r%s %s = %s [%s]" % (i, w.get("rating"), w.get("it"), w.get("en"), pos)
    if syn:
        line += " ~ " + syn
    print(line)
