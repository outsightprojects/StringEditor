import {
  canEditLanguage,
  createLocaleBundleSignature,
  isStoredBundleCompatible,
  parseUploadedLocaleFile
} from "./workbench-utils.mjs";

const STATUS_META = {
  base_string: { label: "Base string", className: "status-base_string" },
  final: { label: "Final", className: "status-final" },
  needs_review: { label: "Needs review", className: "status-needs_review" },
  same_as_source: { label: "Same as EN", className: "status-same_as_source" },
  missing: { label: "Missing", className: "status-missing" },
  empty: { label: "Empty", className: "status-empty" },
  placeholder_issue: { label: "Placeholder issue", className: "status-placeholder_issue" },
  extra_key: { label: "Extra key", className: "status-extra_key" }
};

const FILTERS = [
  ["all", "All strings"],
  ["blocking", "Blocking issues"],
  ["needs_review", "Needs review"],
  ["final", "Final"],
  ["missing", "Missing"],
  ["empty", "Empty"],
  ["placeholder_issue", "Placeholder issue"],
  ["same_as_source", "Same as English"],
  ["extra_key", "Extra keys"]
];

const LOCAL_DRAFT_KEY = "musicbash.translationWorkbench.draft.v3";
const LOCAL_SAVED_KEY = "musicbash.translationWorkbench.saved.v3";
const BASE_UNLOCK_KEY = "musicbash.translationWorkbench.baseUnlocked.v1";

const app = {
  sourceLanguage: "en",
  targetLanguages: [],
  languages: [],
  activeLanguage: "de",
  persistence: "server",
  baseUnlocked: sessionStorage.getItem(BASE_UNLOCK_KEY) === "true",
  unlockMessage: "English base strings are locked.",
  locales: {},
  dataSignature: "",
  state: { version: 1, updatedAt: null, languages: {} },
  flatCache: {},
  rowsByLanguage: {},
  selectedKey: null,
  search: "",
  filter: "all",
  group: "all",
  dirty: false,
  saveMessage: "No local changes"
};

const root = document.querySelector("#app");
let rootClickBound = false;

init();

async function init() {
  try {
    const response = await fetch("/api/data");
    if (!response.ok) {
      throw new Error(`Could not load locale data (${response.status}).`);
    }

    const payload = await response.json();
    app.sourceLanguage = payload.sourceLanguage;
    app.targetLanguages = payload.targetLanguages;
    app.languages = [app.sourceLanguage, ...app.targetLanguages];
    app.activeLanguage = app.targetLanguages[0];
    app.persistence = payload.persistence || "server";
    app.locales = payload.locales;
    app.dataSignature = createLocaleBundleSignature(payload.locales, app.languages);
    app.state = normalizeState(payload.state);

    restoreSavedState();
    restoreDraft();
    rebuildCaches();
    chooseInitialRow();
    render();
  } catch (error) {
    renderBootError(error);
  }
}

function renderBootError(error) {
  root.innerHTML = `
    <div class="boot">
      <h1>MusicBash Translation Workbench</h1>
      <p>${escapeHtml(error.message)}</p>
      <p>Start it with <code>node server.js</code>, then open the localhost URL printed in Terminal.</p>
    </div>
  `;
}

function normalizeState(input) {
  const state = {
    version: 1,
    updatedAt: input?.updatedAt || null,
    languages: {}
  };

  for (const language of app.targetLanguages.length ? app.targetLanguages : ["de", "fr"]) {
    state.languages[language] =
      input?.languages?.[language] && typeof input.languages[language] === "object"
        ? input.languages[language]
        : {};
  }

  return state;
}

