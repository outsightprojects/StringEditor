const fsp = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const MIME_TYPES = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/styles.css": "text/css; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8"
};

async function readText(relativePath) {
  return fsp.readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function main() {
  await fsp.rm(DIST, { recursive: true, force: true });
  await fsp.mkdir(path.join(DIST, "server"), { recursive: true });
  await fsp.mkdir(path.join(DIST, "client"), { recursive: true });
  await fsp.mkdir(path.join(DIST, ".openai"), { recursive: true });

  const indexHtml = await readText("index.html");
  const styles = await readText("styles.css");
  const appJs = await readText("app.js");
  const hosting = await readText(".openai/hosting.json");
  const locales = {
    en: await readJson("locales/en.json"),
    de: await readJson("locales/de.json"),
    fr: await readJson("locales/fr.json")
  };

  const worker = `const ASSETS = ${JSON.stringify({
    "/": indexHtml,
    "/index.html": indexHtml,
    "/styles.css": styles,
    "/app.js": appJs
  })};

const MIME_TYPES = ${JSON.stringify(MIME_TYPES)};
const LOCALES = ${JSON.stringify(locales)};
const EMPTY_STATE = {
  version: 1,
  updatedAt: null,
  languages: {
    de: {},
    fr: {}
  }
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/data") {
      return json({
        sourceLanguage: "en",
        targetLanguages: ["de", "fr"],
        persistence: "browser",
        locales: LOCALES,
        state: EMPTY_STATE
      });
    }

    if (request.method === "POST" && url.pathname === "/api/save") {
      return json({
        ok: true,
        persistence: "browser",
        state: {
          ...EMPTY_STATE,
          updatedAt: new Date().toISOString()
        }
      });
    }

    const asset = ASSETS[url.pathname];
    if (asset !== undefined) {
      return new Response(asset, {
        headers: {
          "content-type": MIME_TYPES[url.pathname] || "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    return new Response("Not found", { status: 404 });
  }
};
`;

  await fsp.writeFile(path.join(DIST, "server", "index.js"), worker, "utf8");
  await fsp.writeFile(path.join(DIST, "client", "README.txt"), "Static assets are embedded in dist/server/index.js.\n", "utf8");
  await fsp.writeFile(path.join(DIST, ".openai", "hosting.json"), hosting, "utf8");

  console.log("Built hosted worker in dist/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
