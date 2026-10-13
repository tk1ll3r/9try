import { language, languages, setLanguage } from "../i18n";

/** Vietnamese or English, each under its own name. Choosing the other one loads the app again in it. */
export function LanguageSwitch({ label }: { label: string }) {
  return <div role="group" aria-label={label} className="flex gap-1 rounded-2xl bg-[var(--soft)] p-1">
    {languages.map(([code, name]) => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => { if (code !== language) setLanguage(code); }}
      className={`flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${language === code ? "bg-[var(--surface)] text-[var(--ink)] shadow" : "text-[var(--muted)]"}`}>
      {name}
    </button>)}
  </div>;
}
