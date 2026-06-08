import { readFileSync } from "node:fs";

const LOCALES = {
  en: JSON.parse(readFileSync(new URL("../locales/en.json", import.meta.url), "utf8")),
  de: JSON.parse(readFileSync(new URL("../locales/de.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../locales/fr.json", import.meta.url), "utf8"))
};

function json(payload, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

export function GET() {
  return json({
    sourceLanguage: "en",
    targetLanguages: ["de", "fr"],
    persistence: "browser",
    locales: LOCALES,
    state: {
      version: 1,
      updatedAt: null,
      languages: {
        de: {},
        fr: {}
      }
    }
  });
}
