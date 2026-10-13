// Builds the two map styles of the app, public/map/light.json and public/map/dark.json, from
// OpenFreeMap's Positron style (scripts/map/positron.json) by giving every color in it a color made
// of the app's own tokens, which are read from src/styles.css. Tiles, fonts and sprites stay
// OpenFreeMap's. Run it again when a token changes:
//   node scripts/build-map-style.mjs            writes the two files
//   node scripts/build-map-style.mjs --check    writes nothing; fails when the files are out of date
//   node scripts/build-map-style.mjs --fetch    takes a new copy of Positron first
// It stops when Positron has a color this table does not know, or no longer has one it does: then
// the table below needs a line, and the result a look.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const sourcePath = `${root}scripts/map/positron.json`;
const sourceUrl = "https://tiles.openfreemap.org/styles/positron";

/** The tokens of one look: the first `:root` block of the stylesheet, or the dark one. */
function tokens(css, look) {
  const start = look === "dark" ? css.indexOf(':root[data-theme="dark"]') : css.indexOf(":root {");
  if (start < 0) throw new Error(`src/styles.css has no tokens for the ${look} look`);
  const found = {};
  for (const [, name, value] of css.slice(start, css.indexOf("}", start)).matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) found[name] = value;
  return found;
}
const channels = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
const hex = parts => `#${parts.map(part => Math.round(part).toString(16).padStart(2, "0")).join("")}`;

/** The colors of one look. `mix(a, b, share)` is `share` of token `a` in token `b`; `clear` is a token let through. */
function palette(look, token) {
  const of = name => { if (!token[name]) throw new Error(`src/styles.css has no --${name} for the ${look} look`); return channels(token[name]); };
  const mix = (a, b, share) => hex(of(a).map((part, at) => part * share + of(b)[at] * (1 - share)));
  const clear = (name, alpha) => `rgba(${of(name).join(",")},${alpha})`;
  return look === "light" ? {
    land: token.paper, built: mix("soft", "paper", .5), building: token.soft, buildingEdge: token.border,
    park: mix("lime", "paper", .18), wood: mix("lime", "paper", .26), water: token["map-water"], ice: token.surface,
    road: token.surface, casing: token.border, minor: mix("border", "paper", .6), path: mix("border", "paper", .45), faint: clear("border", .7),
    rail: mix("border", "paper", .7), railDash: token.surface, airfield: token.surface, boundary: mix("muted", "paper", .45),
    name: mix("ink", "muted", .55), label: token.muted, quiet: mix("muted", "paper", .78), waterName: mix("map-water", "ink", .45), halo: clear("paper", .8),
  } : {
    // In the dark look the lighter of the two is --soft, so the roads take it and the houses take --surface.
    land: token.paper, built: mix("surface", "paper", .6), building: token.surface, buildingEdge: mix("border", "surface", .35),
    park: mix("lime-strong", "paper", .14), wood: mix("lime-strong", "paper", .19), water: token["map-water"], ice: token.soft,
    road: mix("border", "soft", .55), casing: token.paper, minor: token.soft, path: mix("soft", "paper", .55), faint: clear("border", .6),
    rail: mix("border", "paper", .6), railDash: token.paper, airfield: token.soft, boundary: mix("muted", "paper", .4),
    name: mix("ink", "muted", .45), label: token.muted, quiet: mix("muted", "paper", .75), waterName: mix("map-water", "ink", .45), halo: clear("paper", .85),
  };
}

// Every color Positron uses, without spaces, and what it is on the map.
const shapes = {
  "rgb(242,243,240)": "land", "rgb(234,234,230)": "built", "rgb(234,234,229)": "building", "rgb(219,219,218)": "buildingEdge",
  "rgb(230,233,229)": "park", "rgb(220,224,220)": "wood", "rgb(194,200,202)": "water", "hsl(195,17%,78%)": "water", "hsl(0,0%,98%)": "ice",
  "#fff": "road", "rgb(213,213,213)": "casing", "hsl(0,0%,88%)": "minor", "rgb(234,234,234)": "path",
  "hsla(0,0%,85%,0.69)": "faint", "hsla(0,0%,85%,0.53)": "faint",
  "#dddddd": "rail", "#fafafa": "railDash", "rgba(255,255,255,1)": "airfield", "hsl(0,0%,70%)": "boundary",
};
const texts = { "#000": "name", "#333": "name", "#666": "label", "hsl(30,0%,62%)": "quiet", "hsl(0,0%,66%)": "quiet", "#495e91": "waterName" };
const isColor = value => typeof value === "string" && /^(#|rgba?\(|hsla?\()/.test(value);

function build(source, look, css) {
  const colors = palette(look, tokens(css, look));
  const used = new Set();
  const repaint = (value, property, layer) => {
    if (Array.isArray(value)) return value.map(item => repaint(item, property, layer));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repaint(item, property, layer)]));
    if (!isColor(value)) return value;
    const from = value.replaceAll(" ", "").toLowerCase();
    // A halo is the land showing through behind a word, whatever Positron drew it in.
    const part = property === "text-halo-color" ? "halo" : property === "text-color" ? texts[from] : shapes[from];
    if (!part) throw new Error(`Positron's layer "${layer}" has the color ${value} in ${property}, which the table in scripts/build-map-style.mjs does not know`);
    used.add(property === "text-halo-color" ? "halo" : from);
    return colors[part];
  };
  const layers = source.layers.map(layer => layer.paint
    ? { ...layer, paint: Object.fromEntries(Object.entries(layer.paint).map(([property, value]) => [property, repaint(value, property, layer.id)])) }
    : layer);
  const unused = [...Object.keys(shapes), ...Object.keys(texts)].filter(color => !used.has(color));
  if (unused.length) throw new Error(`Positron no longer has ${unused.join(", ")}. Take the line out of the table in scripts/build-map-style.mjs and look at the map again.`);
  return {
    ...source,
    name: `Gnouht ${look}`,
    metadata: {
      "gnouht:built-by": "scripts/build-map-style.mjs, from the color tokens in src/styles.css",
      "gnouht:source": "OpenFreeMap Positron (https://github.com/hyperknot/openfreemap-styles), a fork of https://github.com/openmaptiles/positron-gl-style",
      "gnouht:license": "Copyright (c) 2024, MapTiler.com & OpenMapTiles contributors. Copyright (c) 2015, CartoDB Inc. Code: BSD 3-Clause License. Design: CC-BY 4.0, derived from CartoDB Basemaps by Stamen and Paul Norman for CartoDB Inc., CC-BY 3.0. The colors were changed.",
    },
    layers,
  };
}

const flags = process.argv.slice(2);
if (flags.includes("--fetch")) {
  const answer = await fetch(sourceUrl);
  if (!answer.ok) throw new Error(`${sourceUrl} answered ${answer.status}`);
  writeFileSync(sourcePath, `${JSON.stringify(await answer.json())}\n`);
  console.log("scripts/map/positron.json taken again from OpenFreeMap");
}
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const css = readFileSync(`${root}src/styles.css`, "utf8");
let stale = false;
for (const look of ["light", "dark"]) {
  const path = `${root}public/map/${look}.json`;
  const text = `${JSON.stringify(build(source, look, css))}\n`;
  if (!flags.includes("--check")) { writeFileSync(path, text); console.log(`public/map/${look}.json written`); continue; }
  let now = "";
  try { now = readFileSync(path, "utf8"); } catch { /* A missing file is out of date. */ }
  if (now !== text) { stale = true; console.error(`public/map/${look}.json is out of date. Run: node scripts/build-map-style.mjs`); }
}
if (stale) process.exit(1);
