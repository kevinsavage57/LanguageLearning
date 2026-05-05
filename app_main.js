// app_main.js — language-agnostic game engine.
// Language config is loaded dynamically from lang_XX.js based on ?lang=XX in the URL.
// To add a new language: create lang_XX.js exporting the same LANG shape, add
// its data file as words_XX.json (verb entries carry conjugation metadata inline),
// and link via ?lang=XX.

const _langParam = new URLSearchParams(window.location.search).get("lang") || "es";
const { LANG } = await import(`./lang_${_langParam}.js`);

// Pull conjugation helpers out of LANG so existing code keeps working unchanged.
const CONJUGATION_PATTERNS = LANG.conjugationPatterns;
const englishFor           = LANG.englishFor;

let currentVerbTypingIsEsToEn = true;
let _mixedModeCurrentPick = null; // tracks which sub-mode mixed-mode selected

const conjugationAmbiguity = new Map(); // key `${tense}|${infinitive}|${es}` => Set(person)
const MASTERED_STREAK = 4;
const DECAY_DAYS = 7;
const INITIAL_POOL_SIZE = 25; // Starting number of unlocked words

// ── GitHub Gist sync — multi-profile with passwords ──────────────────────────
// One shared Gist holds all profiles: { "Alice": {hash, words, verbTenseProgress}, ... }
// Passwords are never stored — only a SHA-256 hash is kept in the Gist.
// Each device remembers the profile name in localStorage; password is only
// required when setting up on a new device or switching profiles.

const GIST_PROFILE_KEY = "gist_profile";
const GIST_FILENAME    = "progress.json";
const MAX_PROFILES     = 5;

// In-memory cache of the full profiles object from the Gist.
// Kept up to date so flushGistSave can write without an async read on page close.
let _lastKnownProfiles = null;

// Hardcoded shared credentials — token has gist scope only.
const HARDCODED_TOKEN   = "ghp_oIMH4bftLOTXKDg" + "dqYrp4efavT3vXI1TUGTv";
const HARDCODED_GIST_ID = "a9b0d9bbbffddf35567cdc1fc8401f9e";

function gistToken()    { return HARDCODED_TOKEN; }
function gistId()       { return HARDCODED_GIST_ID; }
function gistProfile()  { return localStorage.getItem(GIST_PROFILE_KEY) || ""; }
function gistConfigured() { return !!(gistToken() && gistId() && gistProfile()); }

// Hash a password with SHA-256 via the browser's built-in crypto API.
// Returns a hex string. Never leaves the device.
async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const buffer  = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Fetch the full profiles object from the Gist.
// Returns { profileName: {words, verbTenseProgress}, ... } or { error } or null.
async function fetchAllProfiles() {
  if (!gistToken() || !gistId()) return null;
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId()}`, {
      headers: {
        "Authorization": `token ${gistToken()}`,
        "Accept": "application/vnd.github+json"
      }
    });
    if (!res.ok) {
      const msg = res.status === 401 ? "HTTP 401 — token invalid or expired"
                : res.status === 404 ? "HTTP 404 — Gist ID not found"
                : `HTTP ${res.status}`;
      return { error: msg };
    }
    const json = await res.json();
    const content = json.files?.[GIST_FILENAME]?.content;
    if (!content || content.trim() === "{}") { _lastKnownProfiles = {}; return {}; }
    const parsed = JSON.parse(content);
    // Support upgrading from old single-profile format
    if (Array.isArray(parsed) || (parsed && Array.isArray(parsed.words))) {
      _lastKnownProfiles = {};
      return {};
    }
    _lastKnownProfiles = parsed;
    return parsed;
  } catch (e) {
    return { error: e.message };
  }
}

// Write the full profiles object back to the Gist.
async function writeAllProfiles(profiles) {
  if (!gistToken() || !gistId()) return;
  _lastKnownProfiles = profiles; // update cache before writing
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId()}`, {
      method: "PATCH",
      headers: {
        "Authorization": `token ${gistToken()}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: { [GIST_FILENAME]: { content: JSON.stringify(profiles) } }
      })
    });
    if (!res.ok) console.warn("Gist save failed:", res.status);
  } catch (e) {
    console.warn("Gist save error:", e);
  }
}

// Load this profile's progress bundle for the current language from the Gist.
async function loadFromGist() {
  if (!gistConfigured()) return null;
  const profiles = await fetchAllProfiles();
  if (!profiles || profiles.error) return profiles || null;
  const profile = profiles[gistProfile()];
  if (!profile) return { words: null, verbTenseProgress: null };
  // New format: profile[langId] holds per-language bundle
  const bundle = profile[LANG.id];
  if (!bundle) return { words: null, verbTenseProgress: null };
  return bundle;
}

// Save this profile's progress for the current language, preserving other languages and the hash.
async function saveToGist(bundle) {
  if (!gistConfigured()) return;
  const profiles = await fetchAllProfiles();
  const safe = (!profiles || profiles.error) ? {} : profiles;
  if (!safe[gistProfile()]) safe[gistProfile()] = {};
  // Preserve the hash — never overwrite it during a normal save
  const existingHash = safe[gistProfile()].hash;
  if (existingHash) safe[gistProfile()].hash = existingHash;
  // Store bundle under the current language id
  safe[gistProfile()][LANG.id] = bundle;
  await writeAllProfiles(safe);
}

// Debounced — waits 4 s after last save() before writing to GitHub.
let _gistSaveTimer = null;
function scheduleSaveToGist() {
  if (!gistConfigured()) return;
  clearTimeout(_gistSaveTimer);
  _gistSaveTimer = setTimeout(() => {
    saveToGist({
      words: slimProgress(allWords),
      verbTenseProgress: loadVerbTenseProgress() || null
    });
  }, 2000);
}

// Settings panel — profile name + password.
function showGistSettings() {
  const existing = document.getElementById("gistSettingsPanel");
  if (existing) { existing.remove(); return; }

  const panel = document.createElement("div");
  panel.id = "gistSettingsPanel";
  panel.style.cssText = `
    position:fixed; bottom:16px; right:16px; z-index:9999;
    background:#fff; border:1px solid #ccc; border-radius:8px;
    padding:16px; width:340px; box-shadow:0 4px 16px rgba(0,0,0,0.15);
    font:14px system-ui;
  `;
  panel.innerHTML = `
    <strong>Profile Setup</strong>
    <p style="margin:8px 0 4px;color:#555;font-size:12px;">
      Enter your name and password. On this device you'll only need to do this once.
    </p>
    <label style="display:block;margin-top:8px;">
      Your name<br>
      <input id="gistProfileInput" type="text" value="${gistProfile()}"
        placeholder="e.g. Alice"
        style="width:100%;box-sizing:border-box;margin-top:4px;padding:6px;
               border:1px solid #ccc;border-radius:4px;">
    </label>
    <label style="display:block;margin-top:8px;">
      Password<br>
      <input id="gistPasswordInput" type="password"
        placeholder="Choose or enter your password"
        style="width:100%;box-sizing:border-box;margin-top:4px;padding:6px;
               border:1px solid #ccc;border-radius:4px;">
    </label>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button id="gistSaveBtn"
        style="flex:1;padding:8px;background:#2da44e;color:#fff;
               border:none;border-radius:4px;cursor:pointer;">Connect</button>
      <button id="gistCancelBtn"
        style="flex:1;padding:8px;background:#eee;
               border:none;border-radius:4px;cursor:pointer;">Cancel</button>
    </div>
    <div style="margin-top:8px;">
      <label style="display:block;font-size:12px;color:#555;margin-bottom:4px;">
        Import progress file
      </label>
      <input id="gistImportFile" type="file" accept=".json"
        style="font-size:12px;width:100%;box-sizing:border-box;">
      <button id="gistImportBtn"
        style="width:100%;margin-top:4px;padding:8px;background:#2da44e;color:#fff;
               border:none;border-radius:4px;cursor:pointer;font-size:12px;">
        Import Progress File
      </button>
    </div>
    <div style="margin-top:8px;">
      <button id="gistDeleteBtn"
        style="width:100%;padding:8px;background:#fff;color:#c00;
               border:1px solid #c00;border-radius:4px;cursor:pointer;font-size:12px;">
        Delete this profile…
      </button>
    </div>
    <div id="gistStatus" style="margin-top:8px;font-size:12px;color:#555;"></div>
  `;
  document.body.appendChild(panel);

  document.getElementById("gistCancelBtn").onclick = () => panel.remove();

  document.getElementById("gistImportBtn").onclick = () => {
    const status = document.getElementById("gistStatus");
    const file = document.getElementById("gistImportFile").files[0];
    if (!file) { status.textContent = "Please choose a file first."; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = JSON.parse(reader.result);
        const importedWords = Array.isArray(raw) ? raw
          : (raw && Array.isArray(raw.words) ? raw.words : null);
        const importedVerbTenseProgress = (!Array.isArray(raw) && raw?.verbTenseProgress)
          ? raw.verbTenseProgress : null;
        if (!importedWords) throw new Error("Unrecognised file format.");
        const migrated = LANG.migrateProgressPayload
          ? LANG.migrateProgressPayload({ words: importedWords }).words
          : importedWords;
        allWords = mergeProgress(migrated, allWords);
        if (importedVerbTenseProgress) {
          try {
            saveVerbTenseProgress(importedVerbTenseProgress);
            ensureVerbTenseProgressInit();
          } catch (_) {}
        }
        save();
        buildConjugationPool();
        unlockVerbModes();
        startNextRound();
        updateStats();
        status.style.color = "green";
        status.textContent = "Progress imported!";
        await saveToGist({
          words: slimProgress(allWords),
          verbTenseProgress: loadVerbTenseProgress() || null
        });
        setTimeout(() => panel.remove(), 1000);
      } catch (e) {
        status.style.color = "#d00";
        status.textContent = "Could not read file: " + e.message;
      }
    };
    reader.readAsText(file);
  };

  document.getElementById("gistDeleteBtn").onclick = async () => {
    const profile  = document.getElementById("gistProfileInput").value.trim();
    const password = document.getElementById("gistPasswordInput").value;
    const status   = document.getElementById("gistStatus");

    if (!profile) { status.textContent = "Enter the profile name to delete."; return; }
    if (!password) { status.textContent = "Enter the profile password to confirm deletion."; return; }

    status.style.color = "#555";
    status.textContent = "Verifying…";

    const profiles = await fetchAllProfiles();
    if (!profiles || profiles.error) {
      status.style.color = "#d00";
      status.textContent = profiles?.error ? `Error: ${profiles.error}` : "Could not connect.";
      return;
    }

    const existing = profiles[profile];
    if (!existing) {
      status.style.color = "#d00";
      status.textContent = `Profile "${profile}" not found.`;
      return;
    }

    const hash = await hashPassword(password);
    if (existing.hash !== hash) {
      status.style.color = "#d00";
      status.textContent = "Incorrect password.";
      return;
    }

    if (!confirm(`Delete profile "${profile}"? This cannot be undone.`)) return;

    delete profiles[profile];
    await writeAllProfiles(profiles);

    // Clear this device's profile if it was the deleted one
    if (localStorage.getItem(GIST_PROFILE_KEY) === profile) {
      localStorage.removeItem(GIST_PROFILE_KEY);
      const btn = document.getElementById("gistSettingsBtn");
      if (btn) btn.textContent = "☁ Sync";
    }

    status.style.color = "green";
    status.textContent = `Profile "${profile}" deleted.`;
    setTimeout(() => panel.remove(), 1500);
  };
  document.getElementById("gistSaveBtn").onclick = async () => {
    const profile  = document.getElementById("gistProfileInput").value.trim();
    const password = document.getElementById("gistPasswordInput").value;
    const status   = document.getElementById("gistStatus");

    if (!profile) { status.textContent = "Please enter your name."; return; }
    if (!password) { status.textContent = "Please enter a password."; return; }
    if (profile.length > 30) { status.textContent = "Name must be 30 characters or less."; return; }

    status.textContent = "Connecting…";

    const profiles = await fetchAllProfiles();
    if (!profiles || profiles.error) {
      status.style.color = "#d00";
      status.textContent = profiles?.error
        ? `Could not connect: ${profiles.error}`
        : "Could not connect.";
      return;
    }

    const hash = await hashPassword(password);
    const existing = profiles[profile];

    if (existing) {
      // Returning user — check password
      if (existing.hash !== hash) {
        status.style.color = "#d00";
        status.textContent = "Incorrect password.";
        return;
      }
    } else {
      // New profile — enforce max profiles
      const otherNames = Object.keys(profiles);
      if (otherNames.length >= MAX_PROFILES) {
        status.style.color = "#d00";
        status.textContent = `Maximum of ${MAX_PROFILES} profiles reached. Existing: ${otherNames.join(", ")}`;
        return;
      }
    }

    // Password accepted — remember profile on this device
    localStorage.setItem(GIST_PROFILE_KEY, profile);
    status.style.color = "green";
    status.textContent = `Connected as "${profile}"! Loading your progress…`;

    // Support both new format (existing[LANG.id]) and old format (existing.words)
    const langBundle = existing?.[LANG.id] ?? (existing?.words ? existing : null);
    const hasProgress = langBundle && langBundle.words && langBundle.words.length > 0;
    if (existing && hasProgress) {
      // Returning user with actual progress — load it
      allWords = mergeProgress(langBundle.words, allWords);
      if (langBundle.verbTenseProgress) {
        try {
          saveVerbTenseProgress(langBundle.verbTenseProgress);
          ensureVerbTenseProgressInit();
        } catch (_) {}
      }
      buildConjugationPool();
      unlockVerbModes();
      startNextRound();
      updateStats();
      const btn = document.getElementById("gistSettingsBtn");
      if (btn) btn.textContent = `☁ ${profile}`;
      setTimeout(() => panel.remove(), 1500);
    } else {
      // New profile or profile with no progress yet — save hash and show welcome screen
      if (!profiles[profile]) profiles[profile] = {};
      profiles[profile].hash = hash;
      await writeAllProfiles(profiles);

      // Clear localStorage and reset all progress before showing the choice
      localStorage.removeItem(`progress_${LANG.id}`);
      localStorage.removeItem(verbTenseProgressKey());
      allWords.forEach(w => {
        w.unlocked = false;
        w.streak = 0;
        w.misses = 0;
        w.weight = ratingToWeight(w.rating);
        w.typing_streak = 0;
        w.typing_misses = 0;
        w.typing_weight = ratingToWeight(w.rating);
        w.noun_typing_singular_ok = false;
        w.noun_typing_plural_ok = false;
        w.quickStartUnlocked = false;
      });

      status.style.color = "green";
      status.textContent = `Profile "${profile}" created! Choose how to start…`;
      setTimeout(() => {
        panel.remove();
        addQuickStartButton();
      }, 800);
    }

  };
}

// Small button added to the controls bar.
function addGistButton() {
  const controls = document.querySelector(".controls");
  if (!controls) return;
  const btn = document.createElement("button");
  btn.id = "gistSettingsBtn";
  btn.title = "Profile & Sync settings";
  btn.textContent = gistConfigured() ? `☁ ${gistProfile()}` : "☁ Sync";
  btn.onclick = showGistSettings;
  controls.appendChild(btn);
}

// Map a word's rating (1–5, higher = more common/important) to its starting weight.
// Scale: 5→10, 4→8, 3→6, 2→2, 1→1
function ratingToWeight(rating) {
  const r = typeof rating === "number" ? rating : 3;
  if (r >= 5) return 10;
  if (r >= 4) return 8;
  if (r >= 3) return 6;
  if (r >= 2) return 2;
  return 1;
}


function showFatalErrorOverlay(err, context) {
  try {
    const msg = (err && (err.stack || err.message)) ? (err.stack || err.message) : String(err);
    const ctx = context ? `\n\nContext: ${context}` : "";
    let box = document.getElementById("fatalErrorOverlay");
    if (!box) {
      box = document.createElement("div");
      box.id = "fatalErrorOverlay";
      box.style.position = "fixed";
      box.style.left = "0";
      box.style.top = "0";
      box.style.right = "0";
      box.style.bottom = "0";
      box.style.background = "rgba(0,0,0,0.92)";
      box.style.color = "#fff";
      box.style.zIndex = "99999";
      box.style.padding = "16px";
      box.style.overflow = "auto";
      box.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
      box.style.whiteSpace = "pre-wrap";
      box.style.lineHeight = "1.3";
      const title = document.createElement("div");
      title.textContent = (LANG?.ui?.errorTitle) || "Language Game – Startup Error";
      title.style.fontSize = "18px";
      title.style.fontWeight = "700";
      title.style.marginBottom = "10px";
      const hint = document.createElement("div");
      hint.textContent = "Copy the text below and paste it into chat.";
      hint.style.opacity = "0.85";
      hint.style.marginBottom = "12px";
      const pre = document.createElement("div");
      pre.id = "fatalErrorText";
      const btn = document.createElement("button");
      btn.textContent = "Copy error";
      btn.style.padding = "8px 10px";
      btn.style.margin = "0 0 12px 0";
      btn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(pre.textContent);
          btn.textContent = "Copied!";
          setTimeout(() => (btn.textContent = "Copy error"), 1200);
        } catch (e) {
          btn.textContent = "Copy failed";
        }
      };
      box.appendChild(title);
      box.appendChild(hint);
      box.appendChild(btn);
      box.appendChild(pre);
      document.body.appendChild(box);
    }
    window.__APP_BOOTED__ = true;
const pre = document.getElementById("fatalErrorText");
    if (pre) pre.textContent = msg + ctx;
  } catch (_) {}
}

window.addEventListener("error", (e) => {
  showFatalErrorOverlay(e.error || e.message, "window.error");
});

window.addEventListener("unhandledrejection", (e) => {
  showFatalErrorOverlay(e.reason, "unhandledrejection");
});

const sourceCol = document.getElementById("sourceCol");
const targetCol = document.getElementById("targetCol");
const stats = document.getElementById("stats");
const mastery = document.getElementById("mastery");
// Export and import buttons removed from UI — Gist sync handles progress backup.
// Kept as stubs so references elsewhere don't crash.
const exportButton = { onclick: null };
const importInput  = { onchange: null };
const typingArea = document.getElementById("typingArea");
const promptDiv = document.getElementById("prompt");
const translationInput = document.getElementById("translationInput");
const accentButtons = document.getElementById("accentButtons");
const submitTranslation = document.getElementById("submitTranslation");
const feedbackDiv = document.getElementById("feedback");
const continueBtn = document.getElementById("continueBtn");
const modeSelect = document.getElementById("mode");

function updateFilterVisibility() {
  const mode = (modeSelect && modeSelect.value ? String(modeSelect.value) : "").toLowerCase();
  const isVerbMode = (mode === "verb-match" || mode === "verb-type" || mode === "verb-transform");

  const levelEl = document.getElementById("level");
  if (!levelEl) return;

  const verbsOpt = levelEl.querySelector('option[value="verbs"]');
  if (!verbsOpt) return;

  verbsOpt.disabled = isVerbMode;
  verbsOpt.hidden = isVerbMode;

  // If it was previously selected, force back to "all" (without dispatching change events).
  if (isVerbMode && levelEl.value === "verbs") levelEl.value = "all";

  updateEndingsButtonVisibility();
}






const levelSelect = document.getElementById("level"); // New: Reference to level selector

const ACTIVE_POOL_SIZE = 25;

// =========================
// VERB TENSE UNLOCKING
// =========================
const TENSE_UNLOCK_THRESHOLD = 10;

// Order from easiest -> harder (adjust anytime)
const verbTenseProgressKey = () => `verbTenseProgress:${LANG.id}:v1`;

// We track progress per tense + person, globally (not per-verb)
function loadVerbTenseProgress() {
  try {
    const raw = localStorage.getItem(verbTenseProgressKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveVerbTenseProgress(p) {
  localStorage.setItem(verbTenseProgressKey(), JSON.stringify(p));
}



// Canonicalize tense keys for progress tracking and UI. Keep the game-generation tense keys compatible
// with existing conjugation patterns (we bucket imperative variants to "imperative").


function ensureVerbTenseProgressInit() {
  let p = loadVerbTenseProgress();

  // If an existing progress object is present, migrate/canonicalize it.
  if (p && Array.isArray(p.unlockedTenses) && p.mastery) {
    // Canonicalize unlocked tense keys
    p.unlockedTenses = p.unlockedTenses.map(LANG.canonicalTenseKey);
    p.unlockedTenses = p.unlockedTenses.filter((t, i) => p.unlockedTenses.indexOf(t) === i);

    // Migrate mastery keys (e.g., legacy "imperative" -> "imperative_affirmative")
    const newMastery = {};
    Object.keys(p.mastery || {}).forEach(k => {
      const ck = LANG.canonicalTenseKey(k);
      newMastery[ck] = newMastery[ck] || {};
      const bucket = p.mastery[k] || {};
      Object.keys(bucket).forEach(person => {
        newMastery[ck][person] = Math.max(newMastery[ck][person] ?? 0, bucket[person] ?? 0);
      });
    });
    p.mastery = newMastery;

    // Ensure all known tenses/persons exist
    LANG.tenseOrder.forEach(t => {
      const ct = LANG.canonicalTenseKey(t);
      p.mastery[ct] = p.mastery[ct] || {};
      LANG.requiredPersonsForTense(ct).forEach(person => {
        if (p.mastery[ct][person] == null) p.mastery[ct][person] = 0;
      });
    });

    // Ensure at least present is unlocked
    if (!p.unlockedTenses.includes(LANG.tenseOrder[0])) p.unlockedTenses.unshift(LANG.tenseOrder[0]);

    saveVerbTenseProgress(p);
    return p;
  }

  // Fresh progress object
  p = {
    unlockedTenses: [LANG.tenseOrder[0]], // start with first tense
    mastery: {}
  };

  // initialize counts for all known tenses/persons (keeps it systematic + predictable)
  LANG.tenseOrder.forEach(t => {
    const ct = LANG.canonicalTenseKey(t);
    p.mastery[ct] = {};
    LANG.requiredPersonsForTense(ct).forEach(person => {
      p.mastery[ct][person] = 0;
    });
  });

  saveVerbTenseProgress(p);
  return p;
}


function isTenseUnlocked(tense) {
  const p = ensureVerbTenseProgressInit();
  return p.unlockedTenses.includes(tense);
}

function getUnlockedTenses() {
  // Canonicalize stored keys for safety across versions
  const p = ensureVerbTenseProgressInit();
  let unlocked = Array.isArray(p.unlockedTenses) ? p.unlockedTenses.slice() : [];

  unlocked = unlocked.map(LANG.canonicalTenseKey);

  // de-dup while preserving order
  unlocked = unlocked.filter((t, i) => unlocked.indexOf(t) === i);

  // Write back if it changed (helps keep UI/selector consistent)
  if (JSON.stringify(unlocked) !== JSON.stringify(p.unlockedTenses || [])) {
    p.unlockedTenses = unlocked;
    saveVerbTenseProgress(p);
  }

  return unlocked;
}


function isTenseMastered(tense) {
  tense = LANG.canonicalTenseKey(tense);
  const p = ensureVerbTenseProgressInit();
  const req = LANG.requiredPersonsForTense(tense);
  return req.every(person => (p.mastery?.[tense]?.[person] ?? 0) >= TENSE_UNLOCK_THRESHOLD);
}

function unlockNextTenseIfReady(currentTense) {
  // Unlock the next tense in LANG.tenseOrder when currentTense is mastered
  if (!currentTense) return null;
  if (!isTenseMastered(currentTense)) return null;

  const idx = LANG.tenseOrder.indexOf(currentTense);
  if (idx === -1) return null;

  const next = LANG.tenseOrder[idx + 1];
  if (!next) return null;

  const p = ensureVerbTenseProgressInit();
  if (!p.unlockedTenses.includes(next)) {
    p.unlockedTenses.push(next);
    saveVerbTenseProgress(p);
    refreshTenseSelector();
    return next;
  }
  return null;
}

function recordVerbTenseCorrect(tense, person) {
  tense = mapTenseForProgress(tense);
tense = LANG.canonicalTenseKey(tense);
  if (!tense || !person) return;
  const canon = LANG.canonicalPerson(person);
  const p = ensureVerbTenseProgressInit();

  // ignore persons not required for this tense (e.g., "yo" in imperative)
  const req = LANG.requiredPersonsForTense(tense);
  if (!req.includes(canon)) return;

  if (!p.mastery[tense]) p.mastery[tense] = {};
  const cur = p.mastery[tense][canon] ?? 0;
  p.mastery[tense][canon] = Math.min(TENSE_UNLOCK_THRESHOLD, cur + 1);

  saveVerbTenseProgress(p);

  // If this mastery completes the tense, unlock the next one
  const newlyUnlocked = unlockNextTenseIfReady(tense);
  if (newlyUnlocked) {
    // lightweight notification
    if (feedbackDiv) {
      feedbackDiv.textContent = `🎉 New tense unlocked: ${LANG.formatTenseLabel(newlyUnlocked)}!`;
      feedbackDiv.style.color = "green";
    } else {
      alert(`New tense unlocked: ${LANG.formatTenseLabel(newlyUnlocked)}!`);
    }
  }
}

function getVerbTenseCountsSummary() {
  const p = ensureVerbTenseProgressInit();
  const out = {};
  for (const t of LANG.tenseOrder) {
    out[t] = {};
    for (const person of LANG.requiredPersonsForTense(t)) {
      out[t][person] = p.mastery?.[t]?.[person] ?? 0;
    }
  }
  return out;
}

// -------- UI: Tense selector (created dynamically so no HTML changes required) --------
let tenseSelect = null;


function mapTenseForEngine(tenseKey) {
  const t = (tenseKey || "").toString().trim().toLowerCase();
  // ConjugationPatterns typically uses a single "imperative" key.
  if (t.startsWith("imperative")) return "imperative";
  return t;
}

function mapTenseForProgress(tenseKey) {
  const t = (tenseKey || "").toString().trim().toLowerCase();
  // Back-compat: older data sometimes used plain "imperative".
  // Treat it as Imperative (Affirmative) for progress/unlocks, but keep split keys intact.
  if (t === "imperative") return "imperative_affirmative";
  return t;
}


function setupTenseSelector() {
  // Mount into a dedicated slot if present; otherwise fall back to the controls row
  const slot = document.getElementById("tenseControlSlot");
  const controls = document.querySelector(".controls") || document.body;
  const mount = slot || controls;
  if (!mount) return;

  // Avoid duplicating if hot-reloaded etc.
  if (document.getElementById("tenseSelect")) {
    tenseSelect = document.getElementById("tenseSelect");
    refreshTenseSelector();
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "control";

  const label = document.createElement("label");
  label.textContent = "Tense:";
  label.htmlFor = "tenseSelect";
  label.style.marginRight = "6px";

  tenseSelect = document.createElement("select");
  tenseSelect.id = "tenseSelect";

  wrap.appendChild(label);
  wrap.appendChild(tenseSelect);

  // Insert right after the level selector if present; otherwise at end
  // If there's a slot, place it there; otherwise insert after Level selector if possible.
  if (slot) {
    slot.innerHTML = "";
    slot.appendChild(wrap);
  } else if (levelSelect && levelSelect.parentElement === controls) {
    controls.insertBefore(wrap, levelSelect.nextSibling);
  } else {
    controls.appendChild(wrap);
  }

  tenseSelect.onchange = () => {
    // re-route only if we're in a verb mode
    const mode = modeSelect?.value;
    if (mode === "verb-match")      startVerbMatching();
    if (mode === "verb-type")       startVerbTyping();
    if (mode === "verb-transform")  startVerbTransforming();
  };

  refreshTenseSelector();
  updateTenseSelectorVisibility();
}

function refreshTenseSelector() {
  if (!tenseSelect) return;
  let unlocked = getUnlockedTenses().map(mapTenseForEngine);
  unlocked = unlocked.filter((t,i,a)=>a.indexOf(t)===i);
const current = tenseSelect.value || (unlocked[0] ?? LANG.tenseOrder[0]);
  tenseSelect.innerHTML = "";

  // Only show "Mixed" once there's something to mix (2+ unlocked tenses).
  if (unlocked.length > 1) {
    const optMixed = document.createElement("option");
    optMixed.value = "mixed";
    optMixed.textContent = "Mixed (Unlocked)";
    tenseSelect.appendChild(optMixed);
  }

  unlocked.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = LANG.formatTenseLabel(t);
    tenseSelect.appendChild(opt);
  });

  const valid = [...unlocked];
  if (unlocked.length > 1) valid.unshift("mixed");

  // Keep selection if possible; otherwise default to the first unlocked tense.
  tenseSelect.value = valid.includes(current) ? current : (unlocked[0] ?? LANG.tenseOrder[0]);
}

function updateTenseSelectorVisibility() {
  const mode = modeSelect?.value;
  const show = mode === "verb-match" || mode === "verb-type" || mode === "verb-transform"
    || _mixedModeCurrentPick === "verb-match" || _mixedModeCurrentPick === "verb-type";

  // Always update the button regardless of tenseSelect state
  const btn = document.getElementById("showEndingsBtn");
  if (btn) btn.style.display = show ? "" : "none";

  // Tense selector wrapper visibility
  if (!tenseSelect) return;
  const wrapper = tenseSelect.closest(".control") || tenseSelect.parentElement;
  if (wrapper) wrapper.style.display = show ? "" : "none";
}

// ── Endings reference modal ──────────────────────────────────────────────────

function ensureEndingsUIElements() {
  // Create the button + modal elements if they are missing from the HTML.
  // Button is placed contextually near the active answer UI (typing box or matching columns).
  let btn = document.getElementById("showEndingsBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "showEndingsBtn";
    btn.type = "button";
    btn.textContent = "📊 Conjugation tables";

    // Base styling; actual placement is handled by placeEndingsButton().
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "10px";
    btn.style.cursor = "pointer";
    btn.style.marginLeft = "8px";
    document.body.appendChild(btn);
  }

  let modal = document.getElementById("endingsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "endingsModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card" style="background:#fff; color:#111; max-width:900px; width:92vw; max-height:85vh; overflow:auto; padding:16px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.25);">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div id="endingsTitle" style="font-size:18px; font-weight:700; margin-bottom:4px;"></div>
            <div id="endingsSubtitle" style="font-size:13px; opacity:.8;"></div>
          </div>
          <button id="endingsClose" type="button" style="font-size:16px; line-height:1; padding:6px 10px; border-radius:8px;">✕</button>
        </div>
        <div id="endingsBody" style="margin-top:12px;"></div>
      </div>
    `;

    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.display = "none";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "18px";
    modal.style.background = "rgba(0,0,0,.55)";
    modal.style.zIndex = "10000";

    document.body.appendChild(modal);
  }

  return { btn, modal };
}

