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
