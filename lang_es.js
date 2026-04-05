// lang_es.js — Spanish language configuration for the language learning app.
// All Spanish-specific logic lives here. app_main.js and index.html are language-agnostic.
//
// To add a new language, create lang_XX.js with the same LANG export shape,
// then load it via ?lang=XX in the URL.

import { CONJUGATION_PATTERNS } from "./conjugationPatterns_es.js";
import { englishFor } from "./englishConjugation_v2.js";

// ─── Tense ordering and display ──────────────────────────────────────────────

const TENSE_ORDER = [
  "present",
  "preterite",
  "imperfect",
  "future",
  "conditional",
  "present_subjunctive",
  "imperative_affirmative",
  "imperative_negative"
];

function formatTenseLabel(tenseKey) {
  const map = {
    present:                "Present (Indicative)",
    preterite:              "Preterite (Indicative)",
    imperfect:              "Imperfect (Indicative)",
    future:                 "Future (Indicative)",
    conditional:            "Conditional",
    present_subjunctive:    "Present (Subjunctive)",
    imperative_affirmative: "Imperative (Affirmative)",
    imperative_negative:    "Imperative (Negative)"
  };
  return map[tenseKey] || tenseKey;
}

// Canonical tense key normalisation (handles legacy aliases)
function canonicalTenseKey(tense) {
  const t = (tense || "").toString().trim().toLowerCase();
  if (!t) return t;
  if (t === "imperative") return "imperative_affirmative";
  if (t === "imperative-positive" || t === "imperative_aff" || t === "imperative_affirmative") return "imperative_affirmative";
  if (t === "imperative-negative" || t === "imperative_neg" || t === "imperative_negative") return "imperative_negative";
  return t;
}

// ─── Person handling ──────────────────────────────────────────────────────────

// Which persons are required to unlock each tense (using canonical keys)
function requiredPersonsForTense(tense) {
  tense = canonicalTenseKey(tense);
  switch (tense) {
    case "imperative_affirmative":
    case "imperative_negative":
      return ["tú", "3s", "nosotros", "vosotros", "3p"];
    default:
      return ["yo", "tú", "3s", "nosotros", "vosotros", "3p"];
  }
}

// Collapse all 3s/3p variants into canonical buckets
function canonicalPerson(person) {
  const p = (person || "").toString().trim().toLowerCase();
  if (p === "3s") return "3s";
  if (p === "3p") return "3p";
  if (p === "él" || p === "el" || p === "ella" || p === "usted") return "3s";
  if (p === "ellos" || p === "ellas" || p === "ustedes") return "3p";
  if (p === "yo") return "yo";
  if (p === "tú" || p === "tu") return "tú";
  if (p === "nosotros" || p === "nosotras") return "nosotros";
  if (p === "vosotros" || p === "vosotras") return "vosotros";
  return person;
}

// Human-readable label for canonical person keys (used in mastery UI)
function displayPersonLabel(canon) {
  switch (canon) {
    case "3s": return "él / ella / usted";
    case "3p": return "ellos / ellas / ustedes";
    default:   return canon;
  }
}

// Spanish reflexive pronouns by person
function getReflexivePronoun(person) {
  const map = {
    yo: "me", tú: "te", él: "se",
    nosotros: "nos", vosotros: "os", ellos: "se",
    "3s": "se", "3p": "se"
  };
  return map[(person || "").toLowerCase()] || "se";
}

// ─── Verb infinitive helpers ──────────────────────────────────────────────────

function isReflexiveInfinitive(inf) {
  return typeof inf === "string" && inf.toLowerCase().endsWith("se");
}

function getBaseInfinitive(inf) {
  if (!inf) return inf;
  return isReflexiveInfinitive(inf) ? inf.slice(0, -2) : inf;
}

// ─── Orthographic adjustments (spelling rules before vowels) ─────────────────

