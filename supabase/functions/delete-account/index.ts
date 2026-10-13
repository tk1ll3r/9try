import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

// Called by the web app, from a page on another address, so every answer carries the headers a browser
// asks for. Without them the browser drops the request before it is sent, and the app can only say
// that it could not reach the server.
Deno.serve(async (req) => {
  const asked = preflight(req);
  if (asked) return asked;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authorization = req.headers.get("authorization");
  if (!authorization) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "server not configured" }, 500);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

  const { error: prepareError } = await userClient.rpc("prepare_account_deletion");
  if (prepareError) {
    return json({ error: prepareError.message }, 409);
  }

  const admin = createClient(url, serviceKey);
  // The person's photos of the day go with the account, at once. The rows go with the profile; a
  // file that could not be removed here is removed by the worker within the hour.
  const photos = admin.storage.from("moments");
  const { data: files } = await photos.list(userData.user.id, { limit: 1000 });
  if (files?.length) await photos.remove(files.map(file => `${userData.user.id}/${file.name}`));

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return json({ error: "account deletion failed" }, 500);
  }

  return json({ ok: true });
});
