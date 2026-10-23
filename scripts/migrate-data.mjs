import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in the environment before running this migration.`);
  return value;
}

const OLD_URL = required("OLD_SUPABASE_URL");
const OLD_SERVICE_KEY = required("OLD_SUPABASE_SERVICE_ROLE_KEY");
const NEW_URL = required("NEW_SUPABASE_URL");
const NEW_SERVICE_KEY = required("NEW_SUPABASE_SERVICE_ROLE_KEY");

const oldDb = createClient(OLD_URL, OLD_SERVICE_KEY, { auth: { persistSession: false } });
const newDb = createClient(NEW_URL, NEW_SERVICE_KEY, { auth: { persistSession: false } });

async function migrateAuthUsers() {
  console.log("==> Migrating Auth Users...");
  const { data: { users }, error } = await oldDb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  let created = 0;
  for (const user of users) {
    try {
      const { error: createError } = await newDb.auth.admin.createUser({
        id: user.id,
        email: user.email,
        email_confirm: true,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata,
        phone: user.phone || undefined,
        phone_confirm: user.phone ? true : undefined,
      });
      if (!createError || createError.message?.includes("already exists")) {
        created++;
      }
    } catch {
      // ignore
    }
  }
  console.log(`Migrated ${created}/${users.length} auth users.`);
}

async function migrateTable(table, pkey = "id", transform = row => row, batchSize = 100) {
  process.stdout.write(`Migrating ${table}... `);
  let offset = 0;
  let total = 0;

  const orderCol = pkey.includes(",") ? pkey.split(",")[0].trim() : pkey;

  while (true) {
    const { data: rows, error } = await oldDb
      .from(table)
      .select("*")
      .order(orderCol, { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.log(`Error reading ${table}: ${error.message}`);
      break;
    }
    if (!rows || rows.length === 0) break;

    const transformed = rows.map(transform);
    const { error: insertError } = await newDb
      .from(table)
      .upsert(transformed, { onConflict: pkey, ignoreDuplicates: false });

    if (insertError) {
      console.log(`Error inserting into ${table}: ${insertError.message}`);
      break;
    }

    total += rows.length;
    offset += batchSize;
    if (rows.length < batchSize) break;
  }
  console.log(`${total} rows.`);
}

async function scanFiles(db, bucket, prefix = "") {
  const { data: items, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !items) return [];
  const files = [];
  for (const item of items) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      files.push(...await scanFiles(db, bucket, fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function pool(items, concurrency, fn) {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const i = index++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function migrateStorage(bucket) {
  console.log(`==> Migrating Storage bucket: ${bucket}...`);
  const files = await scanFiles(oldDb, bucket);
  console.log(`Found ${files.length} files in ${bucket}.`);

  let copied = 0;
  let failed = 0;

  await pool(files, 15, async (file, i) => {
    try {
      const { data: blob, error: dlError } = await oldDb.storage.from(bucket).download(file);
      if (dlError || !blob) {
        failed++;
        return;
      }
      const { error: upError } = await newDb.storage.from(bucket).upload(file, blob, {
        upsert: true,
        contentType: blob.type || "image/jpeg"
      });
      if (upError) {
        failed++;
      } else {
        copied++;
      }
    } catch {
      failed++;
    }
    if ((copied + failed) % 50 === 0 || copied + failed === files.length) {
      process.stdout.write(`  [${bucket}] ${copied + failed}/${files.length} processed...\r`);
    }
  });

  console.log(`\nSuccessfully copied ${copied}/${files.length} files in ${bucket} (failed: ${failed}).`);
}

async function main() {
  await migrateAuthUsers();

  console.log("==> Migrating Database Tables...");
  await migrateTable("profiles", "id");
  await migrateTable("friendships", "user_a,user_b");
  await migrateTable("friend_invites", "id");
  await migrateTable("friend_pins", "user_id,friend_id");
  await migrateTable("groups", "id");
  await migrateTable("group_memberships", "group_id,user_id");
  await migrateTable("group_invites", "id");
  await migrateTable("conversations", "id");
  await migrateTable("conversation_reads", "conversation_id,user_id");
  await migrateTable("messages", "id");
  await migrateTable("message_reactions", "message_id,user_id");
  await migrateTable("room_members", "conversation_id,user_id");
  await migrateTable("moments", "id");
  await migrateTable("moment_viewers", "moment_id,viewer_id");
  await migrateTable("moment_views", "moment_id,user_id");
  await migrateTable("moment_reactions", "moment_id,user_id");
  await migrateTable("moment_post_days", "user_id,day");
  await migrateTable("calendar_events", "id");
  await migrateTable("event_shares", "event_id,shared_with");
  await migrateTable("availability_shares", "user_id,shared_with");
  await migrateTable("personal_tasks", "id");
  await migrateTable("routine_completions", "user_id,day,item_id");
  await migrateTable("meetups", "id");
  await migrateTable("meetup_invitees", "meetup_id,user_id");
  await migrateTable("meetup_time_options", "id");
  await migrateTable("schedule_grants", "user_id,grantee_id");
  await migrateTable("schedule_requests", "id");
  await migrateTable("presence_settings", "user_id");
  await migrateTable("presence_viewers", "user_id,viewer_id");
  await migrateTable("location_sessions", "id");
  await migrateTable("location_recipients", "session_id,user_id");
  await migrateTable("location_positions", "session_id");
  await migrateTable("location_nearby_preferences", "user_id,friend_id");
  await migrateTable("location_nearby_state", "user_id,friend_id");
  await migrateTable("expense_books", "id");
  await migrateTable("expense_book_members", "book_id,user_id");
  await migrateTable("expense_categories", "id");
  await migrateTable("expenses", "id");
  await migrateTable("expense_splits", "expense_id,participant_id");
  await migrateTable("expense_participants", "id");
  await migrateTable("expense_audit_log", "id", row => {
    const { id, ...rest } = row;
    return rest;
  });
  await migrateTable("notifications", "id");
  await migrateTable("notification_preferences", "user_id,category");
  await migrateTable("reminders", "idempotency_key");
  await migrateTable("push_subscriptions", "id");
  await migrateTable("feature_grants", "user_id,feature");
  await migrateTable("custom_activity_modes", "id", row => {
    const { mode, ...rest } = row;
    return rest;
  });
  await migrateTable("public_site_metrics", "singleton");

  console.log("==> Migrating Storage Files...");
  await migrateStorage("chat");
  await migrateStorage("moments");

  console.log("==> Migration Complete!");
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
