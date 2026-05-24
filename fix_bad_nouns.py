"""Fix verb/gerund/imperative entries misclassified as nouns in words_es.json."""
import json

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"

# Spanish words that are verb forms (imperatives, gerunds, conjugated forms, infinitive+clitic)
# and should be pos="phrase" with no noun_class.
ES_VERB_FORMS = {
    "dame", "dámela", "déselo", "déjame",
    "levántate", "levántese",
    "salgan", "vuelva", "pongan", "espere",
    "regalártelo",
    "ayudándolas", "enviándole", "llamándola", "llamándolo",
    "durmiendo", "leyendo", "siguiendo", "corrigiendo",
    "comencé", "empecé", "practiqué", "toqué",
    "mueva", "aprenda", "visto",
}

path = f"{BASE}\\words_es.json"
with open(path, encoding="utf-8") as f:
    words = json.load(f)

fixed = 0
for w in words:
    if w.get("pos") == "noun" and w.get("es", "") in ES_VERB_FORMS:
        w["pos"] = "phrase"
        w.pop("noun_class", None)
        fixed += 1

with open(path, "w", encoding="utf-8") as f:
    json.dump(words, f, ensure_ascii=False, indent=2)

print(f"Fixed {fixed} entries in words_es.json")