function restoreDraft() {
  const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
  if (!raw) {
    return;
  }

  try {
    const draft = JSON.parse(raw);
    if (!draft || !draft.dirty) {
      return;
    }

    if (draft.locales && draft.state) {
      if (!isStoredBundleCompatible(draft, app.dataSignature)) {
        localStorage.removeItem(LOCAL_DRAFT_KEY);
        app.saveMessage = "Ignored stale browser draft after locale update";
        return;
      }

      app.locales = draft.locales;
      app.state = normalizeState(draft.state);
      app.dirty = true;
      app.saveMessage = "Restored unsaved browser draft";
    }
  } catch {
    localStorage.removeItem(LOCAL_DRAFT_KEY);
  }
}

function restoreSavedState() {
  if (app.persistence !== "browser") {
    return;
  }

  const raw = localStorage.getItem(LOCAL_SAVED_KEY);
  if (!raw) {
    return;
  }

  try {
    const saved = JSON.parse(raw);
    if (saved?.locales && saved?.state) {
      if (!isStoredBundleCompatible(saved, app.dataSignature)) {
        localStorage.removeItem(LOCAL_SAVED_KEY);
        app.saveMessage = "Ignored stale browser save after locale update";
        return;
      }

      app.locales = saved.locales;
      app.state = normalizeState(saved.state);
      app.saveMessage = saved.savedAt
        ? `Loaded browser save from ${new Date(saved.savedAt).toLocaleString()}`
        : "Loaded browser save";
    }
  } catch {
    localStorage.removeItem(LOCAL_SAVED_KEY);
  }
}

function saveDraft() {
  localStorage.setItem(
    LOCAL_DRAFT_KEY,
    JSON.stringify({
      dirty: app.dirty,
      dataSignature: app.dataSignature,
      locales: app.locales,
      state: app.state
    })
  );
}

function saveBrowserState(savedAt) {
  localStorage.setItem(
    LOCAL_SAVED_KEY,
    JSON.stringify({
      savedAt,
      dataSignature: app.dataSignature,
      locales: app.locales,
      state: app.state
    })
  );
}

function rebuildCaches() {
  app.flatCache = Object.fromEntries(
    Object.entries(app.locales).map(([language, locale]) => [language, flatten(locale)])
  );

  app.rowsByLanguage = Object.fromEntries(
    app.languages.map((language) => [language, buildRows(language)])
  );
}

function flatten(value, prefix = "", output = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, output);
    } else {
      output[path] = child == null ? "" : String(child);
    }
  }

  return output;
}

