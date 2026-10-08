import { describe, expect, it } from "vitest";
import { translate } from "./kernel/i18n";
import { en } from "./kernel/locales/en";
import { serverTexts } from "./modules/notifications/domain/serverTexts";

// The app is written in Vietnamese and every text goes through t("…"), which a dictionary translates.
// These checks keep that whole: nothing a person reads may be missing from a dictionary or bypass t().
const sources = import.meta.glob<string>("./**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const vietnamese = /[À-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
const call = /\bt\(\s*"((?:[^"\\]|\\.)*)"/g;
const places = (text: string) => new Set([...text.matchAll(/\{(\d+)\}/g)].map(match => match[1]));

// The code of the app: no tests, no dictionaries, and not the language module, which names the languages in their own words.
const app = Object.entries(sources).filter(([path]) => !/\.test\.|\/kernel\/locales\/|\/kernel\/i18n\.ts$/.test(path));
const used = new Set([...serverTexts, ...app.flatMap(([, code]) => [...code.matchAll(call)].map(match => JSON.parse(`"${match[1]}"`) as string))]);

describe("English", () => {
  it("has every text of the app", () => {
    // A text made of places and punctuation only reads the same in every language.
    const needsWords = (text: string) => /\p{L}/u.test(text.replace(/\{\d+\}/g, ""));
    expect([...used].filter(text => needsWords(text) && !(text in en))).toEqual([]);
  });
  it("has nothing the app no longer says", () => {
    expect(Object.keys(en).filter(text => !used.has(text))).toEqual([]);
  });
  it("fills only the places a text has", () => {
    // The month's name is an extra value that the Vietnamese title does not show.
    const extra: Record<string, string[]> = { "Tháng {0}, {1}": ["2"] };
    const wrong = Object.entries(en).filter(([text, translation]) => translation.split("|").some(form =>
      [...places(form)].some(place => !places(text).has(place) && !extra[text]?.includes(place))));
    expect(wrong).toEqual([]);
  });
});

describe("text in the code", () => {
  it("is Vietnamese only inside t(…), so that no screen keeps a text another language cannot replace", () => {
    // Three files hold Vietnamese that is not shown as it stands: the letter that search treats as "d",
    // what a typed timetable may say, and what the database writes.
    const exempt = /\/kernel\/text\.ts$|\/calendar\/domain\/timetable\.ts$|\/notifications\/domain\/serverTexts\.ts$/;
    const left = app.filter(([path]) => !exempt.test(path)).flatMap(([path, code]) => code
      .replace(call, 't("')
      .replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ""))
      .split("\n").map((line, index) => [line.replace(/(^|\s)\/\/.*$/, ""), index + 1] as const)
      .filter(([line]) => vietnamese.test(line)).map(([line, number]) => `${path}:${number}: ${line.trim().slice(0, 80)}`));
    expect(left).toEqual([]);
  });
});

describe("translating", () => {
  const words = { "Lưu": "Save", "{0} tin chưa đọc": "{0} unread message|{0} unread messages", "Tháng {0}, {1}": "{2} {1}" };
  it("gives the text in the other language, and the text itself where there is none", () => {
    expect(translate(words, "Lưu", [])).toBe("Save");
    expect(translate(words, "Hủy", [])).toBe("Hủy");
    expect(translate({}, "Xóa {0} khỏi nhóm?", ["Kha"])).toBe("Xóa Kha khỏi nhóm?");
  });
  it("puts values in their places, in the order the language wants, and picks one or many by the first", () => {
    expect(translate(words, "Tháng {0}, {1}", [10, 2026, "October"])).toBe("October 2026");
    expect([1, 2, 0].map(count => translate(words, "{0} tin chưa đọc", [count]))).toEqual(["1 unread message", "2 unread messages", "0 unread messages"]);
    expect(translate({}, "{0}{1} xong", [3, undefined])).toBe("3 xong");
  });
});
