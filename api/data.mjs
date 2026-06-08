import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readLocale(language) {
  return JSON.parse(readFileSync(join(ROOT, "locales", `${language}.json`), "utf8"));
}

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
    locales: {
      en: readLocale("en"),
      de: readLocale("de"),
      fr: readLocale("fr")
    },
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