function placeEndingsButton() {
  const btn = document.getElementById("showEndingsBtn");
  if (!btn) return;

  // Place button below the game area
  const gameArea = document.querySelector(".gameArea");
  if (gameArea && btn.parentElement !== gameArea) {
    gameArea.appendChild(btn);
  } else if (!btn.parentElement) {
    document.body.appendChild(btn);
  }

  // Inline placement — not fixed
  btn.style.position = "";
  btn.style.top = "";
  btn.style.right = "";
  btn.style.zIndex = "";
  btn.style.alignItems = "center";
  btn.style.gap = "8px";
  btn.style.padding = "10px 14px";
  btn.style.borderRadius = "12px";
  btn.style.border = "2px solid #111";
  btn.style.boxShadow = "0 4px 12px rgba(0,0,0,.15)";
  btn.style.fontWeight = "800";
  btn.style.fontSize = "14px";
  btn.style.letterSpacing = ".2px";
  btn.style.cursor = "pointer";
  btn.style.marginTop = "16px";
  btn.style.background = "#ffd54a";
  btn.style.color = "#111";

  // Only show for verb modes (including when mixed-mode picks a verb sub-mode)
  const mode = (modeSelect && modeSelect.value) ? modeSelect.value : "";
  const isVerbMode = mode === "verb-match" || mode === "verb-type" || mode === "verb-transform"
    || _mixedModeCurrentPick === "verb-match" || _mixedModeCurrentPick === "verb-type";
  btn.style.display = isVerbMode ? "inline-flex" : "none";
}




function updateEndingsButtonVisibility() {
  const btn = document.getElementById("showEndingsBtn");
  if (!btn) return;

  const mode = (modeSelect && modeSelect.value ? String(modeSelect.value) : "").toLowerCase();
  const isVerbMode = (mode === "verb-match" || mode === "verb-type" || mode === "verb-transform")
    || (_mixedModeCurrentPick === "verb-match" || _mixedModeCurrentPick === "verb-type");

  btn.style.display = isVerbMode ? "inline-block" : "none";
}


function setupEndingsModal() {
  const { btn, modal } = ensureEndingsUIElements();
  placeEndingsButton();
  const closeBtn = document.getElementById("endingsClose");

  const open = () => {
    populateEndingsModal();
    modal.classList.add("open");
    modal.style.display = "flex";
  };
  const close = () => {
    modal.classList.remove("open");
    modal.style.display = "none";
  };

  btn.onclick = open;
  if (closeBtn) closeBtn.onclick = close;

  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  updateEndingsButtonVisibility();
}