function applyOrthography(baseStem, baseInf, tense, person, ending) {
  const inf = (baseInf || "").toLowerCase();
  const needsSubjRules = ["present_subjunctive", "imperative_negative"].includes(tense);
  const needsPretYoRules = tense === "preterite" && person === "yo";

  if (needsPretYoRules) {
    if (inf.endsWith("car")) return baseStem.slice(0, -1) + "qu";
    if (inf.endsWith("gar")) return baseStem.slice(0, -1) + "gu";
    if (inf.endsWith("zar")) return baseStem.slice(0, -1) + "c";
  }

  if (needsSubjRules) {
    const eLike = /^e|^é|^i|^í/i.test(ending || "");
    const aLike = /^a|^á/i.test(ending || "");
    if (eLike) {
      if (inf.endsWith("car")) return baseStem.slice(0, -1) + "qu";
      if (inf.endsWith("gar")) return baseStem.slice(0, -1) + "gu";
      if (inf.endsWith("zar")) return baseStem.slice(0, -1) + "c";
    }
    if (aLike) {
      if (inf.endsWith("ger") || inf.endsWith("gir")) return baseStem.slice(0, -1) + "j";
    }
  }

  return baseStem;
}

// ─── Noun gender / article / pluralisation ────────────────────────────────────

function pluralizeNoun(base) {
  const s = (base || "").trim();
  const low = s.toLowerCase();
  if (low.endsWith("z")) return s.slice(0, -1) + "ces";
  if (/[aeiouáéíóú]$/.test(low)) return s + "s";
  return s + "es";
}

function nounArticlesForClass(nounClass) {
  if (nounClass === "m_std")  return { sg: "el",  pl: "los" };
  if (nounClass === "f_std")  return { sg: "la",  pl: "las" };
  if (nounClass === "f_el_sg") return { sg: "el", pl: "las" };
  return null;
}

function isRegularNoun(w) {
  return !!(w && (w.noun_class === "m_std" || w.noun_class === "f_std"));
}

function getNounForms(w) {
  if (!w || w.pos !== "noun") return null;

  // Use w.src (canonical after mapWord); fall back to w.es for legacy data
  const wordBase = (w.src || w.es || "").trim();
  if (!wordBase) return null;

  if (w.noun_class === "irregular" && w.noun_override) {
    const base   = w.noun_override.base || wordBase;
    const plBase = w.noun_override.plural || pluralizeNoun(base);
    const aSg    = w.noun_override.article_sg || "el";
    const aPl    = w.noun_override.article_pl || "los";
    return { base, pluralBase: plBase, singular: `${aSg} ${base}`, plural: `${aPl} ${plBase}` };
  }

  const arts = nounArticlesForClass(w.noun_class);
  if (!arts) return null;

  const plBase = pluralizeNoun(wordBase);
  return { base: wordBase, pluralBase: plBase, singular: `${arts.sg} ${wordBase}`, plural: `${arts.pl} ${plBase}` };
}

function nounRequiresPluralForMastery(w) {
  return !!(w && w.pos === "noun" && !isRegularNoun(w));
}

// Pluralize a single English word token.
// Does NOT handle phrases — use _pluralizeEnglish() for that.
function _pluralizeToken(s) {
  const low = s.toLowerCase();
  const IRREGULARS = {
    "person":"people","man":"men","woman":"women","child":"children",
    "tooth":"teeth","foot":"feet","mouse":"mice","goose":"geese",
    "ox":"oxen","louse":"lice","die":"dice","leaf":"leaves",
    "knife":"knives","wife":"wives","life":"lives","wolf":"wolves",
    "half":"halves","shelf":"shelves","self":"selves","elf":"elves",
    "loaf":"loaves","scarf":"scarves","thief":"thieves",
  };
  if (IRREGULARS[low]) return IRREGULARS[low];
  if (/^(sheep|deer|fish|species|series|aircraft|moose|salmon|trout|swine|bison)$/i.test(low))
    return s;
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
    const head = s.slice(0, ofIdx);       // e.g. "sheet" or "member of parliament"
    const tail = s.slice(ofIdx);          // e.g. " of paper"
    const headWords = head.split(" ");
    headWords[headWords.length - 1] = _pluralizeToken(headWords[headWords.length - 1]);
    return headWords.join(" ") + tail;
  }

  return _pluralizeToken(s);
}

