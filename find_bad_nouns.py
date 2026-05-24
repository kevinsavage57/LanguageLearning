import json, re

VERB_STARTERS = re.compile(
    r"^(to |lend|give|take|make|do |go |come|get |put |set |let |be |have|tell|ask |"
    r"bring|send|show|say |turn|keep|leave|run |hold|move|try |use |call|start|"
    r"stop|lose|pay |meet|feel|seem|look|become|follow|find|help|play|lead|"
    r"watch|stand|win |teach|learn|read|buy |wait|sell|open|close|push|pull|"
    r"carry|cut |draw|drive|eat |fall|fly |grow|hear|hit |jump|know|lay |lie |"
    r"pick|ride|rise|sit |sleep|speak|spend|swim |throw|wake|wear|write)",
    re.IGNORECASE
)

problems = []
BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"

for fname, lang_key in [("words_es.json", "es"), ("words_it.json", "it")]:
    enc = "utf-8-sig" if lang_key == "it" else "utf-8"
    with open(f"{BASE}\\{fname}", encoding=enc) as f:
        words = json.load(f)
    for w in words:
        if w.get("pos") != "noun":
            continue
        en = w.get("en", "")
        if VERB_STARTERS.match(en):
            problems.append((fname, w.get("id", ""), w.get(lang_key, ""), en, w.get("noun_class", "")))

print(f"Found {len(problems)} suspicious entries:\n")
for fname, wid, native, en, nc in problems:
    print(f"  [{fname}]  {wid}")
    print(f"    {native!r:30s}  en={en!r}  noun_class={nc!r}")
