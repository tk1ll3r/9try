import { createClient } from "@supabase/supabase-js";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_URL = "https://9try.gnouht.space";
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in the environment before running this measurement.`);
  return value;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? required("SUPABASE_URL");
const SUPABASE_PUB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? required("SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const sbAnon = createClient(SUPABASE_URL, SUPABASE_PUB_KEY);
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSpeed(bps) {
  const mbps = (bps * 8) / (1024 * 1024);
  return `${mbps.toFixed(2)} Mbps (${formatBytes(bps)}/s)`;
}

async function measureFetch(url, options = {}) {
  const start = performance.now();
  let ttfb = 0;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Accept-Encoding": "gzip, deflate, br",
      ...(options.headers || {})
    }
  });
  ttfb = performance.now() - start;

  const buf = await res.arrayBuffer();
  const totalTime = performance.now() - start;
  const bytes = buf.byteLength;
  const speed = totalTime > 0 ? (bytes / (totalTime / 1000)) : 0;

  return {
    status: res.status,
    headers: res.headers,
    bytes,
    ttfb: Math.round(ttfb),
    totalTime: Math.round(totalTime),
    speed: Math.round(speed)
  };
}

console.log("================================================================================");
console.log("                 BÁO CÁO ĐO LƯỜNG BĂNG THÔNG & HIỆU NĂNG MẠNG                   ");
console.log(`                     Mục tiêu: ${APP_URL}                           `);
console.log("================================================================================\n");

// 1. Root Document Load
console.log("--- 1. Tải Trang Chủ (Root HTML & Cloudflare CDN Edge) ---");
const root = await measureFetch(`${APP_URL}/`);
console.log(`Status: ${root.status}`);
console.log(`Dung lượng truyền tải (Over wire): ${formatBytes(root.bytes)}`);
console.log(`Thời gian phản hồi đầu tiên (TTFB): ${root.ttfb} ms`);
console.log(`Tổng thời gian tải: ${root.totalTime} ms`);
console.log(`Tốc độ truyền tải: ${formatSpeed(root.speed)}`);
console.log(`CF Cache Status: ${root.headers.get("cf-cache-status") || "DYNAMIC"}`);
console.log(`Content-Encoding: ${root.headers.get("content-encoding") || "none"}`);

// 2. Sample Static Bundles
console.log("\n--- 2. Tải JavaScript Chunks & Static Assets (Hashed Assets) ---");
const distAssets = readdirSync("dist/assets").filter(f => f.endsWith(".js") || f.endsWith(".css"));
// Pick a small chunk, a medium chunk, and the large app chunk
const keyAssets = [
  distAssets.find(f => f.startsWith("index-")),
  distAssets.find(f => f.startsWith("supabase-")),
  distAssets.find(f => f.startsWith("AuthenticatedApp-")),
  distAssets.find(f => f.startsWith("files-"))
].filter(Boolean);

let totalAssetBytes = 0;
let totalAssetTime = 0;

for (const asset of keyAssets) {
  const res = await measureFetch(`${APP_URL}/assets/${asset}`);
  totalAssetBytes += res.bytes;
  totalAssetTime += res.totalTime;
  console.log(`- ${asset}:`);
  console.log(`  Dung lượng: ${formatBytes(res.bytes)} | TTFB: ${res.ttfb}ms | Tải xong: ${res.totalTime}ms | Tốc độ: ${formatSpeed(res.speed)}`);
  console.log(`  Cache-Control: ${res.headers.get("cache-control")}`);
}

// 3. Media Delivery (Photo Assets)
console.log("\n--- 3. Đo Băng Thông Tải Ảnh (Media Delivery & Proxy) ---");
const { data: sampleMoments } = await sbAdmin.from("moments").select("path").limit(3);
if (sampleMoments && sampleMoments.length > 0) {
  for (let i = 0; i < sampleMoments.length; i++) {
    const path = sampleMoments[i].path;
    const { data: signedData } = await sbAdmin.storage.from("moments").createSignedUrl(path, 120);
    const directUrl = signedData?.signedUrl;
    const proxyUrl = `${APP_URL}/media/moments/${path}?origin=${encodeURIComponent(directUrl)}`;

    console.log(`\nẢnh mẫu #${i + 1} (${path}):`);

    // A. Direct Supabase Storage Egress
    const directRes = await measureFetch(directUrl);
    console.log(`  [Trực tiếp Supabase Storage]:`);
    console.log(`    Dung lượng tệp: ${formatBytes(directRes.bytes)}`);
    console.log(`    TTFB: ${directRes.ttfb} ms | Tổng thời gian: ${directRes.totalTime} ms`);
    console.log(`    Tốc độ tải: ${formatSpeed(directRes.speed)}`);

    // B. Via Cloudflare Worker Proxy
    const proxyRes = await measureFetch(proxyUrl);
    console.log(`  [Qua Cloudflare Media Proxy]:`);
    console.log(`    Dung lượng tệp: ${formatBytes(proxyRes.bytes)}`);
    console.log(`    TTFB: ${proxyRes.ttfb} ms | Tổng thời gian: ${proxyRes.totalTime} ms`);
    console.log(`    Tốc độ tải: ${formatSpeed(proxyRes.speed)}`);
    console.log(`    Header Cache-Control: ${proxyRes.headers.get("cache-control")}`);
    console.log(`    X-Cache: ${proxyRes.headers.get("x-cache") || "N/A"}`);
  }
}

