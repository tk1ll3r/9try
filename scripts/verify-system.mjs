import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in the environment before running this verification.`);
  return value;
}

const NEW_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? required("SUPABASE_URL");
const NEW_PUB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? required("SUPABASE_PUBLISHABLE_KEY");
const NEW_SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const anonClient = createClient(NEW_URL, NEW_PUB_KEY);
const adminClient = createClient(NEW_URL, NEW_SERVICE_KEY);

console.log("=========================================");
console.log("   SYSTEM & SECURITY VERIFICATION SUITE   ");
console.log("=========================================\n");

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

// 1. Connection & Data integrity
console.log("1. Database & Tables Check:");
const { count: userCount } = await adminClient.from("profiles").select("*", { count: "exact", head: true });
assert(userCount === 40, `Profiles table has all 40 users (got ${userCount})`);

const { count: msgCount } = await adminClient.from("messages").select("*", { count: "exact", head: true });
assert(msgCount === 2087, `Messages table has all 2087 messages (got ${msgCount})`);

const { count: momentCount } = await adminClient.from("moments").select("*", { count: "exact", head: true });
assert(momentCount === 622, `Moments table has all 622 moments (got ${momentCount})`);

// 2. Storage Check
console.log("\n2. Storage Objects Check:");
const { data: momentFiles, error: momentStorageErr } = await adminClient.storage.from("moments").list("", { limit: 100 });
assert(!momentStorageErr && momentFiles.length > 0, `Moments storage bucket accessible, found user directories (${momentFiles?.length})`);

const { data: chatFiles, error: chatStorageErr } = await adminClient.storage.from("chat").list("", { limit: 100 });
assert(!chatStorageErr && chatFiles.length > 0, `Chat storage bucket accessible, found conversation directories (${chatFiles?.length})`);

// 3. Security Hardening Check: Anonymous Access Prevention
console.log("\n3. Security & RLS Hardening Check:");
// An anonymous client must NOT be able to select from messages
const { data: anonMessages, error: anonMsgErr } = await anonClient.from("messages").select("*").limit(5);
assert(
  !anonMessages || anonMessages.length === 0,
  `Anonymous client CANNOT read private messages (received ${anonMessages?.length ?? 0} rows)`
);

// An anonymous client must NOT be able to list storage files directly
const { data: anonStorage, error: anonStorageErr } = await anonClient.storage.from("moments").list("", { limit: 5 });
assert(
  !anonStorage || anonStorage.length === 0 || anonStorageErr,
  "Anonymous client CANNOT list moments bucket"
);

// An anonymous client must NOT be able to list chat storage files
const { data: anonChatStorage, error: anonChatErr } = await anonClient.storage.from("chat").list("", { limit: 5 });
assert(
  !anonChatStorage || anonChatStorage.length === 0 || anonChatErr,
  "Anonymous client CANNOT list chat bucket"
);

// 4. Edge Functions Check
console.log("\n4. Edge Functions Health Check:");
// calendar-feed with no token should 404
const calRes = await fetch(`${NEW_URL}/functions/v1/calendar-feed`);
assert(calRes.status === 404, `calendar-feed returns 404 for invalid/missing token (got ${calRes.status})`);

// delete-account without auth should 401
const delRes = await fetch(`${NEW_URL}/functions/v1/delete-account`, { method: "POST" });
assert(delRes.status === 401, `delete-account returns 401 without auth (got ${delRes.status})`);

// send-test-push without auth should 401
const pushRes = await fetch(`${NEW_URL}/functions/v1/send-test-push`, { method: "POST" });
assert(pushRes.status === 401, `send-test-push returns 401 without auth (got ${pushRes.status})`);

// 5. Signed URL & Bandwidth Check
console.log("\n5. Media Signed URL & Bandwidth Check:");
// Get a sample moment from the database
const { data: sampleMoment } = await adminClient.from("moments").select("path").limit(1).single();
if (sampleMoment?.path) {
  const { data: signedData, error: signErr } = await adminClient.storage.from("moments").createSignedUrl(sampleMoment.path, 60);
  assert(!signErr && signedData?.signedUrl, `Signed URL created for moment: ${sampleMoment.path}`);

  if (signedData?.signedUrl) {
    const start = Date.now();
    const photoRes = await fetch(signedData.signedUrl);
    const latency = Date.now() - start;
    const bytes = Number(photoRes.headers.get("content-length") || (await photoRes.arrayBuffer()).byteLength);
    assert(
      photoRes.ok && bytes > 0,
      `Photo retrieved successfully (${(bytes / 1024).toFixed(1)} KB) in ${latency}ms, status ${photoRes.status}`
    );
  }
}

console.log(`\n=========================================`);
console.log(`Results: ${passed}/${total} checks passed.`);
console.log(`=========================================`);

if (passed !== total) process.exit(1);