function setNestedValue(target, keyPath, value) {
  const parts = keyPath.split(".");
  let current = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

function buildRows(language) {
  const sourceFlat = app.flatCache[app.sourceLanguage] || {};
  const targetFlat = app.flatCache[language] || {};
  const allKeys = Array.from(new Set([...Object.keys(sourceFlat), ...Object.keys(targetFlat)])).sort();

  return allKeys.map((key) => {
    const source = sourceFlat[key];
    const targetExists = Object.prototype.hasOwnProperty.call(targetFlat, key);
    const target = targetExists ? targetFlat[key] : "";
    const entry = readEntry(language, key);
    const sourceTokens = extractTokens(source || "");
    const targetTokens = extractTokens(target || "");
    const isSourceLanguage = language === app.sourceLanguage;
    const tokenMismatch = !isSourceLanguage && !sameTokenList(sourceTokens, targetTokens);
    const missing = !targetExists;
    const empty = targetExists && target.trim() === "";
    const extra = source === undefined && targetExists;
    const sameAsSource =
      !isSourceLanguage && targetExists && source !== undefined && target === source && target.trim() !== "";
    const blocking = missing || empty || tokenMismatch;
    const status = computeStatus({
      entry,
      missing,
      empty,
      tokenMismatch,
      extra,
      sameAsSource
    });

    return {
      key,
      group: key.split(".")[0],
      source: source || "",
      target,
      targetExists,
      sourceTokens,
      targetTokens,
      tokenMismatch,
      missing,
      empty,
      extra,
      sameAsSource,
      blocking,
      status,
      note: entry.note || "",
      isFinal: entry.status === "final" && !blocking
    };
  });
}

function computeStatus({ entry, missing, empty, tokenMismatch, extra, sameAsSource }) {
  if (missing) return "missing";
  if (empty) return "empty";
  if (tokenMismatch) return "placeholder_issue";
  if (extra) return "extra_key";
  if (entry.status === "base_string") return "base_string";
  if (entry.status === "final") return "final";
  if (sameAsSource) return "same_as_source";
  return "needs_review";
}

function extractTokens(value) {
  const matches = String(value).matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
  return Array.from(matches, (match) => match[1].trim()).sort();
}

function sameTokenList(left, right) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function readEntry(language, key) {
  if (language === app.sourceLanguage) {
    return { status: "base_string", note: "" };
  }
  return app.state.languages[language]?.[key] || { status: "needs_review", note: "" };
}

function ensureEntry(language, key) {
  if (language === app.sourceLanguage) {
    return { status: "base_string", note: "" };
  }
  app.state.languages[language] ||= {};
  app.state.languages[language][key] ||= { status: "needs_review", note: "" };
  return app.state.languages[language][key];
}

function compactState() {
  for (const language of app.targetLanguages) {
    const languageState = app.state.languages[language] || {};
    for (const [key, entry] of Object.entries(languageState)) {
      if (entry.status !== "final" && !entry.note) {
        delete languageState[key];
      }
    }
  }
}

function statsFor(language) {
  const rows = app.rowsByLanguage[language] || [];
  const stats = {
    total: rows.length,
    final: 0,
    needs_review: 0,
    same_as_source: 0,
    missing: 0,
    empty: 0,
    placeholder_issue: 0,
    extra_key: 0,
    base_string: 0,
    blocking: 0
  };

  for (const row of rows) {
    stats[row.status] += 1;
    if (row.blocking) {
      stats.blocking += 1;
    }
  }

  stats.percent = stats.total ? Math.round((stats.final / stats.total) * 100) : 0;
  return stats;
}

function rowsForActiveFilters() {
  const rows = app.rowsByLanguage[app.activeLanguage] || [];
  const query = app.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (app.group !== "all" && row.group !== app.group) {
      return false;
    }

    if (app.filter === "blocking" && !row.blocking) {
      return false;
    }

    if (app.filter !== "all" && app.filter !== "blocking" && row.status !== app.filter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      row.key.toLowerCase().includes(query) ||
      row.source.toLowerCase().includes(query) ||
      row.target.toLowerCase().includes(query) ||
      row.note.toLowerCase().includes(query)
    );
  });
}

function chooseInitialRow() {
  const rows = rowsForActiveFilters();
  if (!app.selectedKey || !rows.some((row) => row.key === app.selectedKey)) {
    app.selectedKey = rows[0]?.key || null;
  }
}

function rowByKey(language, key) {
  return (app.rowsByLanguage[language] || []).find((row) => row.key === key) || null;
}

function groupsForActiveLanguage() {
  const groups = new Set((app.rowsByLanguage[app.activeLanguage] || []).map((row) => row.group));
  return Array.from(groups).sort();
}

