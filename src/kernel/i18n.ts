/**
 * The app is written in Vietnamese. Another language is a dictionary from the Vietnamese text to
 * that language, in `locales/`. The language is fixed for as long as a page lives: changing it
 * loads the app again, so text that a file computes once, when it is loaded, is right as well.
 */
export type Language = "vi" | "en";

/** Each language under its own name, as the switch shows it. */
export const languages: [Language, string][] = [["vi", "Tiếng Việt"], ["en", "English"]];

// index.html has no say here: the app starts in Vietnamese until someone chooses otherwise on this device.
const key = "gnouht-language";
function kept(): Language {
  try { return localStorage.getItem(key) === "en" ? "en" : "vi"; } catch { return "vi"; }
}

/** Unit tests load this file outside a browser and get Vietnamese. */
export const language: Language = typeof localStorage === "undefined" ? "vi" : kept();

/** For dates, times and numbers. English gets the day before the month and a 24-hour clock, as Vietnamese has. */
export const locale = language === "en" ? "en-GB" : "vi-VN";

let words: Record<string, string> = {};

/** Loads the words of the chosen language. The app waits for this before it shows anything. */
export async function loadLanguage(): Promise<void> {
  if (language === "en") words = (await import("./locales/en")).en;
  document.documentElement.lang = language;
}

/**
 * `text` in the language of `words`, with `values` in its numbered places. A translation written as
 * "one|many" picks by the first value. A value that is missing leaves its place empty, as it does on
 * a screen. A text that `words` does not have is given back as it is written.
 */
export function translate(words: Record<string, string>, text: string, values: readonly (string | number | null | undefined)[]): string {
  let found = words[text] ?? text;
  if (found !== text && found.includes("|")) {
    const [one, many] = found.split("|");
    found = values[0] === 1 ? one : many;
  }
  return values.length ? found.replace(/\{(\d+)\}/g, (_place, index) => String(values[Number(index)] ?? "")) : found;
}

/**
 * A text in the chosen language. The Vietnamese text is the key: `t("Lưu")`. Values go into the
 * numbered places: `t("Xóa {0} khỏi nhóm?", name)`.
 */
export function t(text: string, ...values: (string | number | null | undefined)[]): string {
  return translate(words, text, values);
}

/** Keeps the choice on this device and loads the app again in that language. */
export function setLanguage(next: Language): void {
  try {
    localStorage.setItem(key, next);
  } catch { return; } // Without storage the choice could not survive the reload.
  window.location.reload();
}
