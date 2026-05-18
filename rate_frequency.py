"""
Rates every word in words_es.json and words_it.json by English frequency
(1 = most common, 10 = least common) using the wordfreq corpus library,
then writes frequency_es.csv and frequency_it.csv.

Usage:
    python rate_frequency.py
"""

import json
import csv
import re
import os
from wordfreq import zipf_frequency

BASE = os.path.dirname(os.path.abspath(__file__))

# Map Zipf score (log10-scale corpus frequency) → 1-10 rating (1 = most common)
ZIPF_BRACKETS = [
    (7.0, 1),
    (6.0, 2),
    (5.5, 3),
    (5.0, 4),
    (4.5, 5),
    (4.0, 6),
    (3.5, 7),
    (3.0, 8),
    (2.0, 9),
]

STOPWORDS = {
    "a", "an", "the", "of", "to", "in", "on", "at", "by", "for",
    "with", "up", "out", "as", "is", "be", "do", "it", "or",
}


def zipf_to_rating(zipf: float) -> int:
    for threshold, rating in ZIPF_BRACKETS:
        if zipf >= threshold:
            return rating
    return 10


def clean_english(en: str) -> str:
    """Strip gender markers, parentheticals, pick first slash-variant."""
    s = en.strip()
    # Take first slash-variant: "raise/lift" → "raise"
    s = s.split("/")[0].strip()
    # Remove parentheticals: "predecessor (f)", "to be (location)"
    s = re.sub(r"\s*\([^)]*\)", "", s).strip()
    return s


def rate_english(en: str) -> int:
    """Return a 1-10 frequency rating for an English word or phrase."""
    cleaned = clean_english(en)
    if not cleaned:
        return 5

    tokens = cleaned.lower().split()
    # Filter to content words for phrases
    content = [t for t in tokens if t not in STOPWORDS] or tokens

    # Score each content word; use the minimum (rarest word drives the phrase rating)
    scores = [zipf_frequency(t, "en") for t in content]
    zipf = min(scores)

    # If the phrase has no corpus hits at all, try the full cleaned string as one token
    if zipf == 0 and len(content) > 1:
        zipf = zipf_frequency(cleaned, "en")

    return zipf_to_rating(zipf)


def process(json_path: str, csv_path: str, lang_key: str) -> None:
    print(f"\nLoading {os.path.basename(json_path)}...")
    with open(json_path, encoding="utf-8-sig") as f:
        words = json.load(f)

    print(f"  Rating {len(words)} entries...")
    rows = []
    for w in words:
        rating = rate_english(w.get("en", ""))
        rows.append([
            w.get("id", ""),
            w.get("en", ""),
            w.get(lang_key, ""),
            w.get("level", ""),
            w.get("pos", ""),
            rating,
        ])

    print(f"  Writing {os.path.basename(csv_path)}...")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "english", lang_key, "cefr_level", "pos", "frequency_1to10"])
        writer.writerows(rows)

    print(f"  Done — {len(rows)} rows saved.")


if __name__ == "__main__":
    process(
        os.path.join(BASE, "words_es.json"),
        os.path.join(BASE, "frequency_es.csv"),
        "es",
    )
    process(
        os.path.join(BASE, "words_it.json"),
        os.path.join(BASE, "frequency_it.csv"),
        "it",
    )

    print("\nAll done!")
    print(f"  {os.path.join(BASE, 'frequency_es.csv')}")
    print(f"  {os.path.join(BASE, 'frequency_it.csv')}")