function populateEndingsModal() {
  const rawTense = tenseSelect ? tenseSelect.value : LANG.tenseOrder[0];
  const isMixed = rawTense === "mixed";

  const titleEl = document.getElementById("endingsTitle");
  const subtitleEl = document.getElementById("endingsSubtitle");
  const bodyEl = document.getElementById("endingsBody");
  if (!bodyEl) return;

  const tensesToShow = isMixed
    ? getUnlockedTenses().map(LANG.canonicalTenseKey).filter((t,i,a) => a.indexOf(t)===i)
    : [LANG.canonicalTenseKey(rawTense)];

  titleEl.textContent = isMixed
    ? "Conjugation Endings — Mixed (All Unlocked)"
    : `Conjugation Endings — ${LANG.formatTenseLabel(LANG.canonicalTenseKey(rawTense))}`;

  subtitleEl.textContent = "Regular verb endings only. Irregular verbs may differ.";
  bodyEl.innerHTML = tensesToShow.map(t => LANG.buildEndingsTableHTML(t, tensesToShow.length > 1)).join("");
}


try { setupTenseSelector(); } catch (e) { showFatalErrorOverlay(e, "setupTenseSelector()"); }
try { setupEndingsModal(); } catch(e) { console.error("setupEndingsModal failed", e); }
// ── Irregular verb conjugation panel ─────────────────────────────────────────
// Shown below the feedback area after any verb typing/matching answer when the
// verb has truly-irregular tags (not just orthographic spelling changes).

const _ORTHO_TAGS = new Set(["z-c","c-qu","g-gu","gu-g","car","zar","gar",
                              "c-ch","g-gh","sc-sca","ci-c","gi-g"]);

function isTrulyIrregularVerb(verbWord) {
  // For weighting purposes: irregular = has irregularity in present indicative
  return verbWord && (verbWord.irregularTags ?? []).includes("present-irreg");
}

function isIrregularInTense(verbWord, tense) {
  // For table display: irregular = has actual overrides for the specific tense
  if (!verbWord) return false;
  const canon = tense ? (LANG.canonicalTenseKey ? LANG.canonicalTenseKey(tense) : tense) : "present";
  // Map canonical tense keys to override keys used in the data
  const overrideKey = {
    "present":               "present",
    "preterite":             "preterite",
    "imperfect":             "imperfect",
    "future":                "future",
    "conditional":           "conditional",
    "present_perfect":       "present_perfect",
    "present_subjunctive":   "present_subjunctive",
    "imperative_affirmative":"imperative_affirmative",
    "imperative_negative":   "imperative_negative",
    "passato_prossimo":      "passato_prossimo",
    "imperfetto":            "imperfetto",
    "futuro":                "futuro",
    "condizionale":          "condizionale",
    "congiuntivo_presente":  "congiuntivo_presente",
    "imperativo":            "imperativo",
  }[canon] ?? canon;
  const ov = (verbWord.overrides ?? {})[overrideKey] ?? {};
  return Object.keys(ov).length > 0;
}

function buildIrregularVerbTableHTML(verbObj, tenseFilter) {
  // Generate all forms using the conjugation engine
  const forms = LANG.buildVerbForms(verbObj, () => "");
  if (!Array.isArray(forms) || forms.length === 0) return "";

  // Group by tense
  const byTense = {};
  for (const f of forms) {
    const t = LANG.canonicalTenseKey(f.tense);
    if (!byTense[t]) byTense[t] = {};
    // Canonical person key -> form (first one wins for duplicates like usted=él)
    const canon = LANG.canonicalPerson(f.person);
    if (!byTense[t][canon]) byTense[t][canon] = f.src;
  }

  // Only show the tense of the current prompt (canonicalised), if provided
  const tensesToShow = tenseFilter
    ? [LANG.canonicalTenseKey(tenseFilter)].filter(t => byTense[t])
    : getUnlockedTenses().map(LANG.canonicalTenseKey).filter((t,i,a) => a.indexOf(t) === i);

  let html = "";
  for (const tenseKey of tensesToShow) {
    const tForms = byTense[tenseKey];
    if (!tForms) continue;

    // Bold a form if it differs from what the regular conjugation formula produces.
    // For tenses where we can't compute a regular form (imperatives, compounds),
    // fall back to bolding any person that has an explicit override.
    const isItalian = verbObj.group === "are" || verbObj.group === "ere" ||
                      verbObj.group === "ire"  || verbObj.group === "ire_isc";
    // requiredPersonsForTense returns canonical keys "3s"/"3p"; map to the right
    // key for each language's endings table.
    const _endingKey = p => p === "3s" ? (isItalian ? "3s" : "él")
                          : p === "3p" ? (isItalian ? "3p" : "ellos")
                          : p;
    const _reflexKey  = p => p === "3s" ? "él" : p === "3p" ? "ellos" : p;
    const _reflexPros = { yo:"me", tú:"te", él:"se", nosotros:"nos", vosotros:"os", ellos:"se" };

    const _regularEndings = {
      // ── Spanish ────────────────────────────────────────────────────────────
      ar: {
        present:              { yo:"o",   tú:"as",   él:"a",   nosotros:"amos",   vosotros:"áis",    ellos:"an"    },
        preterite:            { yo:"é",   tú:"aste",  él:"ó",   nosotros:"amos",   vosotros:"asteis", ellos:"aron"  },
        imperfect:            { yo:"aba", tú:"abas",  él:"aba", nosotros:"ábamos", vosotros:"abais",  ellos:"aban"  },
        future:               { yo:"é",   tú:"ás",    él:"á",   nosotros:"emos",   vosotros:"éis",    ellos:"án"    },
        conditional:          { yo:"ía",  tú:"ías",   él:"ía",  nosotros:"íamos",  vosotros:"íais",   ellos:"ían"   },
        present_subjunctive:  { yo:"e",   tú:"es",    él:"e",   nosotros:"emos",   vosotros:"éis",    ellos:"en"    },
      },
      er: {
        present:              { yo:"o",   tú:"es",   él:"e",   nosotros:"emos",   vosotros:"éis",    ellos:"en"    },
        preterite:            { yo:"í",   tú:"iste",  él:"ió",  nosotros:"imos",   vosotros:"isteis", ellos:"ieron" },
        imperfect:            { yo:"ía",  tú:"ías",   él:"ía",  nosotros:"íamos",  vosotros:"íais",   ellos:"ían"   },
        future:               { yo:"é",   tú:"ás",    él:"á",   nosotros:"emos",   vosotros:"éis",    ellos:"án"    },
        conditional:          { yo:"ía",  tú:"ías",   él:"ía",  nosotros:"íamos",  vosotros:"íais",   ellos:"ían"   },
        present_subjunctive:  { yo:"a",   tú:"as",    él:"a",   nosotros:"amos",   vosotros:"áis",    ellos:"an"    },
      },
      ir: {
        present:              { yo:"o",   tú:"es",   él:"e",   nosotros:"imos",   vosotros:"ís",     ellos:"en"    },
        preterite:            { yo:"í",   tú:"iste",  él:"ió",  nosotros:"imos",   vosotros:"isteis", ellos:"ieron" },
        imperfect:            { yo:"ía",  tú:"ías",   él:"ía",  nosotros:"íamos",  vosotros:"íais",   ellos:"ían"   },
        future:               { yo:"é",   tú:"ás",    él:"á",   nosotros:"emos",   vosotros:"éis",    ellos:"án"    },
        conditional:          { yo:"ía",  tú:"ías",   él:"ía",  nosotros:"íamos",  vosotros:"íais",   ellos:"ían"   },
        present_subjunctive:  { yo:"a",   tú:"as",    él:"a",   nosotros:"amos",   vosotros:"áis",    ellos:"an"    },
      },
      // ── Italian ────────────────────────────────────────────────────────────
      // Stem = infinitive minus 3-char ending (-are/-ere/-ire).
      // futuro/condizionale endings include the connecting vowel so the same
      // stem formula works (e.g. "parl" + "erò" = "parlerò").
      are: {
        present:              { io:"o",    tu:"i",      "3s":"a",      noi:"iamo",  voi:"ate",   "3p":"ano"       },
        imperfetto:           { io:"avo",  tu:"avi",    "3s":"ava",    noi:"avamo", voi:"avate", "3p":"avano"     },
        futuro:               { io:"erò",  tu:"erai",   "3s":"erà",    noi:"eremo", voi:"erete", "3p":"eranno"    },
        condizionale:         { io:"erei", tu:"eresti", "3s":"erebbe", noi:"eremmo",voi:"ereste","3p":"erebbero"  },
        congiuntivo_presente: { io:"i",    tu:"i",      "3s":"i",      noi:"iamo",  voi:"iate",  "3p":"ino"       },
      },
      ere: {
        present:              { io:"o",    tu:"i",      "3s":"e",      noi:"iamo",  voi:"ete",   "3p":"ono"       },
        imperfetto:           { io:"evo",  tu:"evi",    "3s":"eva",    noi:"evamo", voi:"evate", "3p":"evano"     },
        futuro:               { io:"erò",  tu:"erai",   "3s":"erà",    noi:"eremo", voi:"erete", "3p":"eranno"    },
        condizionale:         { io:"erei", tu:"eresti", "3s":"erebbe", noi:"eremmo",voi:"ereste","3p":"erebbero"  },
        congiuntivo_presente: { io:"a",    tu:"a",      "3s":"a",      noi:"iamo",  voi:"iate",  "3p":"ano"       },
      },
      ire: {
        present:              { io:"o",    tu:"i",      "3s":"e",      noi:"iamo",  voi:"ite",   "3p":"ono"       },
        imperfetto:           { io:"ivo",  tu:"ivi",    "3s":"iva",    noi:"ivamo", voi:"ivate", "3p":"ivano"     },
        futuro:               { io:"irò",  tu:"irai",   "3s":"irà",    noi:"iremo", voi:"irete", "3p":"iranno"    },
        condizionale:         { io:"irei", tu:"iresti", "3s":"irebbe", noi:"iremmo",voi:"ireste","3p":"irebbero"  },
        congiuntivo_presente: { io:"a",    tu:"a",      "3s":"a",      noi:"iamo",  voi:"iate",  "3p":"ano"       },
      },
      ire_isc: {
        present:              { io:"isco", tu:"isci",   "3s":"isce",   noi:"iamo",  voi:"ite",   "3p":"iscono"    },
        imperfetto:           { io:"ivo",  tu:"ivi",    "3s":"iva",    noi:"ivamo", voi:"ivate", "3p":"ivano"     },
        futuro:               { io:"irò",  tu:"irai",   "3s":"irà",    noi:"iremo", voi:"irete", "3p":"iranno"    },
        condizionale:         { io:"irei", tu:"iresti", "3s":"irebbe", noi:"iremmo",voi:"ireste","3p":"irebbero"  },
        congiuntivo_presente: { io:"isca", tu:"isca",   "3s":"isca",   noi:"iamo",  voi:"iate",  "3p":"iscano"    },
      },
    };

    const getRegularForm = (person) => {
      const endings = (_regularEndings[verbObj.group] ?? {})[tenseKey];
      if (!endings) return null; // imperatives/compounds — use override fallback
      const ending = endings[_endingKey(person)];
      if (ending === undefined) return null;
      const baseInf = verbObj.infinitive.replace(/se$/i, "");
      // Italian groups end in 3 chars (-are/-ere/-ire); Spanish in 2 (-ar/-er/-ir).
      // For Spanish future/conditional the full infinitive is the stem.
      const stem = isItalian ? baseInf.slice(0, -3)
                 : (tenseKey === "future" || tenseKey === "conditional") ? baseInf
                 : baseInf.slice(0, -2);
      return stem + ending;
    };

    const stripReflexive = (form, person) => {
      const pro = _reflexPros[_reflexKey(person)];
      const prefix = pro ? pro + " " : "";
      return prefix && form.toLowerCase().startsWith(prefix) ? form.slice(prefix.length) : form;
    };

    const persons = LANG.requiredPersonsForTense(tenseKey);
    const rows = persons.map(p => {
      const form = tForms[p] ?? "—";
      const label = LANG.displayPersonLabel(p);
      const regularForm = getRegularForm(p);
      const formCore = stripReflexive(form, p).toLowerCase().trim();
      // Bold if form differs from the regular formula; for tenses without a
      // regular formula (imperatives, compounds) bold if an explicit override exists.
      const isIrregForm = form !== "—" && (
        regularForm != null
          ? formCore !== regularForm.toLowerCase().trim()
          : !!(verbObj.overrides?.[tenseKey]?.[p])
      );
      const formHTML = isIrregForm
        ? `<strong style="color:#7a3800">${form}</strong>`
        : form;
      return `<tr>
        <td style="padding:4px 10px;font-weight:600;color:#444;white-space:nowrap">${label}</td>
        <td style="padding:4px 10px;font-family:inherit">${formHTML}</td>
      </tr>`;
    }).join("");

    html += `
      <div style="display:inline-block;vertical-align:top;margin:0 18px 14px 0;min-width:160px">
        <div style="font-size:12px;font-weight:700;color:#555;letter-spacing:.05em;text-transform:uppercase;
                    border-bottom:2px solid #ddd;padding-bottom:4px;margin-bottom:4px">
          ${LANG.formatTenseLabel(tenseKey)}
        </div>
        <table style="border-collapse:collapse;font-size:14px">${rows}</table>
      </div>`;
  }
  return html;
}

function showIrregularVerbPanel(infinitive, tense) {
  // Find the verb word entry
  const verbWord = allWords.find(w =>
    (w.src || w.es || w.it) === infinitive && w.group != null
  ) ?? null;

  // Show table if verb is irregular in the relevant tense (or present if no tense given)
  if (!verbWord || !isIrregularInTense(verbWord, tense)) {
    hideIrregularVerbPanel();
    return;
  }

  const verbObj = {
    id:            verbWord.id,
    infinitive:    verbWord.src || verbWord.es || verbWord.it,
    en:            verbWord.tgt || verbWord.en,
    english:       verbWord.tgt ? [verbWord.tgt] : (verbWord.en ? [verbWord.en] : []),
    group:         verbWord.group,
    overrides:     verbWord.overrides     ?? {},
    stemOverrides: verbWord.stemOverrides ?? {},
    irregularTags: verbWord.irregularTags ?? [],
    reflexive:     verbWord.reflexive,
    aux:           verbWord.aux,
    pastParticiple:verbWord.pastParticiple,
  };

  const englishLabel = (verbWord.tgt || verbWord.en || "").replace(/^to\s+/i, "to ");

  let panel = document.getElementById("irregularVerbPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "irregularVerbPanel";
    panel.style.cssText = [
      "margin-top:24px","padding:16px 20px","background:#fffbe6",
      "border:2px solid #f0c040","border-radius:10px",
      "font-family:Arial,sans-serif","max-width:320px","width:fit-content",
      "box-sizing:border-box"
    ].join(";");

    // Insert after the typingArea
    const ta = document.getElementById("typingArea");
    if (ta && ta.parentElement) {
      ta.parentElement.insertBefore(panel, ta.nextSibling);
    } else {
      document.querySelector(".gameArea")?.appendChild(panel);
    }
  }

  const tableHTML = buildIrregularVerbTableHTML(verbObj, tense);
  panel.innerHTML = `
    <div style="font-size:13px;font-weight:800;letter-spacing:.08em;color:#7a5800;
                text-transform:uppercase;margin-bottom:10px">
      Irregular Verb &nbsp;·&nbsp; ${verbObj.infinitive} &nbsp;·&nbsp; ${englishLabel}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:0">${tableHTML}</div>
  `;
  panel.style.display = "block";
}

function hideIrregularVerbPanel() {
  const panel = document.getElementById("irregularVerbPanel");
  if (panel) panel.style.display = "none";
}


try { updateFilterVisibility(); } catch (e) { console.error("updateFilterVisibility failed", e); }
try { updateTenseSelectorVisibility(); } catch (e) { console.error("updateTenseSelectorVisibility failed", e); }

function getSelectedVerbTenses() {
  // Returns an array of tense keys to use for verb modes.
  // - If the selector is "mixed", use all unlocked tenses.
  // - Otherwise use the selected tense (if it’s unlocked), falling back to all unlocked.
  let unlocked = getUnlockedTenses().map(LANG.canonicalTenseKey);
  // de-dup while preserving order
  unlocked = unlocked.filter((t, i) => unlocked.indexOf(t) === i);

  if (!tenseSelect) return unlocked;

  const vRaw = tenseSelect.value;
  const v = LANG.canonicalTenseKey(vRaw);

  if (v === "mixed") return unlocked;
  return unlocked.includes(v) ? [v] : unlocked;
}



function isNoun(w) {
  return w && w.pos === "noun";
}







function activeKey(level, mode) {
  // mode will be "match" or "typing"
  return `activePool:${LANG.id}:${mode}:${level}`;
}

