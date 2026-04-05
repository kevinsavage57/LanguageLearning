// lang_it.js — Italian language configuration for the language learning app.
// All Italian-specific logic lives here. app_main.js and index.html are language-agnostic.
//
// To add a new language, create lang_XX.js with the same LANG export shape,
// then load it via ?lang=XX in the URL.

import { CONJUGATION_PATTERNS } from "./conjugationPatterns_it.js";
import { englishFor } from "./englishConjugation_v2.js";

// ─── Tense ordering and display ───────────────────────────────────────────────

const TENSE_ORDER = [
  "present",
  "passato_prossimo",
  "imperfetto",
  "futuro",
  "condizionale",
  "congiuntivo_presente",
  "imperativo",
];

function formatTenseLabel(tenseKey) {
  const map = {
    present:               "Present (Indicative)",
    passato_prossimo:      "Passato Prossimo",
    imperfetto:            "Imperfetto",
    futuro:                "Future (Indicative)",
    condizionale:          "Conditional",
    congiuntivo_presente:  "Present (Subjunctive)",
    imperativo:            "Imperative",
  };
  return map[tenseKey] || tenseKey;
}

function canonicalTenseKey(tense) {
  const t = (tense || "").toString().trim().toLowerCase();
  if (!t) return t;
  if (t === "imperative" || t === "imperativo") return "imperativo";
  if (t === "passato" || t === "passato prossimo") return "passato_prossimo";
  if (t === "imperfect" || t === "imperfetto") return "imperfetto";
  if (t === "future" || t === "futuro") return "futuro";
  if (t === "conditional" || t === "condizionale") return "condizionale";
  if (t === "congiuntivo" || t === "subjunctive" || t === "congiuntivo_presente") return "congiuntivo_presente";
  return t;
}

// ─── Person handling ──────────────────────────────────────────────────────────

function requiredPersonsForTense(tense) {
  tense = canonicalTenseKey(tense);
  if (tense === "imperativo") return ["tu", "3s", "noi", "voi", "3p"];
  return ["io", "tu", "3s", "noi", "voi", "3p"];
}

function canonicalPerson(person) {
  const p = (person || "").toString().trim().toLowerCase();
  if (p === "3s") return "3s";
  if (p === "3p") return "3p";
  if (p === "io") return "io";
  if (p === "tu") return "tu";
  if (p === "lui" || p === "lei" || p === "lei (formal)") return "3s";
  if (p === "noi") return "noi";
  if (p === "voi") return "voi";
  if (p === "loro") return "3p";
  return person;
}

function displayPersonLabel(canon) {
  switch (canon) {
    case "3s": return "lui / lei";
    case "3p": return "loro";
    default:   return canon;
  }
}

// Italian reflexive pronouns by person
function getReflexivePronoun(person) {
  const map = {
    io: "mi", tu: "ti", lui: "si",
    noi: "ci", voi: "vi", loro: "si",
    "3s": "si", "3p": "si",
  };
  return map[(person || "").toLowerCase()] || "si";
}

// ─── Verb infinitive helpers ──────────────────────────────────────────────────

function isReflexiveInfinitive(inf) {
  return typeof inf === "string" && inf.toLowerCase().endsWith("si");
}

function getBaseInfinitive(inf) {
  if (!inf) return inf;
  return isReflexiveInfinitive(inf) ? inf.slice(0, -2) : inf;
}

// ─── Orthographic adjustments ─────────────────────────────────────────────────
// Italian keeps hard c/g sounds before -e/-i by inserting h.
// Soft c/g (verbs ending -ciare/-giare) drop the i before endings starting with i/e.

function applyOrthography(baseStem, baseInf, tense, person, ending) {
  const inf = (baseInf || "").toLowerCase();
  const end = (ending || "").toLowerCase();

  // -care / -gare: insert h before e/i endings to keep hard sound
  if (inf.endsWith("care") && /^[ei]/.test(end))
    return baseStem.slice(0, -1) + "ch";
  if (inf.endsWith("gare") && /^[ei]/.test(end))
    return baseStem.slice(0, -1) + "gh";

  // -ciare / -giare: drop the i from stem before endings starting with i or e
  if ((inf.endsWith("ciare") || inf.endsWith("giare")) && /^i/.test(end))
    return baseStem.endsWith("i") ? baseStem.slice(0, -1) : baseStem;

  return baseStem;
}

// ─── Passato prossimo auxiliary + past participle ─────────────────────────────