function render() {
  chooseInitialRow();
  const activeStats = statsFor(app.activeLanguage);
  const visibleRows = rowsForActiveFilters();
  const selected = rowByKey(app.activeLanguage, app.selectedKey);

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <h1>Translation Workbench</h1>
          <p>Review MusicBash locale JSON by key, language, and completion status.</p>
        </div>
        <div class="language-stack">
          ${app.languages.map(renderLanguageCard).join("")}
        </div>
        <div class="save-panel">
          ${renderUnlockPanel()}
          <div class="save-actions">
            <button class="primary" data-action="save-all">Save all</button>
            <button data-action="download-language" ${canDownloadActiveLanguage() ? "" : "disabled"}>Download ${app.activeLanguage.toUpperCase()}</button>
            <button data-action="open-upload">Upload JSON</button>
          </div>
          <input class="file-input" type="file" accept="application/json,.json" multiple data-role="upload-input">
          <p>${escapeHtml(app.saveMessage)}</p>
          <p>${renderSaveScope()}</p>
        </div>
      </aside>
      <main class="main">
        <div class="main-header">
          <div>
            <h2>${app.activeLanguage === app.sourceLanguage ? "EN base" : `${app.activeLanguage.toUpperCase()} review`}</h2>
            <p>${visibleRows.length} visible of ${activeStats.total} strings.</p>
          </div>
          <div class="status-strip">
            ${renderStatChip("Final", activeStats.final)}
            ${renderStatChip("Blocking", activeStats.blocking)}
            ${renderStatChip("Same as EN", activeStats.same_as_source)}
            ${app.activeLanguage === app.sourceLanguage ? renderStatChip("Base strings", activeStats.base_string) : renderStatChip("Needs review", activeStats.needs_review)}
          </div>
        </div>
        <div class="toolbar">
          <input id="search" value="${escapeAttribute(app.search)}" placeholder="Search keys or text">
          <select id="filter">
            ${FILTERS.map(([value, label]) => `<option value="${value}" ${value === app.filter ? "selected" : ""}>${label}</option>`).join("")}
          </select>
          <select id="group">
            <option value="all">All groups</option>
            ${groupsForActiveLanguage().map((group) => `<option value="${escapeAttribute(group)}" ${group === app.group ? "selected" : ""}>${escapeHtml(group)}</option>`).join("")}
          </select>
        </div>
        ${renderTable(visibleRows)}
      </main>
      <aside class="inspector">
        ${selected ? renderInspector(selected) : `<div class="inspector-empty">No string selected.</div>`}
      </aside>
    </div>
  `;

  bindEvents();
}

function renderUnlockPanel() {
  if (app.activeLanguage !== app.sourceLanguage) {
    return "";
  }

  if (app.baseUnlocked) {
    return `<div class="unlock-panel is-unlocked">EN editing unlocked for this session.</div>`;
  }

  return `
    <div class="unlock-panel">
      <label for="basePassword">Unlock EN base editing</label>
      <div class="unlock-row">
        <input id="basePassword" type="password" autocomplete="current-password" placeholder="Password">
        <button data-action="unlock-base">Unlock</button>
      </div>
      <p>${escapeHtml(app.unlockMessage)}</p>
    </div>
  `;
}

function canDownloadActiveLanguage() {
  return app.activeLanguage !== app.sourceLanguage || app.baseUnlocked;
}

function renderSaveScope() {
  if (app.persistence === "browser") {
    return "Online saves stay in this browser. Use downloads to share edited JSON files.";
  }

  return "Saved changes update <code>locales/en.json</code>, <code>locales/de.json</code>, <code>locales/fr.json</code>, and <code>translation-state.json</code>.";
}

function renderLanguageCard(language) {
  const stats = statsFor(language);
  const isSource = language === app.sourceLanguage;
  return `
    <button class="language-card ${language === app.activeLanguage ? "is-active" : ""}" data-action="switch-language" data-language="${language}">
      <div class="language-card-title">
        <strong>${language.toUpperCase()}</strong>
        <span>${isSource ? (app.baseUnlocked ? "unlocked" : "locked") : `${stats.percent}% final`}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="--progress: ${isSource ? 100 : stats.percent}%"></div>
      </div>
      <div class="metric-grid">
        ${isSource ? `
          <div class="metric"><strong>${stats.total}</strong><span>base strings</span></div>
          <div class="metric"><strong>${stats.empty}</strong><span>empty</span></div>
          <div class="metric"><strong>${app.baseUnlocked ? "Yes" : "No"}</strong><span>editable</span></div>
          <div class="metric"><strong>EN</strong><span>source</span></div>
        ` : `
          <div class="metric"><strong>${stats.final}</strong><span>final</span></div>
          <div class="metric"><strong>${stats.blocking}</strong><span>blocking</span></div>
          <div class="metric"><strong>${stats.same_as_source}</strong><span>same as EN</span></div>
          <div class="metric"><strong>${stats.needs_review}</strong><span>review</span></div>
        `}
      </div>
    </button>
  `;
}

function renderStatChip(label, value) {
  return `<span class="chip"><strong>${value}</strong>${escapeHtml(label)}</span>`;
}

function renderTable(rows) {
  if (!rows.length) {
    return `<div class="table-wrap"><div class="inspector-empty">No strings match the current filters.</div></div>`;
  }

  return `
    <div class="table-wrap">
      <table class="translation-table">
        <thead>
          <tr>
            <th class="col-key">Key</th>
            <th class="col-source">English</th>
            <th class="col-target">${app.activeLanguage.toUpperCase()}</th>
            <th class="col-status">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRow(row) {
  const meta = STATUS_META[row.status];
  return `
    <tr data-action="select-row" data-key="${escapeAttribute(row.key)}" class="${row.key === app.selectedKey ? "is-selected" : ""}">
      <td class="col-key"><span class="key-path">${escapeHtml(row.key)}</span></td>
      <td class="col-source"><span class="preview">${escapeHtml(row.source)}</span></td>
      <td class="col-target">${renderPreview(row.target, row.missing)}</td>
      <td class="col-status"><span class="status-badge ${meta.className}">${meta.label}</span></td>
    </tr>
  `;
}

function renderPreview(value, missing) {
  if (missing) {
    return `<span class="empty-preview">Missing key</span>`;
  }
  if (!value.trim()) {
    return `<span class="empty-preview">Empty value</span>`;
  }
  return `<span class="preview">${escapeHtml(value)}</span>`;
}

function renderInspector(row) {
  const entry = readEntry(app.activeLanguage, row.key);
  const issues = issuesFor(row);
  const isSource = app.activeLanguage === app.sourceLanguage;
  const editable = canEditLanguage(app.activeLanguage, app.baseUnlocked);
  const canMarkFinal = !isSource && !row.blocking;

  return `
    <div class="editor-key">
      <span>Key</span>
      <code>${escapeHtml(row.key)}</code>
    </div>
    <div class="field">
      <label>English source</label>
      <div class="source-box">${escapeHtml(row.source || "No English source for this key.")}</div>
      ${renderTokens("Source placeholders", row.sourceTokens)}
    </div>
    <div class="field">
      <label for="targetText">${isSource ? "EN base string" : `${app.activeLanguage.toUpperCase()} translation`}</label>
      <textarea id="targetText" data-action="edit-target" ${editable ? "" : "disabled"}>${escapeHtml(row.target)}</textarea>
      ${renderTokens("Target placeholders", row.targetTokens)}
    </div>
    ${!editable ? `<div class="issue-list"><div class="issue blocking">Unlock EN editing with the password before changing base strings.</div></div>` : ""}
    ${issues.length ? `<div class="issue-list">${issues.join("")}</div>` : ""}
    ${isSource ? "" : `<label class="final-toggle">
      <input type="checkbox" data-action="toggle-final" ${row.isFinal ? "checked" : ""} ${canMarkFinal ? "" : "disabled"}>
      <span>Mark this string as final</span>
    </label>`}
    <div class="editor-actions">
      <button data-action="copy-source">Copy English</button>
      ${isSource ? "" : `<button data-action="mark-needs-review">Needs review</button>`}
    </div>
    ${isSource ? "" : `<div class="field">
      <label for="noteText">Review note</label>
      <textarea id="noteText" class="note-input" data-action="edit-note" placeholder="Optional translator note">${escapeHtml(entry.note || "")}</textarea>
    </div>`}
  `;
}

function renderTokens(label, tokens) {
  if (!tokens.length) {
    return "";
  }

  return `
    <div class="tokens" aria-label="${escapeAttribute(label)}">
      ${tokens.map((token) => `<span class="token">{{${escapeHtml(token)}}}</span>`).join("")}
    </div>
  `;
}

function issuesFor(row) {
  const issues = [];

  if (row.missing) {
    issues.push(`<div class="issue blocking">This key does not exist in ${app.activeLanguage.toUpperCase()} yet.</div>`);
  }

  if (row.empty) {
    issues.push(`<div class="issue blocking">The translation is empty.</div>`);
  }

  if (row.tokenMismatch) {
    issues.push(`
      <div class="issue blocking">
        Placeholder mismatch. English has ${formatTokens(row.sourceTokens)}; target has ${formatTokens(row.targetTokens)}.
      </div>
    `);
  }

  if (row.sameAsSource && !row.isFinal) {
    issues.push(`<div class="issue review">Target text matches English. Mark final only if this is intentional.</div>`);
  }

  if (row.extra) {
    issues.push(`<div class="issue review">This key exists in ${app.activeLanguage.toUpperCase()} but not in English.</div>`);
  }

  return issues;
}

function formatTokens(tokens) {
  return tokens.length ? tokens.map((token) => `{{${escapeHtml(token)}}}`).join(", ") : "none";
}

function bindEvents() {
  root.querySelector("#search")?.addEventListener("input", (event) => {
    app.search = event.target.value;
    render();
  });

  root.querySelector("#filter")?.addEventListener("change", (event) => {
    app.filter = event.target.value;
    render();
  });

  root.querySelector("#group")?.addEventListener("change", (event) => {
    app.group = event.target.value;
    render();
  });

  if (!rootClickBound) {
    root.addEventListener("click", handleClick);
    rootClickBound = true;
  }

  const targetEditor = root.querySelector("[data-action='edit-target']");
  targetEditor?.addEventListener("input", handleTargetInput);
  targetEditor?.addEventListener("blur", () => {
    rebuildCaches();
    render();
  });

  root.querySelector("[data-action='edit-note']")?.addEventListener("input", handleNoteInput);
  root.querySelector("[data-action='toggle-final']")?.addEventListener("change", handleFinalToggle);
  root.querySelector("[data-role='upload-input']")?.addEventListener("change", handleUploadInput);
}

function handleClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;

  if (action === "switch-language") {
    app.activeLanguage = actionTarget.dataset.language;
    app.group = "all";
    app.filter = "all";
    app.selectedKey = null;
    render();
    return;
  }

  if (action === "select-row") {
    app.selectedKey = actionTarget.dataset.key;
    render();
    return;
  }

  if (action === "save-all") {
    saveAll();
    return;
  }

  if (action === "download-language") {
    if (!canDownloadActiveLanguage()) {
      app.saveMessage = "Unlock EN before downloading the base strings.";
      render();
      return;
    }
    downloadLanguage(app.activeLanguage);
    return;
  }

  if (action === "open-upload") {
    root.querySelector("[data-role='upload-input']")?.click();
    return;
  }

  if (action === "unlock-base") {
    unlockBaseEditing();
    return;
  }

  if (action === "copy-source") {
    const row = rowByKey(app.activeLanguage, app.selectedKey);
    if (row) {
      updateTarget(row.source);
      render();
    }
    return;
  }

  if (action === "mark-needs-review") {
    const entry = ensureEntry(app.activeLanguage, app.selectedKey);
    entry.status = "needs_review";
    markDirty("Marked as needs review");
    render();
  }
}

