// Rasterizes public/icon.svg for browsers that require PNG app icons.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const icon = readFileSync(`${root}public/icon.svg`, "utf8");
const maskable = icon
  .replace('rx="128"', 'rx="0"')
  .replace("  <path d=", '  <g transform="translate(51.2 51.2) scale(.8)">\n  <path d=')
  .replace("</svg>", "  </g>\n</svg>");

const browser = await chromium.launch();
try {
  async function render(svg, size, path) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: `${root}${path}` });
    await page.close();
    console.log(`${path} written`);
  }
  await render(icon, 192, "public/icon-192.png");
  await render(icon, 512, "public/icon-512.png");
  await render(maskable, 512, "public/icon-maskable-512.png");
  await render(icon, 180, "public/apple-touch-icon.png");
} finally { await browser.close(); }