function getAuxiliary(verb, person) {
  // Verbs that take "essere" store aux: "essere" in their data.
  // Default is "avere".
  const aux = verb.aux || "avere";
  if (aux !== "essere") {
    // avere auxiliary — conjugated in present
    const avere = {
      io: "ho", tu: "hai", lui: "ha",
      noi: "abbiamo", voi: "avete", loro: "hanno",
    };
    return avere[person] || "ha";
  }
  // essere auxiliary — past participle agrees with subject
  const essere = {
    io: "sono", tu: "sei", lui: "è",
    noi: "siamo", voi: "siete", loro: "sono",
  };
  return essere[person] || "è";
}

function getPastParticiple(verb, person) {
  // Allow direct override in verb data
  if (verb.pastParticiple) {
    const pp = verb.pastParticiple;
    // If essere auxiliary, agree with canonical person
    if ((verb.aux || "avere") === "essere") {
      const p = (person || "").toLowerCase();
      if (p === "io" || p === "tu" || p === "lui") return pp; // masc sg (default)
      if (p === "noi" || p === "voi" || p === "loro") return pp.replace(/o$/, "i"); // masc pl
    }
    return pp;
  }

  const inf = getBaseInfinitive(verb.infinitive);
  let pp;
  if (inf.endsWith("are")) pp = inf.slice(0, -3) + "ato";
  else if (inf.endsWith("ere")) pp = inf.slice(0, -3) + "uto";
  else if (inf.endsWith("ire")) pp = inf.slice(0, -3) + "ito";
  else pp = inf + "ato";

  if ((verb.aux || "avere") === "essere") {
    const p = (person || "").toLowerCase();
    if (p === "noi" || p === "voi" || p === "loro") pp = pp.replace(/o$/, "i");
  }
  return pp;
}

// ─── Futuro stem ──────────────────────────────────────────────────────────────
// -are verbs: parlare → parler-  (drop final e, a→e)
// -ere verbs: vendere → vender-  (drop final e)
// -ire verbs: partire → partir-  (drop final e)

function getFuturoStem(verb) {
  if (verb.stemOverrides?.futuro) return verb.stemOverrides.futuro;
  const inf = getBaseInfinitive(verb.infinitive);
  if (inf.endsWith("are")) return inf.slice(0, -3) + "er";
  if (inf.endsWith("ere")) return inf.slice(0, -1);
  if (inf.endsWith("ire")) return inf.slice(0, -1);
  return inf;
}

// ─── Noun gender / article / pluralisation ────────────────────────────────────

function pluralizeNoun(base, nounClass) {
  const s = (base || "").trim();
  const low = s.toLowerCase();

  // Nouns ending in accented vowel or consonant are invariable
  if (/[àèìòùáéíóú]$/.test(low) || /[^aeiou]$/.test(low)) return s;

  if (nounClass === "m_std" || nounClass === "m_o") {
    if (low.endsWith("o")) return s.slice(0, -1) + "i";
    if (low.endsWith("e")) return s.slice(0, -1) + "i";
    return s;
  }
  if (nounClass === "f_std" || nounClass === "f_a") {
    if (low.endsWith("a")) return s.slice(0, -1) + "e";
    if (low.endsWith("e")) return s.slice(0, -1) + "i";
    return s;
  }
  // Fallback
  if (low.endsWith("o")) return s.slice(0, -1) + "i";
  if (low.endsWith("a")) return s.slice(0, -1) + "e";
  if (low.endsWith("e")) return s.slice(0, -1) + "i";
  return s;
}

function nounArticlesForClass(nounClass, wordBase) {
  const w = (wordBase || "").trim().toLowerCase();
  const startsVowel = /^[aeiouàèìòùáéíóú]/.test(w);
  const startsZ = /^z/.test(w);
  const startsGn = /^gn/.test(w);
  const startsPS = /^ps/.test(w);
  const startsX = /^x/.test(w);
  const needsLo = startsZ || startsGn || startsPS || startsX || /^s[^aeiou]/.test(w);

  if (nounClass === "m_std") {
    if (startsVowel) return { sg: "l'", pl: "gli" };
    if (needsLo)     return { sg: "lo", pl: "gli" };
    return               { sg: "il", pl: "i" };
  }
  if (nounClass === "f_std") {
    if (startsVowel) return { sg: "l'", pl: "le" };
    return               { sg: "la", pl: "le" };
  }
  return null;
}

