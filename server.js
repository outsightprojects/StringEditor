const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const ROOT = __dirname;
const LOCALE_DIR = path.join(ROOT, "locales");
const STATE_FILE = path.join(ROOT, "translation-state.json");
const SOURCE_LANGUAGE = "en";
const TARGET_LANGUAGES = ["de", "fr"];
const ALL_LANGUAGES = [SOURCE_LANGUAGE, ...TARGET_LANGUAGES];
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const HOST = "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fsp.rename(tempPath, filePath);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > 12 * 1024 * 1024) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function loadLocales() {
  const entries = await Promise.all(
    ALL_LANGUAGES.map(async (language) => {
      const filePath = path.join(LOCALE_DIR, `${language}.json`);
      return [language, await readJson(filePath)];
    })
  );
  return Object.fromEntries(entries);
}

function defaultState() {
  return {
    version: 1,
    updatedAt: null,
    languages: Object.fromEntries(TARGET_LANGUAGES.map((language) => [language, {}]))
  };
}

function normalizeState(input) {
  const base = defaultState();
  if (!input || typeof input !== "object") {
    return base;
  }

  const languages = { ...base.languages };
  if (input.languages && typeof input.languages === "object") {
    for (const language of TARGET_LANGUAGES) {
      const languageState = input.languages[language];
      languages[language] =
        languageState && typeof languageState === "object" ? languageState : {};
    }
  }

  return {
    version: 1,
    updatedAt: input.updatedAt || null,
    languages
  };
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/data") {
    const [locales, state] = await Promise.all([
      loadLocales(),
      readJson(STATE_FILE, defaultState()).then(normalizeState)
    ]);

    sendJson(res, 200, {
      sourceLanguage: SOURCE_LANGUAGE,
      targetLanguages: TARGET_LANGUAGES,
      locales,
      state
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/save") {
    const payload = JSON.parse(await readBody(req));
    assertObject(payload, "Save payload");
    assertObject(payload.locales, "locales");

    const writes = [];
    for (const language of TARGET_LANGUAGES) {
      assertObject(payload.locales[language], `${language}.json`);
      writes.push(writeJsonAtomic(path.join(LOCALE_DIR, `${language}.json`), payload.locales[language]));
    }

    const state = normalizeState(payload.state);
    state.updatedAt = new Date().toISOString();
    writes.push(writeJsonAtomic(STATE_FILE, state));

    await Promise.all(writes);
    sendJson(res, 200, { ok: true, state });
    return;
  }

  const exportMatch = url.pathname.match(/^\/api\/export\/([a-z]{2})$/);
  if (req.method === "GET" && exportMatch) {
    const language = exportMatch[1];
    if (!ALL_LANGUAGES.includes(language)) {
      sendJson(res, 404, { error: "Unknown language." });
      return;
    }

    const filePath = path.join(LOCALE_DIR, `${language}.json`);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${language}.json"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[extension] || "application/octet-stream"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error." });
  }
});

function listen(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      listen(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, HOST, () => {
    const address = server.address();
    console.log(`Translation Workbench running at http://${HOST}:${address.port}`);
  });
}

listen(DEFAULT_PORT);
