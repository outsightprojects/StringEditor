import assert from "node:assert/strict";
import test from "node:test";

import {
  canEditLanguage,
  createLocaleBundleSignature,
  isStoredBundleCompatible,
  parseUploadedLocaleFile,
  resolveUploadedLanguage
} from "../workbench-utils.mjs";

const supportedLanguages = ["en", "de", "fr"];

test("resolveUploadedLanguage detects supported locale filenames", () => {
  assert.equal(resolveUploadedLanguage("en.json", supportedLanguages), "en");
  assert.equal(resolveUploadedLanguage("strings.de.json", supportedLanguages), "de");
  assert.equal(resolveUploadedLanguage("MusicBash-FR.JSON", supportedLanguages), "fr");
});

test("resolveUploadedLanguage rejects unsupported filenames", () => {
  assert.throws(
    () => resolveUploadedLanguage("es.json", supportedLanguages),
    /Use a filename that includes one of: en, de, fr/
  );
});

test("parseUploadedLocaleFile returns a language and JSON object", () => {
  const parsed = parseUploadedLocaleFile("de.json", "{\"APP\":{\"TITLE\":\"Hallo\"}}", supportedLanguages);

  assert.equal(parsed.language, "de");
  assert.deepEqual(parsed.locale, { APP: { TITLE: "Hallo" } });
});

test("parseUploadedLocaleFile rejects invalid JSON and arrays", () => {
  assert.throws(() => parseUploadedLocaleFile("de.json", "{", supportedLanguages), /valid JSON/);
  assert.throws(() => parseUploadedLocaleFile("de.json", "[]", supportedLanguages), /JSON object/);
});

test("canEditLanguage keeps English locked unless base editing is unlocked", () => {
  assert.equal(canEditLanguage("de", false), true);
  assert.equal(canEditLanguage("fr", false), true);
  assert.equal(canEditLanguage("en", false), false);
  assert.equal(canEditLanguage("en", true), true);
});

test("createLocaleBundleSignature is stable across object key order", () => {
  const left = {
    en: { notifications: { follow: "Follow", daily: ["A", "B"] } },
    de: { notifications: { follow: "Folgen" } }
  };
  const right = {
    de: { notifications: { follow: "Folgen" } },
    en: { notifications: { daily: ["A", "B"], follow: "Follow" } }
  };

  assert.equal(createLocaleBundleSignature(left, supportedLanguages), createLocaleBundleSignature(right, supportedLanguages));
});

test("isStoredBundleCompatible rejects old browser saves without the current dataset signature", () => {
  const currentSignature = createLocaleBundleSignature(
    {
      en: { notifications: { follow: "Follow" } },
      de: { notifications: { follow: "Folgen" } },
      fr: { notifications: { follow: "Suivre" } }
    },
    supportedLanguages
  );

  assert.equal(isStoredBundleCompatible({ locales: {}, state: {} }, currentSignature), false);
  assert.equal(isStoredBundleCompatible({ dataSignature: "old", locales: {}, state: {} }, currentSignature), false);
  assert.equal(isStoredBundleCompatible({ dataSignature: currentSignature, locales: {}, state: {} }, currentSignature), true);
});