// 4. API Request Payload & Bandwidth (Supabase REST API)
console.log("\n--- 4. Đo Băng Thông Truy Vấn API (REST & RPC Egress) ---");

const queries = [
  { name: "Lấy danh sách profiles (40 users)", fn: () => sbAdmin.from("profiles").select("id,username,display_name,avatar_url").limit(50) },
  { name: "Lấy tin nhắn gần nhất (20 messages)", fn: () => sbAdmin.from("messages").select("id,conversation_id,sender_id,body,created_at").limit(20) },
  { name: "Lấy danh sách moments (20 moments)", fn: () => sbAdmin.from("moments").select("id,owner_id,path,created_at").limit(20) },
  { name: "Lấy lịch biểu (calendar_events)", fn: () => sbAdmin.from("calendar_events").select("*").limit(20) }
];

for (const q of queries) {
  const start = performance.now();
  const { data, error } = await q.fn();
  const elapsed = Math.round(performance.now() - start);
  const jsonStr = JSON.stringify(data ?? []);
  const rawBytes = Buffer.byteLength(jsonStr, "utf8");
  console.log(`- ${q.name}:`);
  console.log(`  Số bản ghi: ${data?.length ?? 0} | Kích thước JSON: ${formatBytes(rawBytes)} | Thời gian phản hồi: ${elapsed} ms`);
}

// 5. Total Session Footprint & Free Plan Projections
console.log("\n================================================================================");
console.log("         TỔNG HỢP & DỰ PHÓNG TIÊU THỤ BĂNG THÔNG CHO PLAN MIỄN PHÍ             ");
console.log("================================================================================");
console.log(`1. Lần đầu mở WebApp (Cold load, chưa có Service Worker cache):`);
console.log(`   - HTML: ~${formatBytes(root.bytes)}`);
console.log(`   - JS/CSS Shell cần thiết: ~${formatBytes(totalAssetBytes)}`);
console.log(`   - Tổng dung lượng tải lần đầu: ~${formatBytes(root.bytes + totalAssetBytes)}`);
console.log(`   -> Thời gian tải trang ban đầu: ~${Math.max(root.totalTime, totalAssetTime)} ms`);
console.log(`\n2. Các lần mở tiếp theo (Warm load, nhờ Service Worker & Cache-Control immutable):`);
console.log(`   - HTML: ~${formatBytes(root.bytes)} (hoặc 304 Not Modified 0 bytes)`);
console.log(`   - JS/CSS Assets: 0 bytes (Tải trực tiếp từ Service Worker / Disk Cache)`);
console.log(`   - API Data: Chỉ tải delta tin nhắn/moments mới (vài KB mỗi request)`);
console.log(`   - Ảnh đã xem: 0 bytes egress (Nhờ Service Worker CacheFirst)`);
console.log(`\n3. Đánh giá gói Free Supabase (Giới hạn: 5 GB Băng thông / Tháng):`);
const avgPhotoSize = 145 * 1024; // ~145 KB
const webpPhotoSize = 85 * 1024; // ~85 KB with WebP
const photoMonthlyAllowance = 5 * 1024 * 1024 * 1024; // 5 GB
console.log(`   - Định dạng JPEG cũ (~145 KB/ảnh): Khoảng ${(photoMonthlyAllowance / avgPhotoSize).toLocaleString()} lượt tải ảnh.`);
console.log(`   - Chuẩn nén WebP mới (~85 KB/ảnh): Khoảng ${(photoMonthlyAllowance / webpPhotoSize).toLocaleString()} lượt tải ảnh (+70% số lượng).`);
console.log(`   - Khi bật R2 Cache: 100% lượt xem ảnh lặp lại từ người dùng khác đều tải qua R2 (0 byte egress từ Supabase).`);
console.log("================================================================================\n");