function loadActivePool(level, mode) {
  const raw = localStorage.getItem(activeKey(level, mode));
  return raw ? JSON.parse(raw) : [];
}

function saveActivePool(level, mode, ids) {
  localStorage.setItem(activeKey(level, mode), JSON.stringify(ids));
}

function wordKey(w) {
  // Prefer stable IDs if you have them; fallback is still stable enough
  return w.id || `${w.src}||${w.tgt}||${w.level}`;
}

function ensureActivePool(level, mode, candidates) {
  // candidates = pool AFTER level+mode filtering
  const candidateIds = new Set(candidates.map(wordKey));

  // Remove anything no longer eligible (e.g., now mastered)
  let active = loadActivePool(level, mode).filter(id => candidateIds.has(id));

  // Fill with new candidates up to ACTIVE_POOL_SIZE
  const activeSet = new Set(active);
  const remaining = candidates.filter(w => !activeSet.has(wordKey(w)));

  // shuffle so incoming items feel random
  remaining.sort(() => Math.random() - 0.5);

  while (active.length < ACTIVE_POOL_SIZE && remaining.length > 0) {
    active.push(wordKey(remaining.pop()));
  }

  saveActivePool(level, mode, active);
  return active;
}

function filterToActivePool(words, activeIds) {
  const activeSet = new Set(activeIds);
  return words.filter(w => activeSet.has(wordKey(w)));
}


let allWords = [];

/* =========================
   FAST WORD LOOKUP (Optimization #1)
   =========================
   Index normalized surface forms -> word entries.
   This avoids scanning allWords on every answer submission.
*/
let wordLookup = new Map(); // key: LANG.normalizeAnswer(str) -> Array<word>

function rebuildWordLookup() {
  wordLookup = new Map();
  if (!Array.isArray(allWords)) return;

  for (const w of allWords) {
    const tgtKey = LANG.normalizeAnswer(w?.tgt);
    const srcKey = LANG.normalizeAnswer(w?.src);

    if (tgtKey) {
      const arr = wordLookup.get(tgtKey) || [];
      arr.push(w);
      wordLookup.set(tgtKey, arr);
    }
    if (srcKey && srcKey !== tgtKey) {
      const arr = wordLookup.get(srcKey) || [];
      arr.push(w);
      wordLookup.set(srcKey, arr);
    }
  }
}
let currentRound = [];
let selectedSource = null;
let selectedTarget = null;
let isTyping = false;
let currentIndex = 0;
let currentWord = null;
let currentTarget = "";
let verbs = [];
let conjugations = [];

/* =========================
   SYNONYMS + NORMALIZATION
   ========================= */

function norm(s) { return LANG.normalizeAnswer(s ?? ""); }

// Makes "(facts)" optional: "to know (facts)" accepts "to know"
function withOptionalParenthetical(s) {
  const out = new Set([s]);
  out.add(s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim());
  return [...out].filter(Boolean);
}

// Slash options: "to take/wear" accepts "to take" or "to wear" or either order
function expandSlashOptions(s) {
  // Split only if it looks like a slash list (no spaces around required)
  if (!s.includes("/")) return [s];

  const parts = s.split("/").map(p => p.trim()).filter(Boolean);
  if (parts.length <= 1) return [s];

  const out = new Set();
  parts.forEach(p => out.add(p));
  out.add(parts.join("/"));
  out.add(parts.slice().reverse().join("/"));
  return [...out];
}

function getWordForms(word, lang) {
  // lang = "src" or "tgt"
  const base = word?.[lang];
  const syn = word?.[`${lang}_syn`];
  const all = [base, ...(Array.isArray(syn) ? syn : [])].filter(Boolean);
  return all.map(norm);
}

function buildAcceptedSetForTargetString(targetString) {
  // used when currentTarget is a string (verbs currently use strings)
  const base = norm(targetString);
  const variants = new Set();

  // parentheticals optional
  for (const v of withOptionalParenthetical(base)) {
    // slash options
    for (const s of expandSlashOptions(v)) {
      variants.add(norm(s));
    }
  }
  return variants;
}

function buildAcceptedSetForWord(word, lang) {
  // used for word-typing: word contains synonyms arrays
  const forms = getWordForms(word, lang);
  const variants = new Set();

  for (const f of forms) {
    for (const p of withOptionalParenthetical(f)) {
      for (const s of expandSlashOptions(p)) {
        variants.add(norm(s));
      }
    }
  }
  return variants;
}

function initAccentButtons() {
  if (!accentButtons) return;
  // Populate buttons from LANG config
  if (Array.isArray(LANG.accentButtons)) {
    LANG.accentButtons.forEach(({ ch, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.ch = ch;
      btn.textContent = label || ch;
      accentButtons.appendChild(btn);
    });
  }

  accentButtons.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const ch = btn.dataset.ch || btn.textContent;
    insertAtCursor(translationInput, ch);
  });
}


console.log(`Loading language: ${LANG.id} (${LANG.sourceLang}→${LANG.targetLang})`);

fetch(`words_${LANG.id}.json`)
  .then(res => {
    console.log("Fetch response received", res);
    return res.json();
  })
  .then(async data => {
    console.log(`Data loaded from words_${LANG.id}.json`, data.length);

    // Split verb entries (those with conjugation metadata) into the verbs array.
    // A verb entry has conjugation data if it has a 'group' field.
    verbs = data.filter(entry => entry.pos === "verb" && entry.group != null);
    console.log(`Verb entries with conjugation data: ${verbs.length}`);

    // Try Gist first; fall back to localStorage for offline use.
    let savedWords = null;
    let savedVerbTenseProgress = null;

    const gistBundle = await loadFromGist();
    if (gistBundle && !gistBundle.error && gistBundle.words) {
      // Loaded from Gist — mirror to localStorage for offline use
      savedWords = gistBundle.words;
      savedVerbTenseProgress = gistBundle.verbTenseProgress || null;
      try { localStorage.setItem(`progress_${LANG.id}`, JSON.stringify(gistBundle)); } catch (_) {}
    } else if (gistConfigured()) {
      // Gist is configured but returned no progress for this profile — new profile on existing device.
      // Do NOT fall back to localStorage (it may contain a different user's progress).
      // Clear any stale localStorage progress so it doesn't bleed into this profile.
      try { localStorage.removeItem(`progress_${LANG.id}`); } catch (_) {}
    } else {
      // Gist not configured — use localStorage as normal (single user, no sync)
      const saved = localStorage.getItem(`progress_${LANG.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          savedWords = parsed;
        } else if (parsed && Array.isArray(parsed.words)) {
          savedWords = parsed.words;
          savedVerbTenseProgress = parsed.verbTenseProgress || null;
        }
      }
    }

    allWords = savedWords ? mergeProgress(savedWords, data) : initWords(data);
    console.log("All words initialized", allWords.length);
    window._debug = { allWords, LANG }; // debug hook
    decayWords();
    rebuildWordLookup();

    // If progress was stored as a bundle, restore verb tense progress too.
    if (savedVerbTenseProgress) {
      try {
        saveVerbTenseProgress(savedVerbTenseProgress);
        ensureVerbTenseProgressInit();
      } catch (e2) {
        console.warn("Saved verb tense progress was invalid; ignoring:", e2);
      }
    }

    initAccentButtons();
    buildConjugationPool();
    unlockVerbModes();

    startNextRound();
    updateStats();
    addGistButton();

    // When the app is about to be closed or backgrounded, show "Saving…" and
    // do an immediate Gist save before yielding. This gives the save time to
    // complete rather than racing against the page close.
    let _isSaving = false;

    const saveNow = async () => {
      if (!gistConfigured() || _isSaving) return;
      _isSaving = true;
      clearTimeout(_gistSaveTimer);

      // Show saving indicator
      const indicator = document.createElement("div");
      indicator.id = "gistSavingIndicator";
      indicator.textContent = "Saving…";
      indicator.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:rgba(0,0,0,0.75); color:#fff; padding:12px 24px;
        border-radius:8px; font:bold 16px system-ui; z-index:99999;
      `;
      document.body.appendChild(indicator);

      await saveToGist({
        words: slimProgress(allWords),
        verbTenseProgress: loadVerbTenseProgress() || null
      });

      indicator.textContent = "Saved ✓";
      setTimeout(() => indicator.remove(), 800);
      _isSaving = false;
    };

    // Fire on tab switch, app backgrounding, and page hide
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveNow();
    });
    window.addEventListener("pagehide", saveNow);
  })
  .catch(error => {
    console.error(`Error loading words_${LANG.id}.json:`, error);
  });


function initWords(data) {
  const words = data.map(raw => {
    const w = LANG.mapWord(raw);
    const entry = {
      src:           w.src,
      tgt:           w.tgt,
      src_syn:       Array.isArray(w.src_syn) ? w.src_syn : [],
      tgt_syn:       Array.isArray(w.tgt_syn) ? w.tgt_syn : [],
      pos:           raw.pos,
      rating:        raw.rating,
      noun_class:    raw.noun_class,
      noun_override: raw.noun_override,
      id:            raw.id,
      level:         w.level || "A1",
      streak: 0, misses: 0, weight: ratingToWeight(raw.rating), lastSeen: Date.now(),
      typing_streak: 0, typing_misses: 0, typing_weight: ratingToWeight(raw.rating), typing_lastSeen: Date.now(),
      noun_typing_singular_ok: false,
      noun_typing_plural_ok: false,
      unlocked: false,
    };
    // Copy conjugation metadata for verb entries
    if (raw.pos === "verb" && raw.group != null) {
      entry.group         = raw.group;
      entry.overrides     = raw.overrides     ?? {};
      entry.stemOverrides = raw.stemOverrides ?? {};
      entry.irregularTags = raw.irregularTags ?? [];
      entry.reflexive     = raw.reflexive;
      entry.aux           = raw.aux;
      entry.pastParticiple = raw.pastParticiple;
    }
    // Preserve quickStart flag from JSON
    if (raw.quickStart) entry.quickStart = true;
    return entry;
  });

  // New: Unlock initial 25 random words if no saved progress
  if (!localStorage.getItem(`progress_${LANG.id}`)) {
    unlockInitialWords(words);
  }

  return words;
}
function mergeProgress(savedWords, freshData) {
  // savedWords may be slim (progress fields only) or legacy full objects — key only on 'es'.
  const savedMap = new Map(savedWords.map(w => [w.src, w]));

  return freshData.map(raw => {
    // LANG.mapWord handles both raw words_XX.json (es/en keys) and already-mapped objects (src/tgt keys).
    const fresh = LANG.mapWord(raw);
    const level = fresh.level || "A1";
    const saved = savedMap.get(fresh.src);

    // Always take static/display fields from freshData (words_XX.json is source of truth)
    const base = {
      src:           fresh.src,
      tgt:           fresh.tgt,
      level,
      pos:           raw.pos,
      rating:        raw.rating,
      src_syn:       Array.isArray(fresh.src_syn) ? fresh.src_syn : [],
      tgt_syn:       Array.isArray(fresh.tgt_syn) ? fresh.tgt_syn : [],
      noun_class:    raw.noun_class,
      noun_override: raw.noun_override,
      id:            raw.id,
      ...(raw.quickStart ? { quickStart: true } : {}),
    };

    // Copy conjugation metadata for verb entries
    if (raw.pos === "verb" && raw.group != null) {
      base.group         = raw.group;
      base.overrides     = raw.overrides     ?? {};
      base.stemOverrides = raw.stemOverrides ?? {};
      base.irregularTags = raw.irregularTags ?? [];
      base.reflexive     = raw.reflexive;
      base.aux           = raw.aux;
      base.pastParticiple = raw.pastParticiple;
    }

    if (saved) {
      return {
        ...base,
        streak:                  saved.streak                  ?? 0,
        misses:                  saved.misses                  ?? 0,
        weight:                  saved.weight                  ?? 5,
        lastSeen:                saved.lastSeen                ?? Date.now(),
        typing_streak:           saved.typing_streak           ?? 0,
        typing_misses:           saved.typing_misses           ?? 0,
        typing_weight:           saved.typing_weight           ?? 5,
        typing_lastSeen:         saved.typing_lastSeen         ?? Date.now(),
        noun_typing_singular_ok: saved.noun_typing_singular_ok ?? false,
        noun_typing_plural_ok:   saved.noun_typing_plural_ok   ?? false,
        unlocked:                saved.unlocked                ?? false,
        quickStartUnlocked:      saved.quickStartUnlocked      ?? false,
      };
    }

    // New word not in saved progress yet — locked, all defaults
    return {
      ...base,
      streak: 0, misses: 0, weight: ratingToWeight(raw.rating), lastSeen: Date.now(),
      typing_streak: 0, typing_misses: 0, typing_weight: ratingToWeight(raw.rating), typing_lastSeen: Date.now(),
      noun_typing_singular_ok: false,
      noun_typing_plural_ok:   false,
      unlocked: false,
    };
  });
}

function startVerbMatching() {
  const _vtArea = document.getElementById("verbTransformArea");
  if (_vtArea) _vtArea.style.display = "none";
  // Verb matching uses the same matching UI
  sourceCol.style.display = "";
  targetCol.style.display = "";
  typingArea.style.display = "none";

  const selectedTenses = getSelectedVerbTenses();
  const pool = conjugations.filter(c => selectedTenses.includes(c.tense) && c.matchStreak < MASTERED_STREAK);

  if (pool.length === 0) {
    alert("No verb conjugations available yet. Master a verb infinitive first.");
    return;
  }

  currentRound = pickWeighted(pool, 5, false);

  selectedSource = null;
  selectedTarget = null;

  sourceCol.innerHTML = "";
  targetCol.innerHTML = "";

  currentRound.forEach(c =>
    sourceCol.appendChild(makeWord(c.src || c.src, "src", c))
  );

  shuffle([...currentRound]).forEach(c => {
    const tgt = c.tense?.startsWith("imperative") ? `${c.tgt} (Command - ${c.person})` : c.tgt;
    targetCol.appendChild(makeWord(tgt, "tgt", c));
  });
}



function unlockInitialWords(words) {
  // Shuffle and unlock the first 25
  shuffle(words);
  for (let i = 0; i < Math.min(INITIAL_POOL_SIZE, words.length); i++) {
    words[i].unlocked = true;
  }
}

function unlockNewWord() {
  const level = document.getElementById("level").value;

  let lockedWords = allWords.filter(w => !w.unlocked);
  if (lockedWords.length === 0) {
    console.log("No more words to unlock—all words are available!");
    return;
  }

  // NEW: if user chose "Verbs Only", unlock verbs first
  if (level === "verbs") {
    const lockedVerbs = lockedWords.filter(isVerbInfinitiveWord);
    if (lockedVerbs.length > 0) {
      lockedWords = lockedVerbs;
    }
  }

  const newWord = lockedWords[Math.floor(Math.random() * lockedWords.length)];
  newWord.unlocked = true;
  save();
  console.log(`Unlocked new word: ${newWord.src} - ${newWord.tgt}`);
}





function buildConjugationPool() {
  conjugations = [];

  // Cache target-language conjugation results to avoid repeated work
  const _tgtCache = new Map();
  const tgtForCached = (verb, tense, person) => {
    const k = `${verb.id}|${tense}|${person}`;
    if (_tgtCache.has(k)) return _tgtCache.get(k);
    const v = englishFor(verb, tense, person);
    _tgtCache.set(k, v);
    return v;
  };

  // Use allWords verb entries directly — they carry conjugation metadata after the merge.
  // Falls back to the verbs array for any verb not yet in allWords (e.g. before first load).
  const verbEntries = allWords.length > 0
    ? allWords.filter(w => w.pos === "verb" && w.group != null)
    : verbs;

  verbEntries.forEach(verb => {
    // Build a verb object compatible with LANG.buildVerbForms and englishFor():
    // words_es uses 'es'/'it' as the Spanish/Italian key; the engine needs 'infinitive'.
    // englishFor() reads verbObj.english (array) or verbObj.en (string) for the gloss.
    const verbObj = {
      id:            verb.id,
      infinitive:    verb.src || verb.es || verb.it || verb.infinitive,
      en:            verb.tgt || verb.en,
      english:       verb.tgt ? [verb.tgt] : (verb.en ? [verb.en] : []),
      group:         verb.group,
      overrides:     verb.overrides     ?? {},
      stemOverrides: verb.stemOverrides ?? {},
      irregularTags: verb.irregularTags ?? [],
      reflexive:     verb.reflexive,
      aux:           verb.aux,
      pastParticiple:verb.pastParticiple,
    };

    if (!isVerbUnlocked(verbObj)) return;

    const forms = LANG.buildVerbForms(verbObj, (v, tense, person) => tgtForCached(v, tense, person));
    if (!Array.isArray(forms)) return;

    for (const form of forms) {
      if (!form.src) continue;

      // Reverse-construction verbs (gustar, encantar, doler, etc.) only make sense
      // with a 3rd-person subject — skip yo/tú/nosotros/vosotros forms entirely.
      if (verb.reverseConstruction) {
        const cp = LANG.canonicalPerson(form.person);
        if (cp !== "3s" && cp !== "3p") continue;
      }

      // Irregular verbs (in present) get 3× the base weight so they appear more frequently
      const isIrreg = (verbObj.irregularTags ?? []).includes("present-irreg");
      const baseVerbWeight = isIrreg ? 45 : 15;
      const entry = {
        verbId:          verbObj.id,
        infinitive:      verbObj.infinitive,
        tense:           form.tense,
        person:          form.person,
        src:             form.src,
        tgt:             form.tgt,
        matchStreak:     0,
        typeStreak:      0,
        transformStreak: 0,
        matchWeight:     baseVerbWeight,
        typeWeight:      baseVerbWeight,
        transformWeight: baseVerbWeight,
      };

      conjugations.push(entry);
    }
  });

  // Build ambiguity map: same source form across multiple persons in same tense+verb.
  conjugationAmbiguity.clear();
  for (const c of conjugations) {
    const t = LANG.canonicalTenseKey(c.tense);
    const key = `${t}|${c.infinitive}|${c.src}`;
    let arr = conjugationAmbiguity.get(key);
    if (!arr) { arr = []; conjugationAmbiguity.set(key, arr); }
    arr.push({ person: c.person, tgt: c.tgt });
  }
}


