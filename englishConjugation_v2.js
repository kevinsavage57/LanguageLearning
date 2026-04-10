// englishConjugation_v2.js
// Robust English conjugation + prompt phrasing for SpanishGame3
//
// Exports:
//   - englishFor(verbObj, tenseKey, personKey)
//   - englishForAll(verbObj, tenseKey, personKey)   ← NEW: returns array of all slash-variant forms
//   - normalizeEnglishInfinitive(rawEnglish)   (helpful for debugging)
//
// Goals:
// - Avoid bad regularizations like "withdrawed"
// - Handle common irregular verbs (past + past participle + 3rd person)
// - Handle phrasal verbs ("to wake up")
// - Preserve clarification suffixes like "(state/location)" in output
// - Keep behavior compatible with your existing tense keys
// - Accept ALL slash-separated English alternates (e.g. hacer "to do/make" → "he did" AND "he made")

// Split a string by a separator, but do not split inside parentheses.
// Example: "raise (children/animals)/lift" split by "/" => ["raise (children/animals)", "lift"]
function splitOutsideParens(s, sepChar) {
  const out = [];
  let buf = "";
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);

    if (ch === sepChar && depth === 0) {
      out.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }

  const last = buf.trim();
  if (last) out.push(last);
  return out.filter(Boolean);
}

