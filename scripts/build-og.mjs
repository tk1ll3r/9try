// Draws public/og.png, the picture a chat app shows when someone shares the site's address
// (index.html names it in its Open Graph tags). Run it again when the name or the sentence changes:
//   node scripts/build-og.mjs
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const icon = readFileSync(`${root}public/icon.svg`, "utf8");
const face = (letter, color) => `<span style="position:relative;display:grid;place-items:center;width:132px;height:132px;border-radius:999px;background:conic-gradient(${color},${color}33 35%,${color} 70%,#fff8 85%,${color})">
  <span style="display:grid;place-items:center;width:112px;height:112px;border-radius:999px;background:#fffbfd;color:#311726;font:900 52px system-ui">${letter}</span></span>`;
const html = `<!doctype html><html lang="vi"><body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#fff5f8;color:#311726;font-family:Inter,'Noto Sans',system-ui,sans-serif">
  <i style="position:absolute;left:-160px;top:-200px;width:620px;height:620px;border-radius:999px;background:#ec4899;opacity:.25;filter:blur(90px)"></i>
  <i style="position:absolute;right:-180px;top:120px;width:560px;height:560px;border-radius:999px;background:#c084fc;opacity:.2;filter:blur(90px)"></i>
  <i style="position:absolute;left:260px;bottom:-320px;width:600px;height:600px;border-radius:999px;background:#fb7185;opacity:.18;filter:blur(90px)"></i>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 84px">
    <div style="display:flex;align-items:center;gap:20px;font-weight:800;font-size:34px;color:#be185d"><span style="display:block;width:64px;height:64px;border-radius:18px;overflow:hidden">${icon.replace("<svg", '<svg width="64" height="64"')}</span>Gnouht Together</div>
    <p style="margin:34px 0 0;max-width:820px;font-weight:900;font-size:58px;line-height:1.04;letter-spacing:-.045em">Biết bạn bè đang làm gì. Hẹn nhau trong vài chạm.</p>
    <p style="margin:26px 0 0;max-width:760px;font-size:26px;line-height:1.35;color:#765b69">Mode, lịch, trò chuyện và bản đồ cho nhóm bạn thân. Riêng tư cho tới khi bạn chọn chia sẻ.</p>
  </div>
  <div style="position:absolute;right:96px;top:120px;display:grid;gap:34px">${face("K", "#ec4899")}${face("L", "#a855f7")}${face("T", "#fb7185")}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: `${root}public/og.png` });
await browser.close();
console.log("public/og.png written");