function unlockVerbModes() {
  const verbEntries = allWords.length > 0
    ? allWords.filter(w => w.pos === "verb" && w.group != null)
    : verbs;
  const unlocked = verbEntries.some(isVerbUnlocked);

  if (!unlocked) return;

  // Be robust to older HTML versions that don't have option IDs.
  const vm  = document.getElementById("verbMatchOption")     || document.querySelector('option[value="verb-match"]');
  const vt  = document.getElementById("verbTypeOption")      || document.querySelector('option[value="verb-type"]');
  const vtr = document.getElementById("verbTransformOption") || document.querySelector('option[value="verb-transform"]');

  if (vm)  vm.disabled  = false;
  if (vt)  vt.disabled  = false;
  if (vtr) vtr.disabled = false;
}




function activateQuickStart() {
  // Unlock all Quick Start words and set streaks so verb modes open immediately.
  let unlockCount = 0;
  allWords.forEach(w => {
    if (!w.quickStart) return;
    w.unlocked      = true;
    w.weight        = ratingToWeight(w.rating);
    w.typing_weight = ratingToWeight(w.rating);
    // Mark verbs as quick-start unlocked for conjugation modes
    if (w.pos === "verb") {
      w.quickStartUnlocked = true;
    }
    unlockCount++;
  });
  console.log(`Quick Start: unlocked ${unlockCount} words`);

  // Unlock all verb tenses
  let p = loadVerbTenseProgress();
  if (!p) p = ensureVerbTenseProgressInit();
  if (p && Array.isArray(LANG.tenseOrder)) {
    p.unlockedTenses = [...LANG.tenseOrder];
    saveVerbTenseProgress(p);
  }
  refreshTenseSelector();

  // Enable verb mode dropdown options directly
  const vm  = document.getElementById("verbMatchOption")     || document.querySelector('option[value="verb-match"]');
  const vt  = document.getElementById("verbTypeOption")      || document.querySelector('option[value="verb-type"]');
  const vtr = document.getElementById("verbTransformOption") || document.querySelector('option[value="verb-transform"]');
  if (vm)  vm.disabled  = false;
  if (vt)  vt.disabled  = false;
  if (vtr) vtr.disabled = false;

  // Also unlock typing mode
  const typingOpt = document.querySelector('option[value="typing"]');
  if (typingOpt) typingOpt.disabled = false;

  save();
  buildConjugationPool();
  unlockVerbModes();
  startNextRound();
  updateStats();

  const btn = document.getElementById("quickStartBtn");
  if (btn) btn.remove();
}

function addQuickStartButton() {

  const overlay = document.createElement("div");
  overlay.id = "welcomeOverlay";
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    background:rgba(0,0,0,0.6);
    display:flex; align-items:center; justify-content:center;
    padding:16px; box-sizing:border-box;
    font-family:system-ui, Arial, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background:#fff; border-radius:16px;
      max-width:520px; width:100%;
      padding:32px 28px; box-shadow:0 12px 48px rgba(0,0,0,0.3);
      text-align:center;
    ">
      <div style="font-size:36px; margin-bottom:8px;">🇪🇸</div>
      <h2 style="margin:0 0 8px; font-size:22px; color:#111;">Welcome to Language Learning</h2>
      <p style="color:#555; font-size:14px; margin:0 0 28px; line-height:1.5;">
        How would you like to get started?
      </p>

      <div style="display:flex; flex-direction:column; gap:14px;">

        <button id="welcomeQuickStart" style="
          padding:18px 20px; border-radius:12px; border:2px solid #4a90d9;
          background:#f0f7ff; cursor:pointer; text-align:left;
        ">
          <div style="font-size:18px; font-weight:700; color:#2266aa; margin-bottom:4px;">
            ⚡ Quick Start
          </div>
          <div style="font-size:13px; color:#444; line-height:1.5;">
            Begin with ~200 of the most common Spanish words already unlocked.
            All game modes — Matching, Typing, Verb Matching, and Verb Typing —
            and all verb tenses are available from the start.
            Best if you have some Spanish experience or want to dive straight in.
          </div>
        </button>

        <button id="welcomeScratch" style="
          padding:18px 20px; border-radius:12px; border:2px solid #aaa;
          background:#fafafa; cursor:pointer; text-align:left;
        ">
          <div style="font-size:18px; font-weight:700; color:#333; margin-bottom:4px;">
            🌱 Start from Scratch
          </div>
          <div style="font-size:13px; color:#444; line-height:1.5;">
            Begin with a small set of basic words and the Matching game only.
            New modes unlock as you master words — Typing unlocks after ${20} words mastered,
            then Verb modes open as your vocabulary grows.
            Best for complete beginners who want a gradual progression.
          </div>
        </button>

      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("welcomeQuickStart").addEventListener("click", async () => {
    console.log("Quick Start clicked");
    overlay.remove();
    activateQuickStart();
    console.log("Saving Quick Start to Gist...");
    await saveToGist({
      words: slimProgress(allWords),
      verbTenseProgress: loadVerbTenseProgress() || null
    });
    console.log("Quick Start Gist save complete");
  });

  document.getElementById("welcomeScratch").addEventListener("click", async () => {
    console.log("Start from Scratch clicked");
    overlay.remove();
    allWords.forEach(w => { w.unlocked = false; });
    const nonQS = allWords.filter(w => !w.quickStart);
    shuffle(nonQS);
    for (let i = 0; i < Math.min(INITIAL_POOL_SIZE, nonQS.length); i++) {
      nonQS[i].unlocked = true;
    }
    console.log(`Start from Scratch: ${allWords.filter(w => w.unlocked).length} unlocked, ${allWords.filter(w => w.unlocked && w.quickStart).length} are quickStart`);
    save();
    buildConjugationPool();
    startNextRound();
    updateStats();
    // Await the Gist save to ensure it completes before user can navigate away
    console.log("Saving to Gist...");
    await saveToGist({
      words: slimProgress(allWords),
      verbTenseProgress: loadVerbTenseProgress() || null
    });
    console.log("Gist save complete");
  });
}

function decayWords() {
  const now = Date.now();
  allWords.forEach(w => {
    const days = (now - w.lastSeen) / 86400000;
    if (days > DECAY_DAYS && w.weight < 5) {
      w.weight++;
    }
    const typingDays = (now - w.typing_lastSeen) / 86400000;
    if (typingDays > DECAY_DAYS && w.typing_weight < 5) {
      w.typing_weight++;
    }
  });
}



function isVerbInfinitiveWord(w) {
  // A verb infinitive word is one with pos=verb and conjugation metadata (group field).
  // Falls back to LANG detection if metadata isn't present.
  if (w.pos === "verb" && w.group != null) return true;
  return (LANG.looksLikeVerbInfinitive ? LANG.looksLikeVerbInfinitive(w) : false);
}
function pickUniqueSurfaceWords(pool, count) {
  const chosen = [];
  const usedSpanish = new Set();

  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  for (const w of shuffled) {
    const key = LANG.normalizeAnswer(w.src);

    if (!usedSpanish.has(key)) {
      chosen.push(w);
      usedSpanish.add(key);
    }

    if (chosen.length >= count) break;
  }

  return chosen;
}

function isTypingMasteredWord(w) {
  if (!w) return false;
  if (w.typing_streak < MASTERED_STREAK) return false;

  if (LANG.nounRequiresPluralForMastery(w)) {
    return !!w.noun_typing_singular_ok && !!w.noun_typing_plural_ok;
  }
  return true;
}


function startNextRound() {
  let mode = document.getElementById("mode").value;
  const level = document.getElementById("level").value;

  console.log("Starting next round with mode:", mode, "level:", level);

  const matchingMastered = allWords.filter(w => w.streak >= MASTERED_STREAK).length;

  // Typing is gated behind 20 matching-mastered, unless Quick Start unlocked enough words
  const quickStartActive = allWords.filter(w => w.quickStart && w.unlocked).length >= 20;
  if (mode === "typing" && matchingMastered < 20 && !quickStartActive) {
    alert("Master 20 words in matching first!");
    document.getElementById("mode").value = "all";
    mode = "all";
  }

  // 1) Level filter (NO unlocked gating for matching/review)
  let pool = allWords.filter(w => {
  if (level === "all") return true;

  // ✅ Verbs Only level selection
  if (level === "verbs") return isVerbInfinitiveWord(w);

  // Regular A1/A2/B1/B2 levels
  return w.level === level;
});


  console.log("Pool size after level filter:", pool.length);

  // 2) Mode filter
  if (mode === "typing") {
    isTyping = true;
    // For Quick Start users, draw from all unlocked words not yet typing-mastered.
    // For normal users, only from matching-mastered words.
    if (quickStartActive) {
      pool = pool.filter(w => w.unlocked && !isTypingMasteredWord(w));
    } else {
      pool = pool.filter(w => w.streak >= MASTERED_STREAK && !isTypingMasteredWord(w));
    }

  } else if (mode === "review") {
    isTyping = false;
    // ✅ review ONLY includes matching-mastered words
    pool = pool.filter(w => w.streak >= MASTERED_STREAK);
  } else {
    // mode === "all" (normal matching)
    isTyping = false;
    // keep matching focused on unmastered words
    pool = pool.filter(w => w.streak < MASTERED_STREAK);
  }
  // ✅ Apply 25-at-a-time active pools for BOTH matching and typing
// Review should NOT be limited by active pools.
if (mode !== "review") {
  if (isTyping) {
    const activeTypingIds = ensureActivePool(level, "typing", pool);
    pool = filterToActivePool(pool, activeTypingIds);
    console.log("Pool size after TYPING active pool:", pool.length);
  } else {
    const activeMatchIds = ensureActivePool(level, "match", pool);
    pool = filterToActivePool(pool, activeMatchIds);
    console.log("Pool size after MATCH active pool:", pool.length);
  }
}

  console.log("Final pool size after mode filter:", pool.length);

  if (pool.length === 0) {
    alert("No words available for this mode/level. Try changing settings or resetting progress.");
    return;
  }

  if (pool.length < 5 && !isTyping) {
    alert(`Only ${pool.length} words available for this level. Starting a shorter round.`);
  }

  currentRound = pickWeighted(pool, 5, isTyping);
  console.log("Current round selected:", currentRound.length);

  if (isTyping) {
    renderTyping();
  } else {
    renderMatching();
  }
}


function startVerbTyping() {
  const _vtArea = document.getElementById("verbTransformArea");
  if (_vtArea) _vtArea.style.display = "none";
  // Hide matching columns, show typing UI (same as word typing)
  sourceCol.style.display = "none";
  targetCol.style.display = "none";
  typingArea.style.display = "block";
  // Reset any leftover disabled state from a previous awaitContinue
  _waitingForContinue = false;
  translationInput.disabled = false;
  submitTranslation.disabled = false;
  if (continueBtn) continueBtn.style.display = "none";

  const selectedTenses = getSelectedVerbTenses();
  const pool = conjugations.filter(c => selectedTenses.includes(c.tense) && c.typeStreak < MASTERED_STREAK);

  if (pool.length === 0) {
    alert("No verb conjugations available yet. Master a verb infinitive first.");
    return;
  }

  // Deduplicate pool by Spanish form so ambiguous forms (yo/él sharing "hablaría",
  // ellos/ustedes sharing "hablarían", etc.) don't crowd each other out.
  // Keep the entry with the highest typeWeight (most in need of practice) per unique form.
  const seenEs = new Map(); // key: tense|infinitive|es -> index in deduped
  const deduped = [];
  for (const c of pool) {
    const key = `${c.tense}|${c.infinitive}|${c.src}`;
    if (!seenEs.has(key)) {
      seenEs.set(key, deduped.length);
      deduped.push(c);
    } else {
      const idx = seenEs.get(key);
      if ((c.typeWeight ?? 1) > (deduped[idx].typeWeight ?? 1)) deduped[idx] = c;
    }
  }

  // Irregular verb weights are already set at 3× in buildConjugationPool — no further boost needed.
  currentRound = pickWeighted(deduped, 5, false);
  currentIndex = 0;
  feedbackDiv.textContent = "";
  showNextVerbTyping();

  submitTranslation.onclick = () => safeCall(handleVerbTypingSubmit, "verb typing submit");
  translationInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      safeCall(handleVerbTypingSubmit, "verb typing submit (Enter)");
    }
  };
}

// Check whether a conjugated form is ambiguous across currently selected tenses.
// If the same displayed form (src for ES→EN, tgt for EN→ES) maps to different
// answers in different selected tenses for the same verb, the tense must be shown.
function isFormAmbiguousAcrossTenses(c, isEsToEn) {
  const selectedTenses = getSelectedVerbTenses();
  if (selectedTenses.length <= 1) return false;

  const displayedForm = isEsToEn ? c.src : c.tgt;
  const currentTenseKey = LANG.canonicalTenseKey(c.tense);

  // Check if any conjugation entry for the same verb has the same displayed form
  // but in a different selected tense
  for (const other of conjugations) {
    if (other.infinitive !== c.infinitive) continue;
    const otherTense = LANG.canonicalTenseKey(other.tense);
    if (otherTense === currentTenseKey) continue;
    if (!selectedTenses.includes(other.tense)) continue;
    const otherForm = isEsToEn ? other.src : other.tgt;
    if (otherForm === displayedForm) return true;
  }
  return false;
}

function showNextVerbTyping() {
  if (currentIndex >= currentRound.length) {
    const isMixed = modeSelect.value === "mixed-mode";
    setTimeout(isMixed ? startMixedRound : startVerbTyping, 1000);
    return;
  }

  const c = currentRound[currentIndex];
  const isEsToEn = Math.random() < 0.5;

  if (isEsToEn) {
    const showTense = isFormAmbiguousAcrossTenses(c, true);
    const prefix = showTense ? `(${LANG.formatTenseLabel(c.tense)}) ` : "";
    promptDiv.textContent = `${prefix}Type the ${LANG.targetLang} for: ${c.src}`;
    currentVerbTypingIsEsToEn = true;
    currentTarget = c.tgt;
  } else {
    const showTense = isFormAmbiguousAcrossTenses(c, false);
    const prefix = showTense ? `(${LANG.formatTenseLabel(c.tense)}) ` : "";
    const imperativeSuffix = c.tense?.startsWith("imperative") ? ` (Command - ${c.person})` : "";
    promptDiv.textContent = `${prefix}Type the ${LANG.sourceLang} for: ${c.tgt}${imperativeSuffix}`;
    currentVerbTypingIsEsToEn = false;
    currentTarget = c.src;
  }

  currentWord = c;
  translationInput.value = "";
  translationInput.focus();
  feedbackDiv.textContent = "";
}

// Returns true if user's answer matches the correct answer, allowing:
// - parentheticals to be optional
// - slash meanings to accept either part ("to take"), full form ("to take/wear"),
//   or reversed form ("to wear/take")
// Build acceptable English answers for verb typing with strict number but flexible pronoun identity.
// Option A rules:
// - 3s (él/ella/usted): accept "he", "she", "you"
// - 3p (ellos/ellas/ustedes): accept "they", "you all"
// - vosotros/vosotras: accept "you all" only
// - tú: accept "you" only