// Returns the display word (and optional gender label) for the noun typing prompt.
// Returns an object { word, gender } where gender may be null.
// - Plural:   word = English plural ("parties"), gender = null unless gender-paired
// - Singular: word = English singular, gender = "masculine"/"feminine" if gender-paired
function nounTypingHint(w, nf, target) {
  const isPlural = target === nf.plural;
  const article  = target.split(" ")[0]; // "el","la","los","las"
  const isMasc   = (article === "el" || article === "los");
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

// ─── Acceptable English answer building (Spanish-person-aware) ───────────────

function _pronounVariantsForPerson(person) {
  const p = (person || "").toString().toLowerCase();
  if (p === "yo")                                          return ["I"];
  if (p === "tú" || p === "tu")                           return ["you"];
  if (p === "nosotros" || p === "nosotras")                return ["we"];
  if (p === "vosotros" || p === "vosotras")                return ["you all"];
  if (p === "él" || p === "el" || p === "ella" || p === "usted" || p === "3s")
    return ["he", "she", "you (formal)"];
  if (p === "ellos" || p === "ellas" || p === "ustedes" || p === "3p")
    return ["they", "you all"];
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

function buildAcceptableEnglishAnswers(expectedEnglish, spanishPersonOrList) {
  const expected = (expectedEnglish || "").trim();
  const { body } = _splitPronounAndBody(expected);
  if (!body) return [expected];

  const variants = Array.isArray(spanishPersonOrList)
    ? (() => {
        const out = new Set();
        for (const p of spanishPersonOrList) {
          const v = _pronounVariantsForPerson(p);
          if (Array.isArray(v)) v.forEach(x => out.add(x));
        }
        return Array.from(out);
      })()
    : _pronounVariantsForPerson(spanishPersonOrList);

  if (!variants) return [expected];

  const out = new Set([expected]);
  for (const v of variants) {
    // If the pronoun variant has a parenthetical (e.g. "you (formal)"), move it after the verb body.
    // "you (formal)" + "speak" -> "you speak (formal)", not "you (formal) speak"
    const parenMatch = v.match(/^(.+?)\s*(\([^)]+\))$/);
    if (parenMatch) {
      out.add(`${parenMatch[1]} ${body} ${parenMatch[2]}`);
      out.add(`${parenMatch[1]} ${body}`); // also accept without the tag
    } else {
      out.add(`${v} ${body}`);
    }
  }
  return Array.from(out);
}

function applyYouAllFormalityTag(expectedEnglish, spanishPerson) {
  const e = (expectedEnglish || "").trim();
  const p = (spanishPerson || "").toString().toLowerCase();
  if (!e.toLowerCase().startsWith("you all ")) return e;
  if (p === "ustedes" || p === "ellos" || p === "ellas" || p === "3p")
    return "you all (formal) " + e.slice(8).trim();
  if (p === "vosotros" || p === "vosotras")
    return "you all (informal) " + e.slice(8).trim();
  return e;
}

function stripYouAllFormalityTag(s) {
  return (s || "").toString().toLowerCase()
    .replace(/\byou all\s*\((formal|informal)\)\s+/g, "you all ")
    .replace(/\s+/g, " ").trim();
}

// ─── "you all" ambiguity groups ───────────────────────────────────────────────
// When the English prompt contains one of these strings, the listed persons
// are all considered acceptable source-language answers.
const AMBIGUOUS_PERSON_GROUPS = [
  {
    englishContains: "you all",
    persons: ["vosotros", "vosotras", "ellos", "ellas", "ustedes", "3p"]
  }
];

// ─── Answer normalisation ─────────────────────────────────────────────────────

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeAnswer(s) {
  return stripDiacritics(String(s ?? "")).toLowerCase().trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?¿¡;:'"]/g, "");
}

// ─── Conjugation endings reference table (for the modal) ─────────────────────

function buildEndingsTableHTML(tense, showHeader) {
  const isImperativeAff = tense === "imperative_affirmative";
  const isImperativeNeg = tense === "imperative_negative";

  const TU = "t\u00fa"; // tú
  const EL = "\u00e9l"; // él

  const persons = (isImperativeAff || isImperativeNeg)
    ? [TU, "usted", "nosotros", "vosotros", "ustedes"]
    : ["yo", TU, EL, "nosotros", "vosotros", "ellos"];

  const personLabels = {
    "yo": "yo",
    [TU]: "t\u00fa",
    [EL]: "\u00e9l / ella / usted",
    "nosotros": "nosotros",
    "vosotros": "vosotros",
    "ellos": "ellos / ellas / ustedes",
    "usted": "usted",
    "ustedes": "ustedes"
  };

  const stemNotes = {
    present:                "Endings attach to the <strong>verb stem</strong> (infinitive minus -ar/-er/-ir).",
    preterite:              "Endings attach to the <strong>verb stem</strong>. -er and -ir share the same endings.",
    imperfect:              "Endings attach to the <strong>verb stem</strong>. -er and -ir share the same endings.",
    future:                 "Endings attach to the <strong>full infinitive</strong>.",
    conditional:            "Endings attach to the <strong>full infinitive</strong>.",
    present_subjunctive:    "Based on the <strong>yo present indicative stem</strong> (minus -o). -er/-ir share endings.",
    imperative_affirmative: "tú = él present; usted/ustedes/nosotros = present subj.; vosotros = infinitive -r +d.",
    imperative_negative:    "Use <strong>no</strong> + the <strong>present subjunctive</strong> form for all persons."
  };

  function getCell(group, person) {
    if (isImperativeAff) {
      return { [TU]: "él present", "usted": "pres. subj.", "nosotros": "pres. subj.", "vosotros": "inf. -r +d", "ustedes": "pres. subj." }[person] || "?";
    }
    if (isImperativeNeg) {
      const subjPersonMap = { [TU]: TU, "usted": EL, "nosotros": "nosotros", "vosotros": "vosotros", "ustedes": "ellos" };
      const sp = subjPersonMap[person] || person;
      const pat = CONJUGATION_PATTERNS[group]?.present_subjunctive;
      const ending = pat?.endings?.[sp];
      return ending !== undefined ? ("no + stem+" + (ending || "(none)")) : "no + subj.";
    }
    const pat = CONJUGATION_PATTERNS[group]?.[tense];
    if (!pat) return "-";
    const ending = pat.endings?.[person];
    return ending === undefined ? "-" : (ending === "" ? "(none)" : ending);
  }

  function getMatches(person) {
    if (isImperativeAff || isImperativeNeg) return { arEr: false, arIr: false, erIr: false };
    const arE = CONJUGATION_PATTERNS.ar?.[tense]?.endings?.[person];
    const erE = CONJUGATION_PATTERNS.er?.[tense]?.endings?.[person];
    const irE = CONJUGATION_PATTERNS.ir?.[tense]?.endings?.[person];
    return {
      arEr: arE !== undefined && erE !== undefined && arE === erE,
      arIr: arE !== undefined && irE !== undefined && arE === irE,
      erIr: erE !== undefined && irE !== undefined && erE === irE,
    };
  }

  const rows = persons.map(person => {
    const ar = getCell("ar", person);
    const er = getCell("er", person);
    const ir = getCell("ir", person);
    const m = getMatches(person);
    const arMark = (m.arEr || m.arIr) ? " *" : "";
    const erMark = (m.arEr || m.erIr) ? " *" : "";
    const irMark = (m.arIr || m.erIr) ? " *" : "";
    const arClass = (m.arEr || m.arIr) ? " same-as-other" : "";
    const erClass = (m.arEr || m.erIr) ? " same-as-other" : "";
    const irClass = (m.arIr || m.erIr) ? " same-as-er" : "";
    return `<tr>
      <td class="col-person">${personLabels[person] || person}</td>
      <td><span class="ending-pill ar${arClass}">${ar}${arMark}</span></td>
      <td><span class="ending-pill er${erClass}">${er}${erMark}</span></td>
      <td><span class="ending-pill ir${irClass}">${ir}${irMark}</span></td>
    </tr>`;
  }).join("");

  const hasSameNote = !isImperativeAff && !isImperativeNeg && persons.some(p => {
    const m = getMatches(p);
    return m.arEr || m.arIr || m.erIr;
  });

  let sameNote = "";
  if (hasSameNote) {
    const allThree = persons.some(p => { const m = getMatches(p); return m.arEr && m.arIr; });
    const erIrOnly = persons.some(p => { const m = getMatches(p); return m.erIr && !m.arEr && !m.arIr; });
    if (allThree && erIrOnly) sameNote = "* All three groups share some endings; -er and -ir also share additional endings";
    else if (allThree)        sameNote = "* All three groups share these endings";
    else if (erIrOnly)        sameNote = "* -er and -ir share this ending";
    else                      sameNote = "* These groups share this ending";
  }

  return `
    ${showHeader ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#333;">${formatTenseLabel(tense)}</h3>` : ""}
    <div class="endings-stem-note">${stemNotes[tense] || ""}</div>
    <table class="endings-table">
      <thead><tr>
        <th class="col-person">Person</th>
        <th><span class="ending-pill ar">-ar</span></th>
        <th><span class="ending-pill er">-er</span></th>
        <th><span class="ending-pill ir">-ir</span></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${hasSameNote ? `<div class="endings-same-note">${sameNote}</div>` : ""}
  `;
}

// ─── Verb infinitive detection (for isVerbInfinitiveWord fallback) ────────────
// Used by app_main when verbs.json hasn't loaded yet.
function looksLikeVerbInfinitive(w) {
  return (
    typeof (w.src || w.es) === "string" &&
    /(ar|er|ir)$/.test(w.src || w.es) &&
    typeof (w.tgt || w.en) === "string" &&
    /^to\s+/i.test(w.tgt || w.en)
  );
}

// ─── UI prompt strings ────────────────────────────────────────────────────────

const UI = {
  gameName:        "Spanish–English",
  sourceLabel:     "Spanish",
  targetLabel:     "English",
  errorTitle:      "Language Game – Startup Error",

  // Typing-mode prompt builders
  typeTargetFor:   (source) => `Type the English for: ${source}`,
  typeSourceFor:   (target) => `Type the Spanish for: ${target}`,
  verbTypeTarget:  (tenseLabel, source) => `(${tenseLabel}) Type the English for: ${source}`,
  verbTypeSource:  (tenseLabel, target) => `(${tenseLabel}) Type the Spanish for: ${target}`,

  // Article hint appended to noun prompts
  // nounHintPlural/nounHintSingular removed — prompt now shows article cue directly
};

// ─── Accent / special-character buttons ──────────────────────────────────────
// Each entry: { ch, label }  (label defaults to ch if omitted)
const ACCENT_BUTTONS = [
  { ch: "á" }, { ch: "é" }, { ch: "í" }, { ch: "ó" }, { ch: "ú" },
  { ch: "ü" }, { ch: "ñ" }, { ch: "¿" }, { ch: "¡" }
];

// ─── englishFor re-export ─────────────────────────────────────────────────────
// app_main uses this to generate English conjugation display labels.
export { englishFor };

// ─── Main LANG export ─────────────────────────────────────────────────────────

// ─── Conjugation engine (fully Spanish-specific) ──────────────────────────────
// Called by app_main.buildConjugationPool(). Returns all conjugated forms for one verb.
// Each form: { tense, person, src, tgt }

function buildVerbForms(verb, tgtFor) {
  const results = [];

  const patterns = CONJUGATION_PATTERNS[verb.group];
  if (!patterns) return results;

  const getRegularStem = (inf) => inf.slice(0, -2);

  const getTenseDef = (tense) => {
    const groupPatterns = CONJUGATION_PATTERNS[verb.group] || {};
    return groupPatterns[tense] || null;
  };

  const getYoPresent = () => {
    const baseInf = getBaseInfinitive(verb.infinitive);
    const stem = getRegularStem(baseInf);
    const def = getTenseDef("present");
    if (!def) return stem + "o";
    let form = stem + (def.endings?.yo ?? def.yo ?? "o");
    if (verb.overrides?.present?.yo) form = verb.overrides.present.yo;
    form = form.replace(/^(me|te|se|nos|os)\s+/i, "");
    return form;
  };

  const buildForm = (tense, person) => {
    const baseInf = getBaseInfinitive(verb.infinitive);
    const stem = getRegularStem(baseInf);
    const reflexive = verb.reflexive === true || isReflexiveInfinitive(verb.infinitive);
    const def = getTenseDef(tense);
    if (!def) return null;

    const directOverride = verb.overrides?.[tense]?.[person];
    if (directOverride) {
      let form = directOverride;
      if (reflexive) {
        const pro = getReflexivePronoun(person);
        const lower = form.toLowerCase();
        const already = ["me ", "te ", "se ", "nos ", "os "].some(p => lower.startsWith(p));
        if (!already && pro) form = `${pro} ${form}`;
      }
      return form;
    }

    let base;
    if (def.stemType === "stem") {
      base = stem;
    } else if (def.stemType === "infinitive") {
      base = (verb.stemOverrides?.[tense]) ? verb.stemOverrides[tense] : baseInf;
    } else if (def.stemType === "yo_present_minus_o") {
      const yo = getYoPresent();
      base = yo.endsWith("o") ? yo.slice(0, -1) : yo;
    } else if (def.stemType === "present_subjunctive_full") {
      const subj = buildForm("present_subjunctive", person);
      return subj ? `no ${subj}` : null;
    } else if (def.stemType === "imperative_affirmative") {
      const subjDef  = getTenseDef("present_subjunctive");
      const yoP      = getYoPresent();
      const subjStem = yoP.endsWith("o") ? yoP.slice(0, -1) : yoP;
      return LANG.buildImperativeAffirmative({
        verb, person,
        baseStem: stem, baseInf, subjStem, subjDef,
        buildFormFn: (t, p) => buildForm(t, p),
      });
    } else {
      base = stem;
    }

    const ending = def.endings?.[person];
    if (ending === undefined) return null;

    const adjustedStem = applyOrthography(base, baseInf, tense, person, ending);
    let form = adjustedStem + ending;

    if (reflexive) {
      const pro = getReflexivePronoun(person);
      const lower = form.toLowerCase();
      const already = ["me ", "te ", "se ", "nos ", "os "].some(p => lower.startsWith(p));
      if (!already && pro) form = `${pro} ${form}`;
    }

    return form;
  };

  for (const tense in patterns) {
    const def = patterns[tense];
    const endings = def.endings || def;

    for (const person in endings) {
      const srcForm = buildForm(tense, person);
      if (!srcForm) continue;

      const entry = { tense, person, src: srcForm, tgt: tgtFor(verb, tense, person) };
      results.push(entry);

      // Expand él->usted, ellos->ustedes when not explicitly in pattern
      const expandedPersons = LANG.expandConjugationPersons(person, endings);
      for (const ep of expandedPersons) {
        if (ep !== person) {
          results.push({ tense, person: ep, src: srcForm, tgt: tgtFor(verb, tense, ep) });
        }
      }
    }
  }

  return results;
}


export const LANG = {
  // Identity
  id:           "es",
  sourceLang:   "Spanish",
  targetLang:   "English",
  sourceKey:    "es",      // field name in words.json for the target language word
  targetKey:    "en",      // field name in words.json for the native language gloss
  sourceSynKey: "es_syn",
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
  infinitivePrefix:        "to ",  // English infinitives start with "to"
  buildAcceptableEnglishAnswers,
  applyYouAllFormalityTag,
  stripYouAllFormalityTag,
  splitPronounAndBody:     _splitPronounAndBody,
  pronounVariantsForPerson: _pronounVariantsForPerson,

  // UI text
  ui:            UI,
  accentButtons: ACCENT_BUTTONS,

  // Conjugation person expansion (adds usted/ustedes when patterns are keyed on él/ellos)
  expandConjugationPersons(person, endings) {
    const out = [person];
    const p = (person || "").toString();
    if (p === "él" && endings && !("usted" in endings)) out.push("usted");
    if (p === "ellos" && endings && !("ustedes" in endings)) out.push("ustedes");
    return out;
  },

    // Conjugation endings reference modal
  buildEndingsTableHTML,

  // Conjugation engine — builds all inflected forms for one verb
  buildVerbForms,

  // Language-specific imperative affirmative builder.
  // Called by app_main.buildForm() when stemType === "imperative_affirmative".
  // Receives: { verb, person, baseStem, baseInf, subjStem, subjDef, buildFormFn }
  // Returns the conjugated form string (without reflexive pronoun; app_main adds it).
  buildImperativeAffirmative({ verb, person, baseStem, baseInf, subjStem, subjDef, buildFormFn }) {
    if (person === "tú") {
      // tú imperative = él/ella present indicative
      const elForm = buildFormFn("present", "él") || (baseStem + (CONJUGATION_PATTERNS[verb.group]?.present?.endings?.["él"] ?? ""));
      return elForm.replace(/^(me|te|se|nos|os)\s+/i, "");
    } else if (person === "nosotros") {
      const subjEnding = subjDef?.endings?.["nosotros"] ?? "";
      return subjStem + subjEnding;
    } else if (person === "vosotros") {
      return baseInf.slice(0, -1) + "d";
    } else {
      // usted / ustedes / 3s / 3p → present subjunctive
      const subjEnding = subjDef?.endings?.[person] ?? "";
      return subjStem + subjEnding;
    }
  },

  // Reflexive pronoun prefixes — used by buildForm to detect if a form already has its pronoun.
  // Each entry is a string that, if the form starts with it (case-insensitive + space), means
  // the reflexive pronoun is already prepended and should not be added again.
  reflexivePronounPrefixes: ["me ", "te ", "se ", "nos ", "os "],

  // Feature flags
  hasTenses:              true,
  hasGrammaticalGender:   true,
  hasReflexiveVerbs:      true,
  verbGroupField:         "group",  // field in verbs.json that names the conjugation class

  // Migrate legacy progress payloads into the engine's canonical bundle shape:
  //  - legacy array of {es,...} -> { words: [ {src: es, ...} ], verbTenseProgress: null }
  //  - legacy {words:[{es,...}], verbTenseProgress} -> same but with src/tgt fields normalized
  // Map a raw words_XX.json entry into the engine's canonical shape.
  // Engine will attach progress fields separately.
  mapWord(raw) {
    // If already mapped (has src), pass through — handles both raw JSON and allWords items.
    if (raw.src != null) {
      return {
        src:     raw.src,
        tgt:     raw.tgt,
        src_syn: Array.isArray(raw.src_syn) ? raw.src_syn : [],
        tgt_syn: Array.isArray(raw.tgt_syn) ? raw.tgt_syn : [],
        level:   raw.level || "A1",
      };
    }
    // Raw words_es.json entry
    return {
      src:     raw.es,
      tgt:     raw.en,
      src_syn: Array.isArray(raw.es_syn) ? raw.es_syn : [],
      tgt_syn: Array.isArray(raw.en_syn) ? raw.en_syn : [],
      level:   raw.level || "A1",
    };
  },

  migrateProgressPayload(raw) {
    // If engine already exported bundle with src/tgt, keep as-is.
    const normalizeWord = (w) => {
      if (!w || typeof w !== "object") return w;
      // Prefer engine-native keys.
      if (w.src != null) return w;
      // Legacy Spanish progress uses `es`.
      if (w.es != null) return { ...w, src: w.es, tgt: w.en };
      return w;
    };

    if (Array.isArray(raw)) {
      return { words: raw.map(normalizeWord), verbTenseProgress: null };
    }

    if (raw && Array.isArray(raw.words)) {
      return {
        ...raw,
        words: raw.words.map(normalizeWord),
      };
    }

    return raw;
  },
};
