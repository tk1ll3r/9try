import { createClient } from "@supabase/supabase-js";

const OLD_URL = "https://nyyqzldznzcmihjwhueb.supabase.co";
const OLD_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55eXF6bGR6bnpjbWloandodWViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTc5NzUyNywiZXhwIjoyMTA3MzczNTI3fQ.pZiUwTaOrmXxibTyGBWvTVKalMpslYyfdya9R0ug8pI";

const NEW_URL = "https://jqmkfgmfisjmqizqyyct.supabase.co";
const NEW_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxbWtmZ21maXNqbXFpenF5eWN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjA2MTM4NCwiZXhwIjoyMTA3NjM3Mzg0fQ.-YxJz_TVUGE1Z6ryC0mry7mS0MospScb1IdAR_r7mEM";

const oldDb = createClient(OLD_URL, OLD_SERVICE_KEY, { auth: { persistSession: false } });
const newDb = createClient(NEW_URL, NEW_SERVICE_KEY, { auth: { persistSession: false } });

async function migrateTable(table, pkey = "id", orderCol = "id", batchSize = 200) {
  process.stdout.write(`Migrating ${table}... `);
  let offset = 0;
  let total = 0;

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

    const { error: insertError } = await newDb
      .from(table)
      .upsert(rows, { onConflict: pkey, ignoreDuplicates: false });

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

async function migrateMessages() {
  process.stdout.write("Migrating messages (ordered by created_at)... ");
  let offset = 0;
  let total = 0;
  const batchSize = 200;

  while (true) {
    const { data: rows, error } = await oldDb
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.log(`Error reading messages: ${error.message}`);
      break;
    }
    if (!rows || rows.length === 0) break;

    // First insert with reply_to_id as null to prevent foreign key issues
    const firstPass = rows.map(r => ({ ...r, reply_to_id: null }));
    const { error: err1 } = await newDb.from("messages").upsert(firstPass, { onConflict: "id" });
    if (err1) {
      console.log(`Error on first pass: ${err1.message}`);
      break;
    }

    // Second pass to restore reply_to_id
    const withReplies = rows.filter(r => r.reply_to_id);
    if (withReplies.length > 0) {
      await newDb.from("messages").upsert(withReplies, { onConflict: "id" });
    }

    total += rows.length;
    offset += batchSize;
    if (rows.length < batchSize) break;
  }
  console.log(`${total} rows.`);
}

async function main() {
  await migrateTable("friendships", "requester_id,addressee_id", "requester_id");
  await migrateMessages();
  await migrateTable("message_reactions", "message_id,user_id", "message_id");
  await migrateTable("moment_viewers", "moment_id,user_id", "moment_id");
  await migrateTable("moment_post_days", "owner_id,post_day", "owner_id");
  await migrateTable("event_shares", "event_id,user_id,group_id", "event_id");
  await migrateTable("availability_shares", "id", "id");
  await migrateTable("routine_completions", "task_id,completion_date", "task_id");
  await migrateTable("schedule_grants", "id", "id");
  await migrateTable("location_nearby_preferences", "user_id", "user_id");
  await migrateTable("expense_book_members", "book_id,user_id", "book_id");
  await migrateTable("expenses", "id", "id");
  await migrateTable("expense_splits", "expense_id,participant_id", "expense_id");
  await migrateTable("notification_preferences", "user_id", "user_id");
  console.log("==> Finished migrating remaining tables!");
}

main().catch(console.error);