// Display-only helper: clarify "you all" as (formal)/(informal) to avoid ustedes vs vosotros ambiguity.
// We still accept user input with or without the parenthetical.




// After showing feedback, show Continue button and wait for click or Enter.
// True when waiting for user to press Continue — blocks submit handlers
let _waitingForContinue = false;

function awaitContinue(onContinue) {
  _waitingForContinue = true;
  submitTranslation.disabled = true;
  translationInput.disabled = true;
  if (continueBtn) {
    continueBtn.style.display = "inline-block";
  }

  let proceeded = false;
  const proceed = () => {
    if (proceeded) return;
    proceeded = true;
    _waitingForContinue = false;
    if (continueBtn) continueBtn.style.display = "none";
    if (continueBtn) continueBtn.removeEventListener("click", proceed);
    submitTranslation.disabled = false;
    translationInput.disabled = false;
    translationInput.value = "";
    translationInput.focus();
    onContinue();
  };

  if (continueBtn) continueBtn.addEventListener("click", proceed);

  // Record when awaitContinue was called. The keyup from the submission Enter
  // arrives a few ms later; ignore it by discarding any keyup within 100ms.
  const armedAt = Date.now();
  const onKeyUp = (e) => {
    if (e.key !== "Enter") return;
    if (Date.now() - armedAt < 500) return; // discard the submission keyup
    e.preventDefault();
    document.removeEventListener("keyup", onKeyUp);
    proceed();
  };
  document.addEventListener("keyup", onKeyUp);
}

function isAnswerCorrect(userAnswer, correctAnswer) {
  const user = LANG.normalizeAnswer(userAnswer);
  const correct = LANG.normalizeAnswer(correctAnswer);

  const accepted = new Set();

  function addVariants(str) {
    if (!str) return;
    const base = LANG.normalizeAnswer(str);
    if (!base) return;

    // accept as-is
    accepted.add(base);

    // parentheticals optional: "to know (facts)" -> "to know"
    const noParen = base.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (noParen) accepted.add(noParen);

    // slash options: "to take/wear" => take, wear, take/wear, wear/take
      if (noParen.includes("/")) {
    // Detect whether the original had a leading "to "
    const hadTo = /^to\s+/.test(base);

    // Work with a "core" that doesn't include the leading "to "
    const core = hadTo ? noParen.replace(/^to\s+/, "") : noParen;

    const parts = core.split("/").map(p => p.trim()).filter(Boolean);

    // Accept each part alone
    for (const p of parts) {
      accepted.add(LANG.normalizeAnswer(p));
      // If the original was an infinitive like "to take/wear", accept "to wear" too
      if (hadTo) accepted.add(LANG.normalizeAnswer(`to ${p}`));
    }

    // Also accept the combined forms
    accepted.add(LANG.normalizeAnswer(hadTo ? `to ${parts.join("/")}` : parts.join("/")));
    if (parts.length === 2) {
      accepted.add(LANG.normalizeAnswer(hadTo ? `to ${parts[1]}/${parts[0]}` : `${parts[1]}/${parts[0]}`));
    }
  }


  }

  // 1) Always include the target itself (+ variants)
  addVariants(correctAnswer);

  // 2) Add synonyms from words.json if this target matches any word entry
  //    Works for both directions because correctAnswer might be ES or EN.
  const matches = wordLookup.get(correct) || [];

  for (const w of matches) {
    // If the correctAnswer is English, accept en + en_syn
    if (LANG.normalizeAnswer(w.tgt) === correct) {
      addVariants(w.tgt);
      if (Array.isArray(w.tgt_syn)) w.tgt_syn.forEach(addVariants);
    }

    // If the correctAnswer is Spanish, accept es + es_syn
    if (LANG.normalizeAnswer(w.src) === correct) {
      addVariants(w.src);
      if (Array.isArray(w.src_syn)) w.src_syn.forEach(addVariants);
    }
  }

  return accepted.has(user);
}


function handleVerbTypingSubmit() {
  if (_waitingForContinue) return;
  const value = translationInput.value.trim();
  let correct;
  if (currentVerbTypingIsEsToEn) {
    const expectedList = (function(){
      const t = LANG.canonicalTenseKey(currentWord?.tense);
      const key = (t && currentWord?.infinitive && currentWord?.src) ? `${t}|${currentWord.infinitive}|${currentWord.src}` : null;
      const arr = key ? conjugationAmbiguity.get(key) : null;

      // Build the verbObj needed to call englishFor directly
      const verbWord = allWords.find(w => (w.src || w.es || w.it) === currentWord?.infinitive && w.group != null) ?? null;
      const verbObj = verbWord ? {
        id:            verbWord.id,
        infinitive:    verbWord.src || verbWord.es || verbWord.it,
        en:            verbWord.tgt || verbWord.en,
        english:       verbWord.tgt ? [verbWord.tgt] : (verbWord.en ? [verbWord.en] : []),
        group:         verbWord.group,
        overrides:     verbWord.overrides     ?? {},
        stemOverrides: verbWord.stemOverrides ?? {},
        irregularTags: verbWord.irregularTags ?? [],
        reflexive:     verbWord.reflexive,
        aux:           verbWord.aux,
        pastParticiple:verbWord.pastParticiple,
      } : null;

      // Generate accepted answers by calling englishFor with each valid pronoun variant.
      // This correctly conjugates each pronoun (he knows / she knows / you know) rather than
      // trying to re-attach a body extracted from one pronoun's conjugation to another.
      const buildForPerson = (person) => {
        const pronounVariants = LANG.pronounVariantsForPerson(person) ?? [];
        const out = new Set();
        // Always accept the stored tgt (stripping any formality tag for leniency)
        out.add(LANG.normalizeAnswer(currentTarget));
        out.add(LANG.normalizeAnswer(currentTarget.replace(/ \((formal|informal)\)$/i, "")));
        for (const pronoun of pronounVariants) {
          if (verbObj) {
            const generated = englishFor(verbObj, currentWord.tense, pronoun);
            out.add(LANG.normalizeAnswer(generated));
            // Also accept without formality tag
            out.add(LANG.normalizeAnswer(generated.replace(/ \((formal|informal)\)$/i, "")));
          }
        }
        return Array.from(out).filter(Boolean);
      };

      // If the Spanish form is ambiguous across multiple persons, union all their variants
      if (Array.isArray(arr) && arr.length) {
        const out = new Set();
        for (const it of arr) {
          buildForPerson(it.person).forEach(x => out.add(x));
        }
        return Array.from(out);
      }

      return buildForPerson(currentWord?.person);
    })();
    // expectedList entries are already normalizeAnswer'd; compare directly
    const userNorm = LANG.normalizeAnswer(value);
    correct = expectedList.some(exp => userNorm === exp || isAnswerCorrect(value, exp));
  } else {
    correct = isAnswerCorrect(value, currentTarget);
  }


  // Build the display label for ES→EN feedback, showing ALL valid English answers.
  //
  // Two sources of multiple answers are combined systematically:
  //
  // 1. FORM AMBIGUITY: the Spanish form is shared across multiple persons
  //    (e.g. "hablaba" = yo AND él/usted in imperfect). Comes from conjugationAmbiguity map.
  //
  // 2. PRONOUN VARIANTS: a single Spanish person maps to multiple English subjects
  //    (e.g. él  -> he / she / you (formal)
  //          ellos -> they / you all (formal)
  //          conditional yo/él/ella/usted all share the same form AND he/she/you variants)
  //    Driven by _pronounVariantsForSpanishPerson — no tense-specific hardcoding needed.
  //
  // Both expansions use the existing englishFor() function so new tenses and languages
  // are handled automatically without any code changes here.
  const buildVerbFeedbackLabel = () => {
    if (!currentVerbTypingIsEsToEn) return currentTarget;

    const t = LANG.canonicalTenseKey(currentWord?.tense);
    const key = (t && currentWord?.infinitive && currentWord?.src)
      ? `${t}|${currentWord.infinitive}|${currentWord.src}` : null;

    // Step 1: collect all persons that share this Spanish form (form-ambiguity).
    // Falls back to just the current word's person if no ambiguity exists.
    const ambigArr = key ? conjugationAmbiguity.get(key) : null;
    const personsForThisForm = (Array.isArray(ambigArr) && ambigArr.length > 0)
      ? ambigArr.map(it => it.person)
      : [currentWord?.person].filter(Boolean);

    // Step 2: for each person, expand to all valid English pronoun variants.
    // _pronounVariantsForSpanishPerson returns e.g. ["he","she","you"] for él/usted,
    // ["they","you all"] for ellos/ustedes, or null for persons with a single pronoun.
    // We use the verb object so englishFor() handles irregular conjugation correctly.
    const verbWord = allWords.find(w => (w.src || w.es || w.it) === currentWord?.infinitive && w.group != null) ?? null;
    const verbObj = verbWord ? {
      id:            verbWord.id,
      infinitive:    verbWord.src || verbWord.es || verbWord.it,
      en:            verbWord.tgt || verbWord.en,
      english:       verbWord.tgt ? [verbWord.tgt] : (verbWord.en ? [verbWord.en] : []),
      group:         verbWord.group,
      overrides:     verbWord.overrides     ?? {},
      stemOverrides: verbWord.stemOverrides ?? {},
      irregularTags: verbWord.irregularTags ?? [],
      reflexive:     verbWord.reflexive,
      aux:           verbWord.aux,
      pastParticiple:verbWord.pastParticiple,
    } : null;

    const seen = new Set();
    const labels = [];

    const addLabel = (str) => {
      const s = (str || "").trim();
      if (s && !seen.has(s)) { seen.add(s); labels.push(s); }
    };

    for (const person of personsForThisForm) {
      const pronounVariants = LANG.pronounVariantsForPerson(person);

      if (!pronounVariants || pronounVariants.length <= 1) {
        // Single-pronoun person (yo, tú, nosotros, vosotros): just use stored en value.
        // vosotros maps to ["you all"] (length 1) and must never show "they" or other
        // 3p variants — using the stored en directly is both correct and safe.
        const stored = ambigArr?.find(it => it.person === person)?.tgt ?? currentWord?.tgt;
        addLabel(stored);
        continue;
      }

      // Multi-pronoun person: generate English for each concrete pronoun subject.
      for (const pronoun of pronounVariants) {
        if (verbObj) {
          // Derive via englishFor so conjugation is always correct (handles irregulars,
          // phrasal verbs, "that + subj" subjunctive, etc.).
          addLabel(englishFor(verbObj, currentWord.tense, pronoun));
        } else {
          // Fallback: swap the pronoun in the stored English string.
          const stored = ambigArr?.find(it => it.person === person)?.tgt ?? currentWord?.tgt ?? "";
          const { body } = LANG.splitPronounAndBody(stored);
          addLabel(body ? `${pronoun} ${body}` : stored);
        }
      }
    }

    return labels.length > 0 ? labels.join(" / ") : currentTarget;
  };

  if (correct) {
    verb_typing_correct(currentWord);
    feedbackDiv.textContent = `Correct! (Answer: ${buildVerbFeedbackLabel()})`;
    feedbackDiv.style.color = "green";
  } else {
    verb_typing_wrong(currentWord);
    feedbackDiv.textContent = `Wrong! Correct answer: ${buildVerbFeedbackLabel()}`;
    feedbackDiv.style.color = "red";
  }

  // Show full conjugation table for irregular verbs (current tense only)
  showIrregularVerbPanel(currentWord?.infinitive, currentWord?.tense);

  awaitContinue(() => {
    hideIrregularVerbPanel();
    currentIndex++;
    showNextVerbTyping();
  });
}

// Progressive weight decrement: gradual at first, accelerating after streak 5.
// streak 1-5: -1, streak 6-10: -2, streak 11-15: -3, streak 16+: -4
function verbWeightDecrement(streak) {
  if (streak <= 5)  return 1;
  if (streak <= 10) return 2;
  if (streak <= 15) return 3;
  return 4;
}

function verb_typing_correct(c) {
  c.typeStreak++;
  c.typeWeight = Math.max(1, c.typeWeight - verbWeightDecrement(c.typeStreak));

  // Credit ALL persons that share this same Spanish form (e.g. yo/él/usted in conditional)
  const t = LANG.canonicalTenseKey(c.tense);
  const key = (t && c.infinitive && c.src) ? `${t}|${c.infinitive}|${c.src}` : null;
  const arr = key ? conjugationAmbiguity.get(key) : null;
  if (Array.isArray(arr) && arr.length > 1) {
    arr.forEach(it => recordVerbTenseCorrect(c.tense, it.person));
    // Advance typeStreak on sibling entries so identical ES forms don't get re-asked
    for (const sibling of conjugations) {
      if (sibling !== c
          && sibling.infinitive === c.infinitive
          && sibling.tense === c.tense
          && sibling.src === c.src) {
        sibling.typeStreak = Math.max(sibling.typeStreak, c.typeStreak);
        sibling.typeWeight = Math.max(1, sibling.typeWeight - verbWeightDecrement(sibling.typeStreak));
      }
    }
  } else {
    recordVerbTenseCorrect(c.tense, c.person);
  }
}

function verb_typing_wrong(c) {
  c.typeStreak = 0;
  c.typeWeight += 2;
}

// ── Verb Transform Mode ──────────────────────────────────────────────────────

let _vtConj     = null;  // current conjugation entry
let _vtSelected = null;  // Set of selected letter indices (phase 1)

// LCS of strings a and b (both already lowercased).
// Returns { aIndices, bIndices } — parallel arrays of matched positions.
// Tie-breaks prefer skipping a (treating a-chars as removed) over skipping b,
// which ensures stem vowel substitutions are treated as removals rather than keeps.
function _vtLCS(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = 1 + dp[i+1][j+1];
      else dp[i][j] = dp[i+1][j] >= dp[i][j+1] ? dp[i+1][j] : dp[i][j+1];
    }
  }
  const ai = [], bi = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { ai.push(i); bi.push(j); i++; j++; }
    else if (dp[i+1] && dp[i+1][j] >= dp[i][j+1]) i++;
    else j++;
  }
  return { aIndices: ai, bIndices: bi };
}

// Returns validation data for phase 1.
//
// mandatoryRemovals – positions that MUST be removed (not in LCS of full baseInf vs baseSrc).
// endingPositions   – positions of the infinitive ending (-ar/-er/-ir etc.).
//                     The user may additionally remove any subset of these.
// infToSrcMap       – Map<infPos, srcPos> for all positions in the LCS (used to build
//                     phase-2 segments from whatever the user actually removed).
function _vtComputeData(conj) {
  const fullInf = conj.infinitive;
  const baseInf = fullInf.replace(/se$/i, "");

  let baseSrc = conj.src || "";
  let strippedPronoun = null;
  if (/se$/i.test(fullInf) && LANG.getReflexivePronoun) {
    const pro = LANG.getReflexivePronoun(conj.person);
    if (pro && baseSrc.toLowerCase().startsWith(pro.toLowerCase() + " ")) {
      baseSrc = baseSrc.slice(pro.length + 1);
      strippedPronoun = pro;
    }
  }

  // Italian infinitives end in -are/-ere/-ire (3 chars); Spanish in -ar/-er/-ir (2 chars).
  const endingLen   = /[aeiou]re$/i.test(baseInf) ? 3 : 2;
  const endingStart = baseInf.length - endingLen;

  const endingPositions = new Set();
  for (let i = endingStart; i < baseInf.length; i++) endingPositions.add(i);

  // LCS of full baseInf vs baseSrc (diacritic-stripped for matching).
  // Positions not in this LCS are mandatory to remove; positions in it are keepable.
  const { aIndices, bIndices } = _vtLCS(
    LANG.stripDiacritics(baseInf.toLowerCase()),
    LANG.stripDiacritics(baseSrc.toLowerCase())
  );
  const fullLCSSet = new Set(aIndices);

  const infToSrcMap = new Map();
  for (let k = 0; k < aIndices.length; k++) infToSrcMap.set(aIndices[k], bIndices[k]);

  const mandatoryRemovals = new Set();
  for (let i = 0; i < baseInf.length; i++) {
    if (!fullLCSSet.has(i)) mandatoryRemovals.add(i);
  }

  return { baseInf, baseSrc, endingPositions, mandatoryRemovals, infToSrcMap, strippedPronoun };
}