function normSpace(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

// Given a raw English entry from verbs.json / words.json, normalize it into a
// single "to ..." lemma we can conjugate.
// - If slashes exist, pick the best option.
// - Keep parenthetical clarifications.
export function normalizeEnglishInfinitive(rawEnglish) {
  const raw = normSpace(rawEnglish);
  if (!raw) return "";

  // If it's an array-ish string like "to do / to make", normalize spacing
  const options = splitOutsideParens(raw, "/").map(x => normSpace(x)).filter(Boolean);

  // Choose best option heuristically:
  // Prefer "to have ..." or "have ..." (fixes prior "haves available" class issues)
  // Prefer "to be ..." or "be ..."
  // Otherwise choose first.
  const score = (opt) => {
    const s = opt.toLowerCase();
    let sc = 0;
    if (s.startsWith("to have ") || s.startsWith("have ")) sc += 10;
    if (s.startsWith("to be ") || s.startsWith("be ")) sc += 9;
    // avoid bare modals if there are other options
    if (/\b(must|can|should|may|might)\b/.test(s) && !s.startsWith("to ")) sc -= 2;
    // prefer entries that look like infinitives
    if (s.startsWith("to ")) sc += 2;
    return sc;
  };

  let best = options[0];
  let bestScore = -1e9;
  for (const o of options) {
    const sc = score(o);
    if (sc > bestScore) {
      bestScore = sc;
      best = o;
    }
  }

  // Ensure it has "to " prefix if it's a bare verb phrase
  const b = normSpace(best);
  if (!b) return "";
  if (/^to\s+/i.test(b)) return b;
  // If it's clearly imperative-like ("open up") treat it as infinitive
  return "to " + b;
}

// Map Spanish person keys to English pronouns and grammatical person/number.
// Randomly pick one of he/she/you (formal) for 3s contexts where the person is ambiguous.
// Returns the full pronoun info object so grammatical agreement is correct per pronoun:
// "you" (formal) conjugates like 1st/2nd person (no -s), except "to be" -> "are".
function random3sInfo() {
  const r = Math.random();
  if (r < 0.333) return { pronoun: "he",  key: "3s", is3s: true,  plural: false, formalYou: false };
  if (r < 0.667) return { pronoun: "she", key: "3s", is3s: true,  plural: false, formalYou: false };
  return             { pronoun: "you", key: "3s", is3s: false, plural: false, formalYou: true  };
}

function personToPronoun(person) {
  const p = (person ?? "").toString().toLowerCase();

  if (p === "yo" || p === "i") return { pronoun: "I",       key: "i",     is3s: false, plural: false, formalYou: false };
  if (p === "tú" || p === "tu") return { pronoun: "you",    key: "you",   is3s: false, plural: false, formalYou: false, informalYou: true };
  if (p === "you") return         { pronoun: "you",          key: "you",   is3s: false, plural: false, formalYou: false, informalYou: true };
  if (p === "nosotros" || p === "nosotras" || p === "we") return { pronoun: "we", key: "we", is3s: false, plural: true, formalYou: false };
  if (p === "vosotros" || p === "vosotras" || p === "you_all" || p === "you all") return { pronoun: "you all", key: "youpl", is3s: false, plural: true, formalYou: false };

  // Ambiguous 3s persons: randomise he/she/you(formal) with correct grammatical agreement
  if (p === "3s" || p === "él" || p === "el" || p === "usted" || p === "lui" || p === "lei") {
    return random3sInfo();
  }
  // Explicit he/she/you(formal) pass-throughs preserve their value and grammatical agreement
  if (p === "he") return { pronoun: "he",  key: "3s", is3s: true,  plural: false, formalYou: false };
  if (p === "she") return { pronoun: "she", key: "3s", is3s: true,  plural: false, formalYou: false };
  if (p === "you (formal)") return { pronoun: "you", key: "3s", is3s: false, plural: false, formalYou: true };

  if (p === "ella") return { pronoun: "she", key: "3s", is3s: true,  plural: false, formalYou: false };
  if (p === "3p" || p === "they") return { pronoun: "they", key: "3p", is3s: false, plural: true, formalYou: false };
  if (p === "ellos") return { pronoun: "they", key: "3p", is3s: false, plural: true, formalYou: false };
  if (p === "ellas") return { pronoun: "they", key: "3p", is3s: false, plural: true, formalYou: false };
  if (p === "ustedes") return { pronoun: "you all", key: "youpl", is3s: false, plural: true, formalYou: false };

  // fallback
  return { pronoun: "they", key: "3p", is3s: false, plural: true, formalYou: false };
}

// ---------- English morphology helpers ----------

const IRREGULAR = {
  be: { past: "was", pastPlural: "were", pastParticiple: "been", third: "is", ing: "being" },
  have: { past: "had", pastParticiple: "had", third: "has" },
  do: { past: "did", pastParticiple: "done", third: "does", ing: "doing" },
  go: { past: "went", pastParticiple: "gone", third: "goes" },
  say: { past: "said", pastParticiple: "said" },
  make: { past: "made", pastParticiple: "made" },
  know: { past: "knew", pastParticiple: "known" },
  think: { past: "thought", pastParticiple: "thought" },
  take: { past: "took", pastParticiple: "taken" },
  come: { past: "came", pastParticiple: "come" },
  see: { past: "saw", pastParticiple: "seen" },
  get: { past: "got", pastParticiple: "gotten" }, // US default; acceptable in many contexts
  give: { past: "gave", pastParticiple: "given" },
  find: { past: "found", pastParticiple: "found" },
  tell: { past: "told", pastParticiple: "told" },
  become: { past: "became", pastParticiple: "become" },
  show: { past: "showed", pastParticiple: "shown" },
  leave: { past: "left", pastParticiple: "left" },
  feel: { past: "felt", pastParticiple: "felt" },
  feed: { past: "fed", pastParticiple: "fed" },
  lead: { past: "led", pastParticiple: "led" },
  lend: { past: "lent", pastParticiple: "lent" },
  sell: { past: "sold", pastParticiple: "sold" },
  sweep: { past: "swept", pastParticiple: "swept" },
  weep: { past: "wept", pastParticiple: "wept" },
  creep: { past: "crept", pastParticiple: "crept" },
  kneel: { past: "knelt", pastParticiple: "knelt" },
  deal: { past: "dealt", pastParticiple: "dealt" },
  seek: { past: "sought", pastParticiple: "sought" },
  dig: { past: "dug", pastParticiple: "dug" },
  hang: { past: "hung", pastParticiple: "hung" },

  put: { past: "put", pastParticiple: "put" },
  bring: { past: "brought", pastParticiple: "brought" },
  begin: { past: "began", pastParticiple: "begun" },
  keep: { past: "kept", pastParticiple: "kept" },
  hold: { past: "held", pastParticiple: "held" },
  write: { past: "wrote", pastParticiple: "written" },
  stand: { past: "stood", pastParticiple: "stood" },
  hear: { past: "heard", pastParticiple: "heard" },
  let: { past: "let", pastParticiple: "let" },
  mean: { past: "meant", pastParticiple: "meant" },
  set: { past: "set", pastParticiple: "set" },
  meet: { past: "met", pastParticiple: "met" },
  run: { past: "ran", pastParticiple: "run" },
  pay: { past: "paid", pastParticiple: "paid" },
  sit: { past: "sat", pastParticiple: "sat" },
  speak: { past: "spoke", pastParticiple: "spoken" },
  read: { past: "read", pastParticiple: "read" }, // same spelling
  grow: { past: "grew", pastParticiple: "grown" },
  lose: { past: "lost", pastParticiple: "lost" },
  fall: { past: "fell", pastParticiple: "fallen" },
  send: { past: "sent", pastParticiple: "sent" },
  build: { past: "built", pastParticiple: "built" },
  understand: { past: "understood", pastParticiple: "understood" },
  draw: { past: "drew", pastParticiple: "drawn" },
  break: { past: "broke", pastParticiple: "broken" },
  spend: { past: "spent", pastParticiple: "spent" },
  cut: { past: "cut", pastParticiple: "cut" },
  rise: { past: "rose", pastParticiple: "risen" },
  drive: { past: "drove", pastParticiple: "driven" },
  buy: { past: "bought", pastParticiple: "bought" },
  wear: { past: "wore", pastParticiple: "worn" },
  choose: { past: "chose", pastParticiple: "chosen" },
  fight: { past: "fought", pastParticiple: "fought" },
  forget: { past: "forgot", pastParticiple: "forgotten" },
  forgive: { past: "forgave", pastParticiple: "forgiven" },
  freeze: { past: "froze", pastParticiple: "frozen" },
  steal: { past: "stole", pastParticiple: "stolen" },
  swim: { past: "swam", pastParticiple: "swum" },
  ring: { past: "rang", pastParticiple: "rung" },
  sing: { past: "sang", pastParticiple: "sung" },
  sink: { past: "sank", pastParticiple: "sunk" },
  drink: { past: "drank", pastParticiple: "drunk" },
  eat: { past: "ate", pastParticiple: "eaten" },
  fly: { past: "flew", pastParticiple: "flown" },
  hide: { past: "hid", pastParticiple: "hidden" },
  ride: { past: "rode", pastParticiple: "ridden" },
  shake: { past: "shook", pastParticiple: "shaken" },
  shine: { past: "shone", pastParticiple: "shone" },
  shoot: { past: "shot", pastParticiple: "shot" },
  shut: { past: "shut", pastParticiple: "shut" },
  sleep: { past: "slept", pastParticiple: "slept" },
  slide: { past: "slid", pastParticiple: "slid" },
  stick: { past: "stuck", pastParticiple: "stuck" },
  strike: { past: "struck", pastParticiple: "struck" },
  teach: { past: "taught", pastParticiple: "taught" },
  throw: { past: "threw", pastParticiple: "thrown" },
  wake: { past: "woke", pastParticiple: "woken" },
  win: { past: "won", pastParticiple: "won" },
  withdraw: { past: "withdrew", pastParticiple: "withdrawn" },

  // -ing spelling irregulars
  lie: { past: "lay", pastParticiple: "lain", third: "lies", ing: "lying" },
  die: { past: "died", pastParticiple: "died", third: "dies", ing: "dying" },
  tie: { past: "tied", pastParticiple: "tied", third: "ties", ing: "tying" }
};


// Only double final 'r'/'l' for verbs that are commonly stressed on the final syllable in AmE,
// e.g., prefer -> preferred, occur -> occurred, control -> controlled.
// This avoids misspellings like "gatherred".
const STRESS_DOUBLING = new Set([
  "prefer","refer","infer","confer",
  "occur","recur",
  "transfer",
  "admit","permit","commit","omit","submit",
  "control","compel","propel"
]);


function vowelGroupCount(word) {
  const w = (word || "").toLowerCase();
  const m = w.match(/[aeiou]+/g);
  return m ? m.length : 0;
}

function isVowel(ch) {
  return /[aeiou]/i.test(ch);
}

function thirdPersonSingular(base) {
  const b = base.toLowerCase();
  if (IRREGULAR[b]?.third) return IRREGULAR[b].third;

  if (/(s|sh|ch|x|z|o)$/.test(b)) return base + "es";
  if (/[^aeiou]y$/.test(b)) return base.slice(0, -1) + "ies";
  return base + "s";
}

function pastTense(base, pronounInfo) {
  const b = base.toLowerCase();
  const irr = IRREGULAR[b];
  if (irr) {
    if (b === "be") {
      const pro = (pronounInfo?.pronoun ?? "").toLowerCase();
      if (pro === "i") return "was";
      if (pro === "you") return "were";
      return pronounInfo?.plural ? "were" : "was";
    }
    return irr.past;
  }
  return regularPast(base);
}

function pastParticiple(base) {
  const b = base.toLowerCase();
  const irr = IRREGULAR[b];
  if (irr) return irr.pastParticiple;
  return regularPast(base);
}

function presentParticiple(base) {
  const b = base.toLowerCase();
  const irr = IRREGULAR[b];
  if (irr?.ing) return irr.ing;

  // make -> making, take -> taking, write -> writing
  if (/ie$/.test(b)) return base.slice(0, -2) + "ying";
  if (/e$/.test(b) && !/(ee|oe|ye)$/.test(b)) return base.slice(0, -1) + "ing";

  // CVC doubling heuristic: stop->stopping, plan->planning, bar->barring
  if (b.length >= 3) {
    const c1 = b[b.length - 3], v = b[b.length - 2], c2 = b[b.length - 1];
    if (!isVowel(c1) && isVowel(v) && !isVowel(c2) && !/[wxy]/.test(c2)) {
      const vg = vowelGroupCount(b);
      const isMono = vg === 1; // monosyllabic: always double (bar->barring, stir->stirring)
      if (isMono || STRESS_DOUBLING.has(b)) {
        return base + c2 + "ing";
      }
      // Polysyllabic: only double if in STRESS_DOUBLING (final-stress like prefer->preferring)
      return base + "ing";
    }
  }
  return base + "ing";
}

function regularPast(base) {
  const b = base.toLowerCase();
  // like -> liked
  if (/e$/.test(b)) return base + "d";
  // carry -> carried
  if (/[^aeiou]y$/.test(b)) return base.slice(0, -1) + "ied";
  // stop -> stopped, bar -> barred (heuristic)
  if (b.length >= 3) {
    const c1 = b[b.length - 3], v = b[b.length - 2], c2 = b[b.length - 1];
    if (!isVowel(c1) && isVowel(v) && !isVowel(c2) && !/[wxy]/.test(c2)) {
      const vg = vowelGroupCount(b);
      const isMono = vg === 1; // monosyllabic: always double (bar->barred, stir->stirred)
      if (isMono || STRESS_DOUBLING.has(b)) {
        return base + c2 + "ed";
      }
      // Polysyllabic: only double if in STRESS_DOUBLING (final-stress like prefer->preferred)
      return base + "ed";
    }
  }
  return base + "ed";
}

// Parse an infinitive like:
//   "to be (state/location)" -> head="be", tail=" (state/location)"
//   "to wake up" -> head="wake", tail=" up"
function parseInfinitiveToHeadTail(englishInf) {
  const inf = normalizeEnglishInfinitive(englishInf);
  const s = normSpace(inf);
  if (!s) return { head: "", tail: "" };

  const noTo = s.replace(/^to\s+/i, "");
  const parts = noTo.split(" ");
  const head = parts[0] || "";
  const tail = noTo.slice(head.length); // preserves spaces + parentheses tail
  return { head, tail };
}

// Determine the English lemma list from a verb object.
function getVerbEnglishList(verbObj) {
  if (!verbObj) return [];
  if (Array.isArray(verbObj.english)) return verbObj.english;
  if (typeof verbObj.english === "string") return [verbObj.english];
  if (Array.isArray(verbObj.en)) return verbObj.en;
  if (typeof verbObj.en === "string") return [verbObj.en];
  return [];
}

// Build the conjugated main verb phrase (no subject, no "that", no "will", etc.)
function conjugateMainVerb(head, tail, tenseKey, personInfo) {
  const base = head;
  const t = (tenseKey ?? "").toString();

  if (!base) return "";

  // Imperatives: base form
  if (t === "imperative_affirmative") {
    return base + tail;
  }
  if (t === "imperative_negative") {
    // don't + base (special case: be -> don't be)
    return "don't " + base + tail;
  }

  if (t === "future") return "will " + base + tail;
  if (t === "conditional") return "would " + base + tail;

  if (t === "present_subjunctive") {
    // English subjunctive in "that ..." clauses typically uses base form
    return base + tail;
  }

  if (t === "imperfect") {
    // map imperfect -> past progressive
    const beForm = pastTense("be", personInfo); // was/were
    const ing = presentParticiple(base);
    return beForm + " " + ing + tail;
  }

  if (t === "preterite") {
    const past = pastTense(base, personInfo);
    return past + tail;
  }

  // default / present
  if (t === "present") {
    if (base.toLowerCase() === "be") {
      const pro = personInfo.pronoun.toLowerCase();
      if (pro === "i") return "am" + tail;
      if (personInfo.plural) return "are" + tail;
      return personInfo.is3s ? "is" + tail : "are" + tail;
    }
    if (personInfo.is3s) return thirdPersonSingular(base) + tail;
    return base + tail;
  }

  // Fallback: treat as present
  if (personInfo.is3s) return thirdPersonSingular(base) + tail;
  return base + tail;
}

// Append (formal) or (informal) tag to any result beginning with "you " (singular).
// This distinguishes tú/tu (informal) from usted/lei (formal) in the English output.
// Answer checking uses withOptionalParenthetical(), so the tag is display-only.
function applyYouTag(result, personInfo) {
  const r = (result || "").trim();
  if (!r.toLowerCase().startsWith("you ") && r.toLowerCase() !== "you") return r;
  // "you all" is vosotros/ustedes — no singular formality tag needed
  if (r.toLowerCase().startsWith("you all")) return r;
  if (personInfo.formalYou)   return r + " (formal)";
  if (personInfo.informalYou) return r + " (informal)";
  return r;
}

// ---------- Internal: build one conjugated phrase from a pre-parsed head/tail ----------

function _buildPhrase(head, tail, tenseKey, personInfo) {
  const t = (tenseKey ?? "").toString();
  if (t === "imperative_affirmative" || t === "imperative_negative") {
    return conjugateMainVerb(head, tail, t, personInfo);
  }
  if (t === "present_subjunctive") {
    const main = conjugateMainVerb(head, tail, t, personInfo);
    return applyYouTag("that " + personInfo.pronoun + " " + main, personInfo);
  }
  const main = conjugateMainVerb(head, tail, t, personInfo);
  return applyYouTag(personInfo.pronoun + " " + main, personInfo);
}

// Public API used by app.js
export function englishFor(verbObj, tenseKey, personKey) {
  const list = getVerbEnglishList(verbObj);
  const englishInf = list[0] ?? ""; // game uses first gloss as canonical
  const { head, tail } = parseInfinitiveToHeadTail(englishInf);
  const personInfo = personToPronoun(personKey);
  return _buildPhrase(head, tail, tenseKey, personInfo);
}

// Like englishFor(), but returns an array of ALL accepted conjugated forms —
// one per slash-separated English alternate in the verb's `en` / `english` field.
//
// Example: hacer  en="to do/make"  preterite  él  →  ["he did", "he made"]
// Example: hablar en="to speak"    preterite  yo  →  ["I spoke"]   (single-element array)
//
// Use this in buildForPerson() so that answers like "he made" are accepted for hizo.
export function englishForAll(verbObj, tenseKey, personKey) {
  const list = getVerbEnglishList(verbObj);
  const rawInf = list[0] ?? "";

  // Split the raw infinitive on slashes (outside parentheses) to get all alternates.
  const raw = normSpace(rawInf);
  const options = splitOutsideParens(raw, "/").map(x => normSpace(x)).filter(Boolean);

  const personInfo = personToPronoun(personKey);
  const results = new Set();

  for (let opt of options) {
    // Ensure each option has a "to " prefix before parsing head/tail.
    if (!/^to\s+/i.test(opt)) opt = "to " + opt;
    const { head, tail } = parseInfinitiveToHeadTail(opt);
    if (!head) continue;
    const phrase = _buildPhrase(head, tail, tenseKey, personInfo);
    if (phrase) results.add(phrase);
  }

  // Always fall back to at least the single englishFor result.
  if (results.size === 0) {
    const fallback = englishFor(verbObj, tenseKey, personKey);
    if (fallback) results.add(fallback);
  }

  return Array.from(results);
}


// Debug helper: quickly show the conjugated English phrase for each person for a tense.
export function debugEnglishConjugation(englishInfinitive, tenseKey) {
  const fakeVerb = { english: [englishInfinitive] };
  const persons = ["yo","tú","3s","nosotros","vosotros","3p"];
  const out = {};
  for (const p of persons) out[p] = englishFor(fakeVerb, tenseKey, p);
  return out;
}

// Debug helper: like debugEnglishConjugation but shows ALL slash-variant forms per person.
export function debugEnglishConjugationAll(englishInfinitive, tenseKey) {
  const fakeVerb = { english: [englishInfinitive] };
  const persons = ["yo","tú","3s","nosotros","vosotros","3p"];
  const out = {};
  for (const p of persons) out[p] = englishForAll(fakeVerb, tenseKey, p);
  return out;
}