function isRegularNoun(w) {
  return !!(w && (w.noun_class === "m_std" || w.noun_class === "f_std"));
}

function getNounForms(w) {
  if (!w || w.pos !== "noun") return null;
  const wordBase = (w.src || w.it || "").trim();
  if (!wordBase) return null;

  if (w.noun_class === "irregular" && w.noun_override) {
    const base   = w.noun_override.base || wordBase;
    const plBase = w.noun_override.plural || pluralizeNoun(base, "m_std");
    const aSg    = w.noun_override.article_sg || "il";
    const aPl    = w.noun_override.article_pl || "i";
    return { base, pluralBase: plBase, singular: `${aSg} ${base}`, plural: `${aPl} ${plBase}` };
  }

  const arts = nounArticlesForClass(w.noun_class, wordBase);
  if (!arts) return null;

  const plBase = pluralizeNoun(wordBase, w.noun_class);
  return { base: wordBase, pluralBase: plBase, singular: `${arts.sg} ${wordBase}`, plural: `${arts.pl} ${plBase}` };
}

function nounRequiresPluralForMastery(w) {
  return !!(w && w.pos === "noun" && !isRegularNoun(w));
}

// ─── English plural helper ────────────────────────────────────────────────────

// Pluralize a single English word token.
function _pluralizeToken(s) {
  const low = s.toLowerCase();
  const IRREGULARS = {
    "person":"people","man":"men","woman":"women","child":"children",
    "tooth":"teeth","foot":"feet","mouse":"mice","goose":"geese",
    "ox":"oxen","die":"dice","leaf":"leaves","knife":"knives",
    "wife":"wives","life":"lives","wolf":"wolves","half":"halves",
    "shelf":"shelves","thief":"thieves","loaf":"loaves",
  };
  if (IRREGULARS[low]) return IRREGULARS[low];
  if (/^(sheep|deer|fish|species|series|aircraft|moose|salmon|trout)$/i.test(low)) return s;
  if (/(quiz)$/i.test(s))            return s + "zes";
  if (/([^aeiou])y$/i.test(s))       return s.replace(/y$/i, "ies");
  if (/(s|ss|sh|ch|x|z)$/i.test(s)) return s + "es";
  if (/(lf|rf|af)e?$/i.test(s))      return s.replace(/fe?$/i, "ves");
  return s + "s";
}

// Pluralize an English phrase for display in prompts ("party" → "parties" etc.)
// Handles "X of Y" constructions by pluralizing the head noun and leaving
// the "of …" tail unchanged ("sheet of paper" → "sheets of paper").
function _pluralizeEnglish(en) {
  const s = (en || "").trim();

  // "X of Y" — pluralize only the head noun (last word before " of ")
  const ofIdx = s.toLowerCase().indexOf(" of ");
  if (ofIdx !== -1) {
    const head = s.slice(0, ofIdx);
    const tail = s.slice(ofIdx);
    const headWords = head.split(" ");
    headWords[headWords.length - 1] = _pluralizeToken(headWords[headWords.length - 1]);
    return headWords.join(" ") + tail;
  }

  return _pluralizeToken(s);
}

function nounTypingHint(w, nf, target) {
  const isPlural = target === nf.plural;
  const article  = target.split(" ")[0];
  const isMasc   = (article === "il" || article === "lo" || article === "i" || article === "gli");
  const gender   = w.gender_pair_id ? (isMasc ? "masculine" : "feminine") : null;

  if (isPlural) {
    // Invariant nouns (singular === plural) must not have their English pluralized —
    // the English gloss is already correct as-is (e.g. "headphones", "scissors").
    const isInvariant = nf.singular === nf.plural;
    const englishWord = isInvariant
      ? (w.tgt || w.en || "")
      : _pluralizeEnglish(w.tgt || w.en || "");
    return { word: englishWord, gender: null };
  }
  return { word: w.tgt || w.en || "", gender };
}

// ─── Pronoun variants (for answer checking) ───────────────────────────────────

function _pronounVariantsForPerson(person) {
  const p = (person || "").toString().toLowerCase();
  if (p === "io")                  return ["I"];
  if (p === "tu")                  return ["you"];
  if (p === "noi")                 return ["we"];
  if (p === "voi")                 return ["you all"];
  if (p === "lui" || p === "lei" || p === "3s") return ["he", "she", "you"];
  if (p === "loro" || p === "3p")  return ["they"];
  return null;
}