function handleTargetInput(event) {
  updateTarget(event.target.value);
}

function updateTarget(value) {
  if (!canEditLanguage(app.activeLanguage, app.baseUnlocked)) {
    app.saveMessage = "Unlock EN before editing base strings.";
    render();
    return;
  }
  setNestedValue(app.locales[app.activeLanguage], app.selectedKey, value);
  if (app.activeLanguage !== app.sourceLanguage) {
    const entry = ensureEntry(app.activeLanguage, app.selectedKey);
    if (entry.status === "final") {
      entry.status = "needs_review";
    }
  }
  markDirty("Unsaved translation changes");
}

function handleNoteInput(event) {
  const entry = ensureEntry(app.activeLanguage, app.selectedKey);
  entry.note = event.target.value;
  markDirty("Unsaved review note");
}

function handleFinalToggle(event) {
  const row = rowByKey(app.activeLanguage, app.selectedKey);
  if (!row || row.blocking) {
    return;
  }

  const entry = ensureEntry(app.activeLanguage, app.selectedKey);
  entry.status = event.target.checked ? "final" : "needs_review";
  markDirty(event.target.checked ? "Marked as final" : "Marked as needs review");
  rebuildCaches();
  render();
}

function markDirty(message) {
  app.dirty = true;
  app.saveMessage = message;
  saveDraft();
}

