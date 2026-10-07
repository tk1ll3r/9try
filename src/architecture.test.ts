import { describe, expect, it } from "vitest";

// The layering rules of docs/architecture.md, checked on every import under src/.
const sources = import.meta.glob<string>("./**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

/** "modules/tasks/domain/Task.ts" + "../../../kernel/dates" gives "kernel/dates". Packages stay as written. */
function resolveImport(file: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const parts = file.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

const isUiOrBackendPackage = (target: string) => /^(react|react-dom|react-router-dom|@tanstack\/|@supabase\/)/.test(target);

/** The rule an import breaks, or undefined when it is allowed. */
function brokenRule(file: string, target: string): string | undefined {
  const [area, name, layer] = file.split("/");
  const otherModule = /^modules\/([^/]+)\/(?!index$)/.exec(target);

  if ((area === "kernel" || area === "shared") && /^(modules|features|app|bootstrap)\//.test(target)) return "shared code must not depend on features";
  if (area === "features" && target.startsWith("app/")) return "features must not import the composition root";
  if (area === "features" && otherModule) return "import a module only through its index.ts";
  if (area !== "modules") return undefined;

  if (/^(features|app|bootstrap)\//.test(target)) return "modules must not import legacy features or the composition root";
  if (otherModule && otherModule[1] !== name) return "import another module only through its index.ts";
  const sameModule = (layers: string) => new RegExp(`^modules/${name}/(${layers})/`).test(target);
  if (layer === "domain" && (isUiOrBackendPackage(target) || sameModule("application|infrastructure|presentation"))) return "domain depends on nothing but shared domain code";
  if (layer === "application" && (isUiOrBackendPackage(target) || sameModule("infrastructure|presentation"))) return "application talks to interfaces, not to React or Supabase";
  if (layer === "presentation" && (target.startsWith("@supabase/") || sameModule("infrastructure"))) return "presentation never imports infrastructure";
  return undefined;
}

// Old code that still breaks a rule. Entries may only be removed.
const knownDebt = [
  "shared/infrastructure/AppData.ts -> features/calendars/infrastructure/CalendarData",
  "shared/infrastructure/AppData.ts -> features/home/domain/upcoming",
  "shared/infrastructure/AppData.test.ts -> features/calendars/infrastructure/CalendarData",
];

const found = Object.entries(sources).flatMap(([path, code]) => {
  const file = path.slice(2);
  return [...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].flatMap(([, specifier]) => {
    const target = resolveImport(file, specifier);
    const rule = brokenRule(file, target);
    return rule ? [{ edge: `${file} -> ${target}`, rule }] : [];
  });
});

describe("architecture", () => {
  it("has no new layering violations", () => {
    expect(found.filter(({ edge }) => !knownDebt.includes(edge))).toEqual([]);
  });
  it("lists only debt that still exists", () => {
    expect(knownDebt.filter(edge => !found.some(item => item.edge === edge))).toEqual([]);
  });
});
