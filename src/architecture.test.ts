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

// React, the router, the query cache and Supabase, as packages or as the kernel files built on them.
const isUiOrBackend = (target: string) => /^(react|react-dom|react-router-dom|@tanstack\/|@supabase\/|kernel\/(auth|realtime|session|supabase|useAction|ui\/))/.test(target);

/** The rule an import breaks, or undefined when it is allowed. */
function brokenRule(file: string, target: string): string | undefined {
  const [area, name, layer] = file.split("/");
  const otherModule = /^modules\/([^/]+)\/(?!index$)/.exec(target);

  if (area === "kernel" && /^(modules|app)\//.test(target)) return "the kernel must not depend on features";
  if (area !== "modules") return undefined;

  if (target.startsWith("app/")) return "modules must not import the composition root";
  if (otherModule && otherModule[1] !== name) return "import another module only through its index.ts";
  const sameModule = (layers: string) => new RegExp(`^modules/${name}/(${layers})/`).test(target);
  if (layer === "domain" && (isUiOrBackend(target) || sameModule("application|infrastructure|presentation"))) return "domain depends on nothing but plain kernel code";
  if (layer === "application" && (isUiOrBackend(target) || sameModule("infrastructure|presentation"))) return "application talks to interfaces, not to React or Supabase";
  if (layer === "presentation" && (/^(@supabase\/|kernel\/supabase$)/.test(target) || sameModule("infrastructure"))) return "presentation never talks to Supabase";
  return undefined;
}

// Old code that still breaks a rule. Entries may only be removed.
const knownDebt: string[] = [];

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