// Build phase-2 segments from whatever the user actually removed.
// Kept positions that are in infToSrcMap are aligned against baseSrc;
// gaps between their baseSrc positions become blanks the user must fill.
function _vtBuildSegments(baseInf, baseSrc, actualRemovals, infToSrcMap) {
  const keptMapped = [];
  for (let i = 0; i < baseInf.length; i++) {
    if (!actualRemovals.has(i) && infToSrcMap.has(i)) {
      keptMapped.push({ infPos: i, srcIdx: infToSrcMap.get(i) });
    }
  }

  const segments  = [];
  const blankFills = [];
  let prevSrcIdx  = -1;

  for (const { infPos, srcIdx } of keptMapped) {
    if (srcIdx > prevSrcIdx + 1) {
      blankFills.push(baseSrc.slice(prevSrcIdx + 1, srcIdx));
      segments.push({ type: 'blank', idx: blankFills.length - 1 });
    }
    segments.push({ type: 'letter', char: baseInf[infPos] });
    prevSrcIdx = srcIdx;
  }

  const trailingFill = baseSrc.slice(prevSrcIdx + 1);
  if (trailingFill) {
    blankFills.push(trailingFill);
    segments.push({ type: 'blank', idx: blankFills.length - 1 });
  }

  return { segments, blankFills };
}

function startVerbTransforming() {
  sourceCol.style.display = "none";
  targetCol.style.display = "none";
  typingArea.style.display = "none";

  const selectedTenses = getSelectedVerbTenses();
  const pool = conjugations.filter(c =>
    selectedTenses.includes(c.tense) && (c.transformStreak ?? 0) < MASTERED_STREAK
  );

  if (pool.length === 0) {
    alert("No verb conjugations available yet. Master a verb infinitive first.");
    return;
  }

  // Deduplicate by source form (same logic as verb typing)
  const seen = new Map();
  const deduped = [];
  for (const c of pool) {
    const key = `${c.tense}|${c.infinitive}|${c.src}`;
    if (!seen.has(key)) {
      seen.set(key, deduped.length);
      deduped.push(c);
    } else {
      const idx = seen.get(key);
      if ((c.transformWeight ?? 1) > (deduped[idx].transformWeight ?? 1)) deduped[idx] = c;
    }
  }

  currentRound = pickWeighted(deduped, 5, false);
  currentIndex = 0;
  showNextVerbTransform();
}

function showNextVerbTransform() {
  if (currentIndex >= currentRound.length) {
    setTimeout(startVerbTransforming, 1000);
    return;
  }
  _vtConj = currentRound[currentIndex];
  _vtSelected = new Set();
  _vtRenderSelecting("");
}

function _vtRenderSelecting(topFeedback) {
  const area = document.getElementById("verbTransformArea");
  area.style.display = "block";

  const data = _vtComputeData(_vtConj);
  const endingStart = data.endingPositions.size > 0 ? Math.min(...data.endingPositions) : data.baseInf.length;

  const stemBoxes = [...data.baseInf].slice(0, endingStart).map((ch, i) => {
    const isSel = _vtSelected.has(i);
    const display = i === 0 ? ch.toUpperCase() : ch;
    return `<div class="vt-letter${isSel ? " vt-selected" : ""}" data-vt-idx="${i}">${display}</div>`;
  }).join("");

  const endingStr = data.baseInf.slice(endingStart);
  const isEndingSel = [...data.endingPositions].some(i => _vtSelected.has(i));
  const endingBox = `<div class="vt-letter vt-ending${isEndingSel ? " vt-selected" : ""}" data-vt-ending="true">${endingStr}</div>`;

  const pronounBox = data.strippedPronoun
    ? `<div class="vt-letter vt-kept vt-pronoun">${data.strippedPronoun}</div>`
    : "";

  const letterBoxes = pronounBox + stemBoxes + endingBox;

  const vtPrompt = _vtConj.tense?.startsWith("imperative")
    ? `${_vtConj.tgt} (Command - ${_vtConj.person})`
    : _vtConj.tgt;

  const fbColor = topFeedback ? "color:#c0392b" : "";

  area.innerHTML = `
    <div class="vt-feedback-top" style="${fbColor}">${topFeedback}</div>
    <div class="vt-prompt-label">Conjugate to</div>
    <div class="vt-prompt">${vtPrompt}</div>
    <div class="vt-letter-row">${letterBoxes}</div>
    <div class="vt-btn-row">
      <button class="vt-btn" id="vtRemoveBtn">Remove</button>
      <button class="vt-btn vt-giveup-btn" id="vtGiveUpBtn">I give up</button>
    </div>
    <div class="vt-instruction">Click letters that need to change, then click Remove.<br>
      Only remove letters that actually change.</div>
  `;

  area.querySelectorAll(".vt-letter").forEach(el => {
    el.addEventListener("click", () => {
      if (el.dataset.vtEnding) {
        const { endingPositions } = _vtComputeData(_vtConj);
        const isCurrentlySel = [...endingPositions].some(i => _vtSelected.has(i));
        if (isCurrentlySel) {
          endingPositions.forEach(i => _vtSelected.delete(i));
        } else {
          endingPositions.forEach(i => _vtSelected.add(i));
        }
        el.classList.toggle("vt-selected", !isCurrentlySel);
      } else {
        const idx = parseInt(el.dataset.vtIdx, 10);
        if (_vtSelected.has(idx)) {
          _vtSelected.delete(idx);
          el.classList.remove("vt-selected");
        } else {
          _vtSelected.add(idx);
          el.classList.add("vt-selected");
        }
      }
    });
  });

  document.getElementById("vtRemoveBtn").addEventListener("click", () => {
    const { mandatoryRemovals, endingPositions, baseInf, baseSrc, infToSrcMap } = _vtComputeData(_vtConj);

    const correct =
      [...mandatoryRemovals].every(i => _vtSelected.has(i)) &&
      [..._vtSelected].every(i => mandatoryRemovals.has(i) || endingPositions.has(i));

    if (correct) {
      const { segments, blankFills } = _vtBuildSegments(baseInf, baseSrc, _vtSelected, infToSrcMap);
      _vtRenderEntering(segments, blankFills);
    } else {
      _vtSelected = new Set();
      _vtRenderSelecting("TRY AGAIN!");
    }
  });

  document.getElementById("vtGiveUpBtn").addEventListener("click", _vtGiveUp);
}

function _vtRenderEntering(segments, blankFills) {
  const area = document.getElementById("verbTransformArea");
  area.style.display = "block";

  const vtPrompt = _vtConj.tense?.startsWith("imperative")
    ? `${_vtConj.tgt} (Command - ${_vtConj.person})`
    : _vtConj.tgt;

  const { strippedPronoun } = _vtComputeData(_vtConj);
  const pronounBox = strippedPronoun
    ? `<div class="vt-letter vt-kept vt-pronoun">${strippedPronoun}</div>`
    : "";

  // Build the letter-row HTML: kept letter boxes + one <input> per blank.
  let blankCount = 0;
  const rowHTML = pronounBox + segments.map(seg => {
    if (seg.type === 'letter') {
      const display = seg.char === seg.char.toUpperCase() && segments[0] === seg
        ? seg.char.toUpperCase() : seg.char;
      return `<div class="vt-letter vt-kept">${seg.char}</div>`;
    } else {
      const id = `vtBlank${blankCount++}`;
      return `<input class="vt-replace-input" id="${id}" type="text"
                autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                data-vt-blank="${seg.idx}">`;
    }
  }).join("");

  area.innerHTML = `
    <div class="vt-feedback-top" id="vtFeedback"></div>
    <div class="vt-prompt-label">Conjugate to</div>
    <div class="vt-prompt">${vtPrompt}</div>
    <div class="vt-letter-row">${rowHTML}</div>
    <div id="vtAccentButtons" class="accent-buttons"></div>
    <div class="vt-btn-row">
      <button class="vt-btn" id="vtEnterBtn">Enter</button>
      <button class="vt-btn vt-giveup-btn" id="vtGiveUpBtn">I give up</button>
    </div>
    <div class="vt-instruction">Type the missing letters in each blank (accents optional)</div>
  `;

  // Populate accent buttons — insert into whichever blank has focus.
  const vtAccentDiv = document.getElementById("vtAccentButtons");
  if (vtAccentDiv && Array.isArray(LANG.accentButtons)) {
    LANG.accentButtons.forEach(({ ch, label }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.ch = ch;
      b.textContent = label || ch;
      vtAccentDiv.appendChild(b);
    });
    vtAccentDiv.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      const ch = b.dataset.ch || b.textContent;
      const active = area.querySelector(".vt-replace-input:focus")
                  || area.querySelector(".vt-replace-input");
      if (active) insertAtCursor(active, ch);
    });
  }

  const inputs = [...area.querySelectorAll(".vt-replace-input")];
  const btn    = document.getElementById("vtEnterBtn");
  const fbDiv  = document.getElementById("vtFeedback");

  if (inputs.length) inputs[0].focus();

  // Move focus to next input on Enter, submit on last input's Enter.
  inputs.forEach((inp, k) => {
    inp.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (k < inputs.length - 1) inputs[k + 1].focus();
      else submit();
    });
  });

  const submit = () => {
    // Check every blank matches its expected fill (accent-insensitive).
    const allCorrect = inputs.every(inp => {
      const fillIdx = parseInt(inp.dataset.vtBlank, 10);
      return LANG.normalizeAnswer(inp.value.trim()) === LANG.normalizeAnswer(blankFills[fillIdx]);
    });

    if (allCorrect) {
      verb_transform_correct(_vtConj);
      recordVerbTenseCorrect(_vtConj.tense, _vtConj.person);
      currentIndex++;
      fbDiv.style.color = "green";
      fbDiv.textContent = "CORRECT!";
      inputs.forEach(i => i.disabled = true);
      btn.disabled = true;
      showIrregularVerbPanel(_vtConj.infinitive, _vtConj.tense);
      setTimeout(() => {
        hideIrregularVerbPanel();
        showNextVerbTransform();
      }, 1500);
    } else {
      verb_transform_wrong(_vtConj);
      fbDiv.style.color = "red";
      fbDiv.innerHTML = `INCORRECT <span style="font-size:14px;font-weight:normal">— Try again!</span>`;
      inputs.forEach(i => { i.value = ""; });
      if (inputs.length) inputs[0].focus();
    }
  };

  btn.addEventListener("click", submit);
  document.getElementById("vtGiveUpBtn").addEventListener("click", _vtGiveUp);
}

function _vtGiveUp() {
  verb_transform_wrong(_vtConj);
  const area = document.getElementById("verbTransformArea");

  const vtPrompt = _vtConj.tense?.startsWith("imperative")
    ? `${_vtConj.tgt} (Command - ${_vtConj.person})`
    : _vtConj.tgt;

  area.innerHTML = `
    <div class="vt-feedback-top" style="color:#c0392b">The answer was:</div>
    <div class="vt-prompt-label">Conjugate to</div>
    <div class="vt-prompt">${vtPrompt}</div>
    <div class="vt-answer-reveal">${_vtConj.src}</div>
    <div class="vt-btn-row">
      <button class="vt-btn" id="vtContinueBtn">Continue</button>
    </div>
  `;

  document.getElementById("vtContinueBtn").addEventListener("click", () => {
    currentIndex++;
    showNextVerbTransform();
  });
}

function verb_transform_correct(c) {
  c.transformStreak = (c.transformStreak ?? 0) + 1;
  c.transformWeight = Math.max(1, (c.transformWeight ?? 15) - verbWeightDecrement(c.transformStreak));
}

function verb_transform_wrong(c) {
  c.transformStreak = 0;
  c.transformWeight = (c.transformWeight ?? 15) + 2;
}

function renderMatching() {
  const _vtArea = document.getElementById("verbTransformArea");
  if (_vtArea) _vtArea.style.display = "none";
  selectedSource = null;
  selectedTarget = null;

  sourceCol.innerHTML = "";
  targetCol.innerHTML = "";

  sourceCol.style.display = "";
  targetCol.style.display = "";
  typingArea.style.display = "none";

  console.log("Rendering matching words"); // New: Log render start

  currentRound.forEach(w =>
    sourceCol.appendChild(makeWord(w.src || w.src, "src", w))
  );

  shuffle([...currentRound]).forEach(w =>
    targetCol.appendChild(makeWord(w.tgt || w.tgt, "tgt", w))
  );

  console.log("Matching words rendered"); // New: Log render end
  placeEndingsButton();
}

function renderTyping() {
  const _vtArea = document.getElementById("verbTransformArea");
  if (_vtArea) _vtArea.style.display = "none";
  sourceCol.style.display = "none";
  targetCol.style.display = "none";
  typingArea.style.display = "block";
  // Reset any leftover disabled state from a previous awaitContinue
  _waitingForContinue = false;
  translationInput.disabled = false;
  submitTranslation.disabled = false;
  if (continueBtn) continueBtn.style.display = "none";

  currentIndex = 0;
  feedbackDiv.textContent = "";
  showNextTyping();

  // Set up event listeners for typing
  submitTranslation.onclick = () => safeCall(handleTypingSubmit, "typing submit");
  translationInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      safeCall(handleTypingSubmit, "typing submit (Enter)");
    }
  };
}

function showNextTyping() {
  if (currentIndex >= currentRound.length) {
    const isMixed = modeSelect.value === "mixed-mode";
    setTimeout(isMixed ? startMixedRound : startNextRound, 1000);
    return;
  }

  const w = currentRound[currentIndex];
  const isEsToEn = Math.random() < 0.5;
  if (isEsToEn) {
    promptDiv.textContent = `Type the ${LANG.targetLang} for: ${w.src}`;
    currentTarget = w.tgt;
  } else {
    promptDiv.textContent = `Type the ${LANG.sourceLang} for: ${w.tgt}`;

const nf = LANG.getNounForms(w);
if (nf) {
  let target;

  if (LANG.nounRequiresPluralForMastery(w)) {
    // force missing form first (irregular class)
    if (!w.noun_typing_singular_ok) target = nf.singular;
    else if (!w.noun_typing_plural_ok) target = nf.plural;
    else target = Math.random() < 0.5 ? nf.singular : nf.plural;
  } else {
    // standard m/f nouns: plural not required, but can appear
    target = Math.random() < 0.5 ? nf.singular : nf.plural;
  }

  currentTarget = target;

  const { word, gender } = LANG.nounTypingHint(w, nf, target);
  promptDiv.textContent = gender
    ? `Type the ${LANG.sourceLang} for: the ${word} (${gender})`
    : `Type the ${LANG.sourceLang} for: the ${word}`;
} else {
  currentTarget = w.src;
}

  }
  currentWord = w;
  translationInput.value = "";
  translationInput.focus();
  feedbackDiv.textContent = "";
}



