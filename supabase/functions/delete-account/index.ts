import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const authorization = req.headers.get("authorization");
  if (!authorization) return new Response("unauthorized", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return new Response("server not configured", { status: 500 });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response("unauthorized", { status: 401 });

  const { error: prepareError } = await userClient.rpc("prepare_account_deletion");
  if (prepareError) {
    return Response.json({ error: prepareError.message }, { status: 409 });
  }

  const admin = createClient(url, serviceKey);
  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return Response.json({ error: "account deletion failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
});