async function saveAll() {
  compactState();
  app.saveMessage = "Saving...";
  render();

  try {
    if (app.persistence === "browser") {
      const savedAt = new Date().toISOString();
      app.state.updatedAt = savedAt;
      saveBrowserState(savedAt);
      app.dirty = false;
      app.saveMessage = `Saved in this browser ${new Date(savedAt).toLocaleString()}`;
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      rebuildCaches();
      render();
      return;
    }

    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locales: Object.fromEntries(app.languages.map((language) => [language, app.locales[language]])),
        state: app.state
      })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Save failed (${response.status}).`);
    }

    const body = await response.json();
    app.state = normalizeState(body.state);
    app.dirty = false;
    app.saveMessage = `Saved ${new Date(app.state.updatedAt).toLocaleString()}`;
    localStorage.removeItem(LOCAL_DRAFT_KEY);
    rebuildCaches();
    render();
  } catch (error) {
    app.saveMessage = error.message;
    app.dirty = true;
    saveDraft();
    render();
  }
}

async function unlockBaseEditing() {
  const passwordInput = root.querySelector("#basePassword");
  const password = passwordInput?.value || "";
  app.unlockMessage = "Checking password...";
  render();

  try {
    const response = await fetch("/api/unlock-base", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.unlocked) {
      throw new Error(body.error || "Incorrect password.");
    }

    app.baseUnlocked = true;
    sessionStorage.setItem(BASE_UNLOCK_KEY, "true");
    app.unlockMessage = "EN editing unlocked.";
    app.saveMessage = "EN editing unlocked for this browser session";
    rebuildCaches();
    render();
  } catch (error) {
    app.baseUnlocked = false;
    sessionStorage.removeItem(BASE_UNLOCK_KEY);
    app.unlockMessage = error.message;
    app.saveMessage = error.message;
    render();
  }
}

async function handleUploadInput(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  const uploaded = [];
  const errors = [];

  for (const file of files) {
    try {
      const parsed = parseUploadedLocaleFile(file.name, await file.text(), app.languages);
      if (parsed.language === app.sourceLanguage && !app.baseUnlocked) {
        throw new Error("Unlock EN before uploading English base strings.");
      }
      app.locales[parsed.language] = parsed.locale;
      if (app.state.languages[parsed.language]) {
        app.state.languages[parsed.language] = {};
      }
      uploaded.push(parsed.language.toUpperCase());
    } catch (error) {
      errors.push(`${file.name}: ${error.message}`);
    }
  }

  event.target.value = "";

  if (uploaded.length) {
    rebuildCaches();
    app.selectedKey = null;
    markDirty(`Uploaded ${uploaded.join(", ")} JSON`);
  }

  if (errors.length) {
    app.saveMessage = errors.join(" ");
  }

  render();
}

function downloadLanguage(language) {
  const blob = new Blob([`${JSON.stringify(app.locales[language], null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${language}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

window.addEventListener("beforeunload", (event) => {
  if (!app.dirty) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});