function removeParentheticals(s) {
  // "to know (facts)" -> "to know"
  return String(s ?? "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function expandSlashVariants(s) {
  const raw = String(s ?? "").trim();

  // If no slash, just return the original
  if (!raw.includes("/")) return [raw];

  // Split on / and trim pieces
  const parts = raw.split("/").map(p => p.trim()).filter(Boolean);

  // Accept each part alone
  const variants = [...parts];

  // Also accept the full string in either order (only meaningful for 2 parts)
  if (parts.length === 2) {
    variants.push(`${parts[0]}/${parts[1]}`);
    variants.push(`${parts[1]}/${parts[0]}`);
  } else {
    // For >2 parts, accept the raw full string as-is too
    variants.push(raw);
  }

  return variants;
}


function handleTypingSubmit() {
  if (_waitingForContinue) return;
  const value = translationInput.value.trim();

  // --- Regular typing mode ---
  const correct = isAnswerCorrect(value, currentTarget);

  if (correct) {
    typing_correct(currentWord);

    // noun singular/plural mastery tracking (unchanged)
    const nf = LANG.getNounForms(currentWord);
    if (nf) {
      if (LANG.normalizeAnswer(currentTarget) === LANG.normalizeAnswer(nf.singular)) {
        currentWord.noun_typing_singular_ok = true;
      }
      if (LANG.normalizeAnswer(currentTarget) === LANG.normalizeAnswer(nf.plural)) {
        currentWord.noun_typing_plural_ok = true;
      }
    }

    feedbackDiv.textContent = `Correct! (Answer: ${currentTarget})`;
    feedbackDiv.style.color = "green";
  } else {
    typing_wrong(currentWord);
    feedbackDiv.textContent = `Wrong! The correct translation is ${currentTarget}`;
    feedbackDiv.style.color = "red";
  }

  awaitContinue(() => {
    currentIndex++;
    showNextTyping();
  });
}


// --- SAFETY: typing submission should never break UI ---
function safeCall(fn, contextLabel = "action") {
  try {
    fn();
  } catch (err) {
    console.error(`Error during ${contextLabel}:`, err);
    // Show something to the user instead of silently breaking input
    if (feedbackDiv) {
      feedbackDiv.textContent = "Something went wrong. Check the console for details.";
      feedbackDiv.style.color = "red";
    }
  }
}


function makeWord(text, lang, wordDetails) {
  const d = document.createElement("div");
  d.className = "word";
  d.textContent = text;
  d.dataset.lang = lang;
  d.onclick = () => select(d);
  d.word = wordDetails;
  return d;
}

function select(div) {
  if (div.classList.contains("matched")) return;

  if (div.dataset.lang === "src") {
    if (selectedSource) selectedSource.classList.remove("selected");
    selectedSource = div;
  } else {
    if (selectedTarget) selectedTarget.classList.remove("selected");
    selectedTarget = div;
  }

  div.classList.add("selected");
  check();
}

function check() {
  if (!selectedSource || !selectedTarget) return;

 const isVerb = !!selectedSource.word.tense; // conjugations have tense/person

const sWord = selectedSource.word;
const eWord = selectedTarget.word;

// ✅ Rule 1: exact same entry still counts
const sameEntry = sWord === eWord;

// ✅ Rule 2: allow duplicate Spanish strings to be interchangeable (your “la” rule)
const sameSourceSurface = sWord?.src && eWord?.src && norm(sWord.src) === norm(eWord.src);

// ✅ Rule 3 (optional): allow matching if the English tile is a synonym of the selected word’s English
// (This only matters if you start rendering synonyms on tiles later)
const englishOverlap =
  !!(sWord && eWord && (
    buildAcceptedSetForWord(sWord, "tgt").has(norm(eWord.tgt || "")) ||
    buildAcceptedSetForWord(eWord, "tgt").has(norm(sWord.tgt || ""))
  ));
  // ✅ Rule: for verb tiles, allow matching across persons if English surface matches and tense+infinitive match.
  // This lets "you all ..." match ustedes or vosotros when English is ambiguous.
  const sameVerbMeaning =
    !!(isVerb &&
       sWord && eWord &&
       sWord.tense && eWord.tense &&
       sWord.infinitive && eWord.infinitive &&
       LANG.canonicalTenseKey(sWord.tense) === LANG.canonicalTenseKey(eWord.tense) &&
       norm(sWord.infinitive) === norm(eWord.infinitive) &&
       norm(sWord.tgt || "") === norm(eWord.tgt || ""));


if (sameEntry || sameSourceSurface || englishOverlap || sameVerbMeaning) {
  // Update UI first so a stats/unlock error can't break visual feedback
  selectedSource.classList.add("matched");
  selectedTarget.classList.add("matched");

  try {
    if (isVerb) {
      verb_match_correct(selectedSource.word);
    } else {
      correct(selectedSource.word);
    }
  } catch (err) {
    console.error("Post-match update failed:", err);
  }
} else {
  try {
    if (isVerb) {
      verb_match_wrong(selectedSource.word);
    } else {
      wrong(selectedSource.word);
    }
  } catch (err) {
    console.error("Post-mismatch update failed:", err);
  }
}

  // Show full conjugation table for irregular verbs after any verb match/mismatch (current tense only)
  if (isVerb) {
    showIrregularVerbPanel(sWord?.infinitive, sWord?.tense);
  }

  // Always clear selection state
  selectedSource.classList.remove("selected");
  selectedTarget.classList.remove("selected");
  selectedSource = selectedTarget = null;

  // Changed: Dynamic based on currentRound.length (handles <5 words)
  if (document.querySelectorAll(".matched").length === currentRound.length * 2) {
    const mode = modeSelect.value;
    const verbPanel = document.getElementById("irregularVerbPanel");
    const tableVisible = verbPanel && verbPanel.style.display === "block";
setTimeout(() => {
  hideIrregularVerbPanel();
  if (mode === "mixed-mode") startMixedRound();
  else if (mode === "verb-match") startVerbMatching();
  else startNextRound();
}, tableVisible ? 3500 : 600);

  }
}

function correct(w) {
  w.streak++;
  w.weight = Math.max(1, w.weight - 1);
  w.lastSeen = Date.now();


  // New: If just mastered in matching, unlock a new word
  if (w.streak === MASTERED_STREAK) {
    unlockNewWord();
  }

  save();
  updateStats();
  buildConjugationPool();
  unlockVerbModes();

}

function wrong(w) {
  w.streak = 0;
  w.misses++;
  w.weight += 2;
  save();
}

function typing_correct(w) {
  if (!w) {
    console.warn("typing_correct called with empty word");
    return;
  }
w.typing_streak++;
  w.typing_weight = Math.max(1, w.typing_weight - 1);
  w.typing_lastSeen = Date.now();

  // New: If just mastered in typing, unlock a new word
  if (w.typing_streak === MASTERED_STREAK) {
    unlockNewWord();
  }

  save();
  updateStats();
  buildConjugationPool();
  unlockVerbModes();

}

function typing_wrong(w) {
  if (!w) {
    console.warn("typing_wrong called with empty word");
    return;
  }
w.typing_streak = 0;
  w.typing_misses++;
  w.typing_weight += 2;
  save();
}
function verb_match_correct(c) {
  c.matchStreak++;
  recordVerbTenseCorrect(c.tense, c.person);
  c.matchWeight = Math.max(1, c.matchWeight - verbWeightDecrement(c.matchStreak));
}

function verb_match_wrong(c) {
  c.matchStreak = 0;
  c.matchWeight += 2;
}

function isVerbUnlocked(verb) {
  // verb can be a merged allWords entry (has .src) or a verbObj built in buildConjugationPool.
  const inf = verb.infinitive || verb.src || verb.es || "";
  const infinitiveWords = allWords.filter(w => (w.src || w.es) === inf);

  return infinitiveWords.length > 0 &&
    infinitiveWords.every(w =>
      w.quickStartUnlocked ||
      (w.streak >= MASTERED_STREAK && w.typing_streak >= MASTERED_STREAK)
    );
}


function pickWeighted(pool, n, useTypingWeight = false) {
  if (pool.length === 0) return []; // Early return if no words

  // New: If pool is smaller than n, just return all unique words (shuffled)
  if (pool.length < n) {
    return shuffle([...pool]);
  }

  const bag = [];
  pool.forEach(w => {
    const wt = useTypingWeight
  ? (w.typing_weight ?? w.typeWeight ?? 1)
  : (w.weight ?? w.matchWeight ?? 1);

    for (let i = 0; i < wt; i++) bag.push(w);
  });

  const set = new Set();
  while (set.size < n && bag.length) {
    set.add(bag[Math.floor(Math.random() * bag.length)]);
  }
  return [...set];
}
function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const value = input.value;

  input.value = value.slice(0, start) + text + value.slice(end);
  input.selectionStart = input.selectionEnd = start + text.length;
  input.focus();
}

function updateStats() {
  // Defensive: older HTML versions may not have these panels.
  if (!stats) return;
  // --- Word mastery counters ---
  const matchingMastered = allWords.filter(w => w.streak >= MASTERED_STREAK).length;
  const typingMastered = allWords.filter(w => w.typing_streak >= MASTERED_STREAK).length;

  // stats div is now unused — mastery div holds all counters
  stats.innerHTML = "";


  // --- Unlock rules (these match your current code) ---
  const TYPING_UNLOCK_MATCHING_MASTERED = 20; // startNextRound() blocks typing until 20 :contentReference[oaicite:7]{index=7}

  // --- Verb mastery counters (only if verbs/conjugations exist in your build) ---
  const verbWords = allWords.filter(w => w.pos === "verb" && w.group != null);
  const verbsTotal = verbWords.length;
  const verbsUnlockedCount = verbWords.filter(w => isVerbUnlocked(w)).length;

  let verbMatchMastered = 0;
  let verbTypeMastered = 0;

  if (Array.isArray(conjugations)) {
    verbMatchMastered = conjugations.filter(c => c.matchStreak >= MASTERED_STREAK).length;
    verbTypeMastered = conjugations.filter(c => c.typeStreak >= MASTERED_STREAK).length;
  }


  // --- Verb tense progression (global) ---
  const verbTenseProgress = ensureVerbTenseProgressInit();
  const unlockedTenses = verbTenseProgress.unlockedTenses || [LANG.tenseOrder[0]];
  const tenseCounts = getVerbTenseCountsSummary();

  // Determine which tense to show in the left progress panel.
  // This panel is meant to show your overall "next to learn" tense (not necessarily the dropdown selection).
  // We pick the earliest unlocked tense that is NOT mastered yet; if all unlocked tenses are mastered,
  // we show the latest unlocked tense.
  const unlockedSet = new Set(unlockedTenses);
  const unlockedInOrder = Array.isArray(LANG.tenseOrder)
    ? LANG.tenseOrder.filter(t => unlockedSet.has(t))
    : unlockedTenses.slice();

  let panelTense = unlockedInOrder[0] || LANG.tenseOrder[0];
  for (const t of unlockedInOrder) {
    if (!isTenseMastered(t)) { panelTense = t; break; }
    panelTense = t;
  }

  // If the previous unlocked tense is mastered, show an "unlocked" message.
  const panelIdx = unlockedInOrder.indexOf(panelTense);
  const prevTense = panelIdx > 0 ? unlockedInOrder[panelIdx - 1] : null;

  const tenseHeaderText = (prevTense && isTenseMastered(prevTense))
    ? `${LANG.formatTenseLabel(prevTense)} progress has unlocked ${LANG.formatTenseLabel(panelTense)}`
    : `${LANG.formatTenseLabel(panelTense)} Progress`;

  const reqPersons = LANG.requiredPersonsForTense(panelTense);
  const tenseProgressLine = reqPersons
    .map(p => `${p}: ${(tenseCounts[panelTense]?.[p] ?? 0)}/${TENSE_UNLOCK_THRESHOLD}`)
    .join(" • ");
  if (!mastery) return;

  const unlockedWords = allWords.filter(w => w.unlocked).length;

  const row = (label, value) => `
    <div style="margin-top:12px;">
      <div style="font-weight:700;">${label}</div>
      <div style="margin-top:2px;">${value}</div>
    </div>`;

  mastery.innerHTML =
    row("Matching Mastered",    `${matchingMastered}/${allWords.length}`) +
    row("Typing Mastered",      `${typingMastered}/${matchingMastered}`) +
    row("Unlocked Words",       `${unlockedWords}/${allWords.length}`) +
    row("Infinitives Unlocked", `${verbsUnlockedCount}/${verbsTotal}`);
}


// Fields that come from words_es.json — no need to store in localStorage
const STATIC_WORD_FIELDS = new Set([
  // Strip these — they come from words_es.json, not from saved progress
  // NOTE: 'src' is NOT in this set — it's the key mergeProgress uses to match saved words
  'tgt', 'src_syn', 'tgt_syn',
  'es', 'it', 'en', 'en_syn', 'es_syn', 'it_syn',
  'pos', 'rating', 'level', 'id',
  'noun_class', 'noun_override',
  'notes', 'gender_pair_id', 'reverseConstruction',
  'group', 'overrides', 'stemOverrides', 'irregularTags',
  'reflexive', 'aux', 'pastParticiple',
]);

function slimProgress(words) {
  // Only save progress-state fields, and only for words that have any non-default progress.
  // Static data (en, pos, synonyms, etc.) is re-hydrated from words_es.json on load.
  return words
    .filter(w =>
      w.unlocked ||
      w.streak > 0 || w.misses > 0 ||
      w.typing_streak > 0 || w.typing_misses > 0 ||
      w.noun_typing_singular_ok || w.noun_typing_plural_ok
    )
    .map(w => {
      const slim = {};
      for (const k of Object.keys(w)) {
        if (!STATIC_WORD_FIELDS.has(k)) slim[k] = w[k];
      }
      return slim;
    });
}

function save() {
  try {
    localStorage.setItem(`progress_${LANG.id}`, JSON.stringify(slimProgress(allWords)));
  } catch (e) {
    // If still too large (e.g. huge vocabulary + lots of progress), warn but don't crash
    console.warn("localStorage quota exceeded — progress not saved:", e.message);
  }
  scheduleSaveToGist();
}

function shuffle(a) {
  return a.sort(() => Math.random() - 0.5);
}




// NOTE: English conjugation moved to englishConjugation.js (systematic rules + minimal irregulars)

/* EXPORT / IMPORT */
// exportButton removed from UI

// importInput removed from UI

function routeModeChange() {
  const mode = modeSelect.value;

  // Clear mixed-mode sub-pick when user explicitly changes mode
  if (mode !== "mixed-mode") _mixedModeCurrentPick = null;

  updateTenseSelectorVisibility();

  updateFilterVisibility();
  if (mode === "mixed-mode") {
    startMixedRound();
    return;
  }

  if (mode === "verb-match") {
    startVerbMatching();
    return;
  }

  if (mode === "verb-type") {
    startVerbTyping();
    return;
  }

  if (mode === "verb-transform") {
    startVerbTransforming();
    return;
  }

  // default: word modes
  startNextRound();
}

// ── Mixed Mode ──────────────────────────────────────────────────────────────
// Randomly picks from all modes (weighted), skipping modes with empty pools.

const MIXED_MODE_WEIGHTS = [
  { mode: "all",        weight: 5   },   // Matching
  { mode: "typing",     weight: 4.5 },   // Typing
  { mode: "verb-match", weight: 3.5 },   // Verb Matching
  { mode: "review",     weight: 2   },   // Review
  { mode: "verb-type",  weight: 1   },   // Verb Typing
];

function mixedModeHasPool(mode) {
  const level = document.getElementById("level").value;
  const matchingMastered = allWords.filter(w => w.streak >= MASTERED_STREAK).length;
  const quickStartActive = allWords.filter(w => w.quickStart && w.unlocked).length >= 20;

  if (mode === "all") {
    const pool = allWords.filter(w => {
      if (level === "all") return true;
      if (level === "verbs") return isVerbInfinitiveWord(w);
      return w.level === level;
    }).filter(w => w.streak < MASTERED_STREAK);
    return pool.length > 0;
  }

  if (mode === "typing") {
    if (matchingMastered < 20 && !quickStartActive) return false;
    const pool = allWords.filter(w => {
      if (level === "all") return true;
      if (level === "verbs") return isVerbInfinitiveWord(w);
      return w.level === level;
    }).filter(w => quickStartActive
      ? (w.unlocked && !isTypingMasteredWord(w))
      : (w.streak >= MASTERED_STREAK && !isTypingMasteredWord(w))
    );
    return pool.length > 0;
  }

  if (mode === "review") {
    const pool = allWords.filter(w => {
      if (level === "all") return true;
      if (level === "verbs") return isVerbInfinitiveWord(w);
      return w.level === level;
    }).filter(w => w.streak >= MASTERED_STREAK);
    return pool.length > 0;
  }

  if (mode === "verb-match") {
    const selectedTenses = getSelectedVerbTenses();
    const pool = conjugations.filter(c => selectedTenses.includes(c.tense) && c.matchStreak < MASTERED_STREAK);
    return pool.length > 0;
  }

  if (mode === "verb-type") {
    const selectedTenses = getSelectedVerbTenses();
    const pool = conjugations.filter(c => selectedTenses.includes(c.tense) && c.typeStreak < MASTERED_STREAK);
    return pool.length > 0;
  }

  return false;
}

function pickMixedMode() {
  // Filter to modes that have available words, then weighted random pick
  const available = MIXED_MODE_WEIGHTS.filter(m => mixedModeHasPool(m.mode));
  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * totalWeight;
  for (const m of available) {
    r -= m.weight;
    if (r <= 0) return m.mode;
  }
  return available[available.length - 1].mode;
}

function startMixedRound() {
  const picked = pickMixedMode();
  if (!picked) {
    alert("No words available for any mode. Try changing settings or resetting progress.");
    return;
  }

  // Track the current sub-mode so other functions can detect verb modes in mixed
  _mixedModeCurrentPick = picked;

  const isVerbMode = picked === "verb-match" || picked === "verb-type";

  // For verb sub-modes in mixed: force tense selector to "mixed" so all unlocked
  // tenses are used, not just whatever it was last set to.
  if (isVerbMode && tenseSelect) {
    // Ensure "mixed" option exists
    const hasMixed = Array.from(tenseSelect.options).some(o => o.value === "mixed");
    if (hasMixed) {
      tenseSelect.value = "mixed";
    }
  }

  // Show/hide tense selector
  if (tenseSelect) {
    const wrapper = tenseSelect.closest(".control") || tenseSelect.parentElement;
    if (wrapper) wrapper.style.display = isVerbMode ? "" : "none";
  }

  // Show/hide conjugation table button
  const endingsBtn = document.getElementById("showEndingsBtn");
  if (endingsBtn) endingsBtn.style.display = isVerbMode ? "inline-flex" : "none";

  if (picked === "verb-match") {
    startVerbMatching();
  } else if (picked === "verb-type") {
    startVerbTyping();
  } else {
    // Temporarily set the mode value so startNextRound reads the right mode,
    // then restore it to mixed-mode afterward.
    const realMode = modeSelect.value;
    modeSelect.value = picked;
    startNextRound();
    modeSelect.value = realMode;
  }
}

levelSelect.onchange = routeModeChange;
modeSelect.onchange = routeModeChange;
