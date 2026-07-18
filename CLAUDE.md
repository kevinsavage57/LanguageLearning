# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step required — this is a pure static site with vanilla JS ES6 modules.

- **Local development**: Serve the directory over HTTP (e.g., `python -m http.server 8080` or VS Code Live Server). Opening `index.html` directly as a `file://` URL will fail due to ES6 module CORS restrictions.
- **Language selection**: Append `?lang=es` (Spanish, default) or `?lang=it` (Italian) to the URL.
- **No tests** — the project uses manual browser testing only.

## Architecture

### Language-Agnostic Engine

`app_main.js` is the core game engine and contains **zero language-specific logic**. All language logic is injected via a `LANG` object exported from `lang_XX.js`. This separation is strict — adding a new language only requires:
1. `lang_XX.js` — the `LANG` config object (conjugation engine, answer normalization, person handling, UI strings)
2. `conjugationPatterns_XX.js` — verb endings for all tenses/persons
3. `words_XX.json` — vocabulary entries
4. A new `<option>` in the HTML language selector

`app.js` is only a safe boot loader with error diagnostics — not the game logic entry point.

### Game Progression & Word Pool

- Users practice a rotating pool of 25 words. Each mastered word unlocks exactly one new word.
- **Both the initial pool and each new unlock are weighted by `rating`** (`pickLockedWordWeighted`): the `RATING_WEIGHTS` tail drops steeply, so r8/r9/r10 words are 40×/100×/400× less likely to be unlocked than r1.
- **Technical/archaic vocabulary**: entries with `"technical": true` or `"archaic": true` in `words_XX.json` are kept in the data file for reference but filtered out at load — they never appear in the app.
- **Mastery threshold**: 4 consecutive correct answers (`MASTERED_STREAK = 4`).
- **Word selection** uses SM-2 spaced repetition urgency weights. Overdue words get `base × min(5, 1 + overdueDays)`; not-yet-due words get `base × 0.05` (occasional filler); new words use vocabulary `rating` (1–10, 1 = most common) mapped to a base weight via `RATING_WEIGHTS`.
- **Verb tense unlock**: Tenses unlock sequentially as users accumulate 10+ correct answers per tense. Order: Present → Preterite → Imperfect → Future → Conditional → Present Subjunctive → Imperative (Affirmative) → Imperative (Negative).
- **SM-2 spaced repetition**: Each word carries `interval` (days), `nextReview` (timestamp), and `easeFactor` (default 2.5, min 1.3). Correct answers grow the interval (`0→1→3→round(prev×EF)`) and nudge EF up by 0.05 (capped at 2.5). Wrong answers reset interval to 1 day and decrease EF by 0.20. Typing game tracks separate `typing_*` fields. `decayWords()` is a no-op; urgency is computed live in `srsWeight()`.

### Game Modes

| Mode | Unlock Condition |
|---|---|
| Matching (default) | Always available |
| Review Only | Always available |
| Typing Game | After 20 words mastered in Matching |
| Verb Matching | After mastering ≥1 verb |
| Verb Typing | After Verb Matching unlocks |

### Progress Persistence

- **Primary**: `localStorage`, keyed per language.
- **Optional sync**: GitHub Gist API. Token and Gist ID are hardcoded in `app_main.js` (Gist-scope only). Writes are debounced 2 seconds (`GIST_SAVE_DEBOUNCE`).
- Up to 5 password-protected profiles per Gist; passwords are SHA-256 hashed client-side.

### Vocabulary Data Format (`words_XX.json`)

```json
{
  "id": "a_preposition",
  "es": "a",
  "en": "to/at",
  "level": "A1",
  "pos": "preposition",
  "en_syn": ["to", "at"],
  "es_syn": [],
  "rating": 5
}
```

Verb entries additionally carry conjugation metadata (infinitive, verb group `ar/er/ir`, irregular forms) inline within the same JSON array.

### English Conjugation (`englishConjugation_v2.js`)

Handles irregular English verbs, phrasal verbs, and parenthetical clarifications (e.g., `"raise (children)/lift"`). Answer normalization strips accents and punctuation for loose matching — this logic lives in `lang_XX.js`, not the engine.

### Python Data Scripts

`merge_it_all.py` and `merge_verbs_it.py` are one-off data processing utilities for merging Italian vocabulary batches. They are not part of the runtime and not needed for normal development.
