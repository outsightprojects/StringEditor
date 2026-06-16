export function resolveUploadedLanguage(filename, supportedLanguages) {
  const normalized = filename.toLowerCase();
  const matches = supportedLanguages.filter((language) => {
    const pattern = new RegExp(`(^|[^a-z])${language}([^a-z]|$)`, "i");
    return pattern.test(normalized);
  });

  if (matches.length === 1) {
    return matches[0];
  }

  throw new Error(`Use a filename that includes one of: ${supportedLanguages.join(", ")}.`);
}

export function parseUploadedLocaleFile(filename, text, supportedLanguages) {
  const language = resolveUploadedLanguage(filename, supportedLanguages);
  let locale;

  try {
    locale = JSON.parse(text);
  } catch {
    throw new Error(`${filename} must contain valid JSON.`);
  }

  if (!locale || typeof locale !== "object" || Array.isArray(locale)) {
    throw new Error(`${filename} must contain a JSON object.`);
  }

  return { language, locale };
}

export function canEditLanguage(language, baseUnlocked) {
  return language !== "en" || Boolean(baseUnlocked);
}

function stableSerialize(value) {
  if (value === undefined) {
    return '"__undefined__"';
  }

  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

function hashText(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function createLocaleBundleSignature(locales, supportedLanguages) {
  const bundle = {};

  for (const language of supportedLanguages) {
    bundle[language] = locales?.[language] ?? null;
  }

  const serialized = stableSerialize(bundle);
  return `locale-v1-${hashText(serialized)}-${serialized.length.toString(36)}`;
}

export function isStoredBundleCompatible(storedBundle, currentSignature) {
  return Boolean(currentSignature && storedBundle?.dataSignature === currentSignature);
}