function _splitPronounAndBody(english) {
  const s = (english || "").trim();
  if (!s) return { pronoun: "", body: "" };
  const lower = s.toLowerCase();
  if (lower.startsWith("you all ")) return { pronoun: "you all", body: s.slice(8).trim() };
  const firstSpace = s.indexOf(" ");
  if (firstSpace === -1) return { pronoun: s, body: "" };
  return { pronoun: s.slice(0, firstSpace), body: s.slice(firstSpace + 1).trim() };
}

function buildAcceptableEnglishAnswers(expectedEnglish, personOrList) {
  const expected = (expectedEnglish || "").trim();
  const { body } = _splitPronounAndBody(expected);
  if (!body) return [expected];

  const variants = Array.isArray(personOrList)
    ? (() => {
        const out = new Set();
        for (const p of personOrList) {
          const v = _pronounVariantsForPerson(p);
          if (Array.isArray(v)) v.forEach(x => out.add(x));
        }
        return Array.from(out);
      })()
    : _pronounVariantsForPerson(personOrList);

  if (!variants) return [expected];
  const out = new Set([expected]);
  for (const v of variants) out.add(`${v} ${body}`);
  return Array.from(out);
}

function applyYouAllFormalityTag(expectedEnglish, person) { return expectedEnglish; }
function stripYouAllFormalityTag(s) {
  return (s || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
}

const AMBIGUOUS_PERSON_GROUPS = [];

// ─── Answer normalisation ─────────────────────────────────────────────────────

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeAnswer(s) {
  return stripDiacritics(String(s ?? "")).toLowerCase().trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:'"]/g, "");
}

// ─── Conjugation endings reference table ──────────────────────────────────────

function buildEndingsTableHTML(tense, showHeader) {
  const persons = tense === "imperativo"
    ? ["tu", "lei", "noi", "voi", "loro"]
    : ["io", "tu", "lui", "noi", "voi", "loro"];

  const personLabels = {
    io: "io", tu: "tu", lui: "lui / lei", noi: "noi", voi: "voi", loro: "loro",
    lei: "Lei (formal)",
  };

  const stemNotes = {
    present:              "Endings attach to the <strong>verb stem</strong> (infinitive minus -are/-ere/-ire).",
    passato_prossimo:     "<strong>avere/essere</strong> (present) + <strong>past participle</strong>. Essere verbs agree in gender/number.",
    imperfetto:           "Endings attach to the <strong>verb stem</strong>.",
    futuro:               "-are: drop -e, change a→e; -ere/-ire: drop -e. Add endings to this <strong>futuro stem</strong>.",
    condizionale:         "Same <strong>futuro stem</strong> as the future, with conditional endings.",
    congiuntivo_presente: "Based on the <strong>verb stem</strong>. io/tu/lui share the same form.",
    imperativo:           "tu = present 2s (or stem for -are); Lei = congiuntivo; noi = present 1p; voi = present 2p.",
  };

  const groups = ["are", "ere", "ire", "ire_isc"];

  function getCell(group, person) {
    const pat = CONJUGATION_PATTERNS[group]?.[tense];
    if (!pat) return "-";
    const ending = pat.endings?.[person];
    return ending === undefined ? "-" : (ending === "" ? "(see note)" : ending);
  }

  const rows = persons.map(person => {
    const cells = groups.map(g => `<td><span class="ending-pill ${g.replace("_","")}">${getCell(g, person)}</span></td>`).join("");
    return `<tr><td class="col-person">${personLabels[person] || person}</td>${cells}</tr>`;
  }).join("");

  return `
    ${showHeader ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#333;">${formatTenseLabel(tense)}</h3>` : ""}
    <div class="endings-stem-note">${stemNotes[tense] || ""}</div>
    <table class="endings-table">
      <thead><tr>
        <th class="col-person">Person</th>
        <th><span class="ending-pill are">-are</span></th>
        <th><span class="ending-pill ere">-ere</span></th>
        <th><span class="ending-pill ire">-ire</span></th>
        <th><span class="ending-pill ireisc">-ire (-isc)</span></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── Verb infinitive detection ────────────────────────────────────────────────

function looksLikeVerbInfinitive(w) {
  return (
    typeof (w.src || w.it) === "string" &&
    /(are|ere|ire)$/.test(w.src || w.it) &&
    typeof (w.tgt || w.en) === "string" &&
    /^to\s+/i.test(w.tgt || w.en)
  );
}

// ─── UI prompt strings ────────────────────────────────────────────────────────

const UI = {
  gameName:       "Italian–English",
  sourceLabel:    "Italian",
  targetLabel:    "English",
  errorTitle:     "Language Game – Startup Error",

  typeTargetFor:  (source) => `Type the English for: ${source}`,
  typeSourceFor:  (target) => `Type the Italian for: ${target}`,
  verbTypeTarget: (tenseLabel, source) => `(${tenseLabel}) Type the English for: ${source}`,
  verbTypeSource: (tenseLabel, target) => `(${tenseLabel}) Type the Italian for: ${target}`,
};

// ─── Accent buttons ───────────────────────────────────────────────────────────

const ACCENT_BUTTONS = [
  { ch: "à" }, { ch: "è" }, { ch: "é" }, { ch: "ì" }, { ch: "ò" }, { ch: "ù" },
];

// ─── Conjugation engine ───────────────────────────────────────────────────────

function buildVerbForms(verb, tgtFor) {
  const results = [];
  const patterns = CONJUGATION_PATTERNS[verb.group];
  if (!patterns) return results;

  const getRegularStem = (inf) => inf.slice(0, -3); // strip -are/-ere/-ire

  const buildForm = (tense, person) => {
    const baseInf    = getBaseInfinitive(verb.infinitive);
    const stem       = getRegularStem(baseInf);
    const reflexive  = verb.reflexive === true || isReflexiveInfinitive(verb.infinitive);
    const def        = CONJUGATION_PATTERNS[verb.group]?.[tense];
    if (!def) return null;

    // Direct per-form override in verb data
    const directOverride = verb.overrides?.[tense]?.[person];
    if (directOverride) {
      return _attachReflexive(directOverride, reflexive, person, verb);
    }

    let form;

    if (def.stemType === "passato_prossimo") {
      const aux = getAuxiliary(verb, person);
      const pp  = getPastParticiple(verb, person);
      form = `${aux} ${pp}`;
    } else if (def.stemType === "futuro") {
      const futStem = getFuturoStem(verb);
      const ending  = def.endings?.[person];
      if (ending === undefined) return null;
      form = futStem + ending;
    } else if (def.stemType === "stem_isc") {
      // -ire/-isc- pattern: isc- is baked into endings for affected persons
      const ending = def.endings?.[person];
      if (ending === undefined) return null;
      form = stem + ending;
    } else if (def.stemType === "imperativo") {
      return LANG.buildImperativoForm({ verb, person, stem, baseInf, buildFormFn: buildForm });
    } else {
      // "stem" or fallback
      const ending = def.endings?.[person];
      if (ending === undefined) return null;
      const adjustedStem = applyOrthography(stem, baseInf, tense, person, ending);
      form = adjustedStem + ending;
    }

    return _attachReflexive(form, reflexive, person, verb);
  };

  for (const tense in patterns) {
    const def      = patterns[tense];
    const endings  = def.endings || def;

    for (const person in endings) {
      const srcForm = buildForm(tense, person);
      if (!srcForm) continue;

      const entry = { tense, person, src: srcForm, tgt: tgtFor(verb, tense, person) };
      results.push(entry);

      // Expand lui → lei (3s) when not explicitly in pattern
      const expanded = LANG.expandConjugationPersons(person, endings);
      for (const ep of expanded) {
        if (ep !== person) {
          results.push({ tense, person: ep, src: srcForm, tgt: tgtFor(verb, tense, ep) });
        }
      }
    }
  }

  return results;
}

function _attachReflexive(form, reflexive, person, verb) {
  if (!reflexive) return form;
  const pro   = getReflexivePronoun(person);
  const lower = form.toLowerCase();
  const already = ["mi ", "ti ", "si ", "ci ", "vi "].some(p => lower.startsWith(p));
  if (!already && pro) return `${pro} ${form}`;
  return form;
}

// ─── Main LANG export ─────────────────────────────────────────────────────────

export const LANG = {
  // Identity
  id:           "it",
  sourceLang:   "Italian",
  targetLang:   "English",
  sourceKey:    "it",
  targetKey:    "en",
  sourceSynKey: "it_syn",
  targetSynKey: "en_syn",

  // Tense system
  tenseOrder:              TENSE_ORDER,
  formatTenseLabel,
  canonicalTenseKey,
  requiredPersonsForTense,

  // Person system
  canonicalPerson,
  displayPersonLabel,
  getReflexivePronoun,
  ambiguousPersonGroups:   AMBIGUOUS_PERSON_GROUPS,

  // Verb infinitive shape
  isReflexiveInfinitive,
  getBaseInfinitive,
  looksLikeVerbInfinitive,

  // Conjugation rules
  conjugationPatterns:     CONJUGATION_PATTERNS,
  applyOrthography,
  englishFor,

  // Passato prossimo helpers (exposed for potential UI use)
  getAuxiliary,
  getPastParticiple,
  getFuturoStem,

  // Noun gender system
  getNounForms,
  nounArticlesForClass,
  pluralizeNoun,
  isRegularNoun,
  nounRequiresPluralForMastery,
  nounTypingHint,

  // Answer checking
  normalizeAnswer,
  stripDiacritics,
  infinitivePrefix:        "to ",
  buildAcceptableEnglishAnswers,
  applyYouAllFormalityTag,
  stripYouAllFormalityTag,
  splitPronounAndBody:     _splitPronounAndBody,
  pronounVariantsForPerson: _pronounVariantsForPerson,

  // UI
  ui:            UI,
  accentButtons: ACCENT_BUTTONS,

  // Person expansion: lui → lei (Italian doesn't have usted/ustedes but Lei is 3s formal)
  expandConjugationPersons(person, endings) {
    const out = [person];
    const p = (person || "").toString();
    if (p === "lui" && endings && !("lei" in endings)) out.push("lei");
    if (p === "loro" && endings && !("loro" in endings)) out.push("loro");
    return out;
  },

  buildEndingsTableHTML,
  buildVerbForms,

  // Italian imperative builder
  buildImperativoForm({ verb, person, stem, baseInf, buildFormFn }) {
    const group = verb.group;
    if (person === "tu") {
      if (group === "are" || group === "are_ca" || group === "are_ga") {
        // -are: tu imperative = stem (drop -are, no ending): parla, guarda
        // For -care/-gare apply orthography: cercare → cerca, pagare → paga
        return applyOrthography(stem, baseInf, "imperativo", "tu", "") + "";
      }
      // -ere/-ire: tu imperative = present tu form
      return buildFormFn("present", "tu")?.replace(/^(mi|ti|si|ci|vi)\s+/i, "") || null;
    }
    if (person === "lei") {
      // Lei (formal) = congiuntivo presente 3s
      return buildFormFn("congiuntivo_presente", "lui")?.replace(/^(mi|ti|si|ci|vi)\s+/i, "") || null;
    }
    if (person === "noi") {
      return buildFormFn("present", "noi")?.replace(/^(mi|ti|si|ci|vi)\s+/i, "") || null;
    }
    if (person === "voi") {
      return buildFormFn("present", "voi")?.replace(/^(mi|ti|si|ci|vi)\s+/i, "") || null;
    }
    if (person === "loro") {
      return buildFormFn("congiuntivo_presente", "loro")?.replace(/^(mi|ti|si|ci|vi)\s+/i, "") || null;
    }
    return null;
  },

  reflexivePronounPrefixes: ["mi ", "ti ", "si ", "ci ", "vi "],

  // Feature flags
  hasTenses:              true,
  hasGrammaticalGender:   true,
  hasReflexiveVerbs:      true,
  verbGroupField:         "group",

  mapWord(raw) {
    if (raw.src != null) {
      return {
        src:     raw.src,
        tgt:     raw.tgt,
        src_syn: Array.isArray(raw.src_syn) ? raw.src_syn : [],
        tgt_syn: Array.isArray(raw.tgt_syn) ? raw.tgt_syn : [],
        level:   raw.level || "A1",
      };
    }
    return {
      src:     raw.it,
      tgt:     raw.en,
      src_syn: Array.isArray(raw.it_syn) ? raw.it_syn : [],
      tgt_syn: Array.isArray(raw.en_syn) ? raw.en_syn : [],
      level:   raw.level || "A1",
    };
  },

  migrateProgressPayload(raw) {
    const normalizeWord = (w) => {
      if (!w || typeof w !== "object") return w;
      if (w.src != null) return w;
      if (w.it != null) return { ...w, src: w.it, tgt: w.en };
      return w;
    };
    if (Array.isArray(raw)) {
      return { words: raw.map(normalizeWord), verbTenseProgress: null };
    }
    if (raw && Array.isArray(raw.words)) {
      return { ...raw, words: raw.words.map(normalizeWord) };
    }
    return raw;
  },
};
