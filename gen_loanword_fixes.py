"""
Generate the two loanword review files:

  015_loanword_ratings.json  --- ratings re-derived from Italian corpus frequency
  016_loanword_plurals.json  --- unadapted loanwords made invariable

Ratings. The file's own native vocabulary gives a clean rating-to-frequency curve
(median zipf 7.16 at r1 falling monotonically to 2.19 at r10). Loanwords are scored
against that curve using their real frequency in Italian text, so a word that Italian
actually uses keeps its place and jargon drops to where it belongs. Two guards: the
pass only ever *demotes*, so nativised loanwords such as computer and email are never
promoted past the curriculum's intent; and multiword phrases take a one-band penalty
because wordfreq estimates a phrase by assuming its tokens are independent, which
overstates collocations like "hard power".

Plurals. Italian leaves unadapted loanwords invariable: i file, i badge, gli zoo.
The engine's -e -> -i rule was producing "i fili", "i badgi", "gli zoi". Which
loanwords have been adapted is not derivable, so the invariable ones are listed here
by hand; words the engine already gets right (banane, gondole, manghi, avocadi) are
deliberately absent.
"""
import json, io, re
from wordfreq import zipf_frequency as z

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"
WORDS = BASE + r"\words_it.json"
OUT = BASE + r"\review_fixes_it"

# Median zipf per rating for native single-word entries; cuts are the midpoints.
BANDS = [(6.39, 1), (5.38, 2), (4.94, 3), (4.57, 4), (4.17, 5),
         (3.76, 6), (3.37, 7), (2.98, 8), (2.48, 9)]

# Loanwords Italian has not adapted, so they do not inflect.
INVARIABLE = """
badge bike-sharing binge-watching boa-constrictor boutique box-office brie brochure
brownie bungee-jumping cardio cashmere champagne cookie customer-care data-scientist
database deadline detective djembe e-commerce edamame escape-room file garage hoodie
intelligence judo karate laser-game lycra mountain-bike mousse noodle nuance pancake
performance-art premier-league premiere private-equity quantitative-easing quinoa
roulette routine silo slot-machine software taekwondo task-force triage ukulele
venture-capital welfare-state yo-yo zombie zoo
""".split()


def norm(s):
    return re.sub(r"[^a-z0-9 -]", "", s.lower().strip())


def band(f):
    for cut, r in BANDS:
        if f >= cut:
            return r
    return 10


def main():
    words = json.load(io.open(WORDS, encoding="utf-8-sig"))
    live = [w for w in words if not w.get("technical") and not w.get("archaic")]

    rating_rows, plural_rows = [], []
    invariable = {w.replace("-", " ") for w in INVARIABLE} | set(INVARIABLE)

    for w in live:
        it, en = w["it"].strip(), w["en"].strip()
        n = norm(it)
        if it[:1].isupper() or n != norm(en):
            continue
        fi, fe = z(n, "it"), z(n, "en")
        if fe <= fi:
            continue                      # commoner in Italian than English: nativised
        b = band(fi)
        if re.search(r"[ -]", n):
            b = min(10, b + 1)
        cur = w.get("rating", 5)
        if max(cur, b) != cur:
            rating_rows.append({"it": it, "rating": max(cur, b),
                                "_was": cur, "_it_zipf": round(fi, 2)})
        if w.get("pos") == "noun" and (n in invariable or it.lower() in invariable):
            plural_rows.append({"it": it, "plural": it,
                                "_note": "unadapted loanword; invariable in Italian"})

    for name, header, rows in [
        ("015_loanword_ratings.json",
         "English loanword ratings re-derived from Italian corpus frequency",
         rating_rows),
        ("016_loanword_plurals.json",
         "unadapted loanwords made invariable", plural_rows),
    ]:
        blob = {"reviewed": header, "_generated_by": "gen_loanword_fixes.py",
                "rows": rows}
        with io.open(OUT + "\\" + name, "w", encoding="utf-8", newline="\n") as f:
            json.dump(blob, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("%s: %d rows" % (name, len(rows)))


if __name__ == "__main__":
    main()
