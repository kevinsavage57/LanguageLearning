# Language Learning Game

A browser-based vocabulary and verb conjugation game for Spanish (with Italian support). Progress is saved locally and optionally synced to a GitHub Gist so your data persists across devices.

---

## Getting Started

Open `index.html` in a browser. On your first visit a welcome screen appears asking how you'd like to start:

### ⚡ Quick Start
Unlocks ~200 of the most common words immediately and opens every game mode and all verb tenses from the start. Best if you have some prior Spanish experience or just want to get into everything right away.

### 🌱 Start from Scratch
Begins with a randomly selected pool of 25 words and only the Matching mode available. New modes and words unlock gradually as you play. Best for complete beginners who want a structured progression.

---

## The Interface

### Top bar
- **Mode selector** — choose the current game mode (see below)
- **Level selector** — filter words by CEFR level (A1, A2, B1, B2), show All Levels, or show Verbs Only
- **Language selector** — switch between Spanish 🇪🇸 and Italian 🇮🇹

### Sidebar
Shows mastery statistics: how many words you've matched-mastered, typing-mastered, and how many infinitives have been unlocked for verb modes.

---

## Game Modes

### Matching
The default mode. Five word pairs are displayed in two columns — Spanish on the left, English on the right — in shuffled order. Click a word on each side to match them. A correct pair is highlighted and removed; a wrong guess flashes red and deselects. Complete all five pairs to advance to the next round.

Words are weighted by how often you've gotten them wrong and how long since you've seen them, so harder and rustier words appear more frequently.

### Review Only
Same as Matching but restricted to words you've already mastered. Use this to keep mastered vocabulary fresh.

### Typing Game
Shows a word in one language and requires you to type the translation. Accent buttons appear below the input for Spanish characters. Unlocks after you have mastered 20 words in Matching (or immediately with Quick Start).

For **Start from Scratch** users, Typing only draws from words you've already matching-mastered. For **Quick Start** users, it draws from all unlocked words.

### Verb Matching *(unlocks later)*
Displays conjugated Spanish verb forms alongside English prompts and asks you to match them. Works the same way as Matching but with conjugations instead of vocabulary. A conjugation endings reference is available during play.

### Verb Typing *(unlocks later)*
Shows a conjugated Spanish verb form and asks you to type the correct English translation (or vice versa). Accepts all valid English alternates — for example, both "he did" and "he made" are accepted for *hizo*.

Both verb modes unlock once at least one verb infinitive has been fully mastered (matching-mastered and typing-mastered across all its words).

---

## How Progression Works

### Word pool
You start with 25 unlocked words. Each time you master a word — either in Matching or Typing — one new random word is added to your unlocked pool. This keeps the active set manageable while steadily expanding your vocabulary.

At any given time, only 25 words are in your active practice pool. As you master words they rotate out and new ones rotate in.

### Mastery
A word is **matching-mastered** after 4 correct matches in a row. It is **typing-mastered** after 4 correct typed answers in a row. Nouns with grammatical gender require both the singular and plural forms to be typed correctly to count as typing-mastered.

### Decay
Words you haven't seen in 7 days have their weight increased, making them more likely to appear in the next round. Streaks are not reset by decay — only the frequency of appearance goes up.

### Verb tenses
Only the Present tense is available initially. Each tense unlocks the next one in this order once you've answered it correctly 10 times across all persons:

> Present → Preterite → Imperfect → Future → Conditional → Present Subjunctive → Imperative (Affirmative) → Imperative (Negative)

A notification appears when a new tense unlocks. Once two or more tenses are unlocked, a **Mixed** option appears in the tense selector to practice them all together.

---

## Progress Sync

Progress is saved to your browser's `localStorage` automatically. Optionally, you can connect a GitHub Gist to sync progress across devices. Open the settings panel (⚙ icon) and enter your profile name and password. The same Gist supports up to 5 separate profiles, each password-protected.

You can also export/import a progress JSON file from the settings panel.

---

## Supported Languages

The app currently supports **Spanish** 🇪🇸 and **Italian** 🇮🇹. Switch between them using the language selector in the top bar, or by appending `?lang=es` or `?lang=it` to the URL. Progress is tracked independently per language within the same profile.

The app is designed to be language-agnostic. The game engine (`app_main.js`) contains no language-specific logic — everything language-specific lives in a `lang_XX.js` config file and a `words_XX.json` vocabulary file. Adding support for a new language requires:

1. A `words_XX.json` file with vocabulary entries in the appropriate format (Spanish and Italian files serve as reference)
2. A `lang_XX.js` file exporting a `LANG` object with the same shape as `lang_es.js` — covering conjugation patterns, answer normalisation, person/tense handling, noun gender rules, and UI strings
3. A `conjugationPatterns_XX.js` file defining verb endings for all supported tenses and verb groups
4. Adding an `<option>` for the new language to the language selector in `index.html`

---

## File Structure

| File | Purpose |
|---|---|
| `index.html` | App shell and UI |
| `app_main.js` | Language-agnostic game engine — mode logic, scoring, unlock rules, progress |
| `lang_es.js` / `lang_it.js` | Language config — conjugation engine, answer normalisation, UI strings |
| `conjugationPatterns_es.js` / `conjugationPatterns_it.js` | Verb conjugation endings for all tenses and verb groups |
| `englishConjugation_v2.js` | English conjugation rules used to generate and check English answers |
| `words_es.json` / `words_it.json` | Vocabulary and verb list with metadata for each language |
| `style.css` | Styles |
| `manifest.json` / `service-worker.js` | PWA support (installable on mobile) |
