"""
Find Spanish phrases (multi-word es) whose English translation is a single short word
that is likely a truncated/generic translation rather than the real meaning.
"""
import json

BASE = r"C:\Users\kevin\OneDrive\Documents\GitHub\LanguageLearning"

# Single English words that are too vague to be the primary translation of a multi-word phrase
SUSPICIOUS_SINGLES = {
    "cut", "play", "run", "set", "call", "draw", "turn", "stand", "lead",
    "fall", "drive", "move", "stop", "watch", "show", "start", "open",
    "close", "hold", "raise", "drop", "break", "pass", "press", "pick",
    "pull", "push", "strike", "change", "catch", "roll", "cover", "follow",
    "take", "make", "give", "put", "get", "go", "do", "look", "keep",
    "lose", "found", "leave", "bring", "send", "meet", "feel", "find",
    "read", "buy", "sell", "build", "add", "live", "die", "grow",
    "flat", "heavy", "light", "hard", "free", "clear", "back",
}

with open(f"{BASE}\\words_es.json", encoding="utf-8") as f:
    words = json.load(f)

problems = []
for w in words:
    es = w.get("es", "")
    en = w.get("en", "").strip().lower()
    # Multi-word Spanish phrase
    if " " not in es:
        continue
    # Single-word English translation (ignoring slash-variants by checking first token)
    en_first = en.split("/")[0].strip()
    if len(en_first.split()) == 1 and en_first in SUSPICIOUS_SINGLES:
        problems.append((w.get("id", ""), es, w.get("en", ""), w.get("en_syn", [])))

print(f"Found {len(problems)} suspicious translations:\n")
for wid, es, en, syns in problems:
    syn_str = ", ".join(syns) if syns else "—"
    print(f"  {es!r:35s}  en={en!r:15s}  syn={syn_str}")
