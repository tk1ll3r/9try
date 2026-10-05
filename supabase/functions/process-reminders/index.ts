import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${Deno.env.get("CRON_SECRET")}`) return new Response("unauthorized",{status:401});

  const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: due, error }=await supabase.from("reminders").select("*").eq("status","pending").lte("due_at",new Date().toISOString()).limit(100);
  if(error) return Response.json({error:error.message},{status:500});

  let delivered=0;
  for(const reminder of due??[]){
    const claimed=await supabase.from("reminders").update({status:"processing",attempts:reminder.attempts+1}).eq("id",reminder.id).eq("status","pending").select("id").maybeSingle();
    if(!claimed.data) continue;
    const title=String(reminder.payload?.title??"Nhắc việc");
    const body=String(reminder.payload?.body??"Bạn có một việc sắp tới.");
    await supabase.from("notifications").insert({user_id:reminder.user_id,category:reminder.category,title,body,action_path:reminder.payload?.action_path??null});
    await supabase.from("reminders").update({status:"delivered",delivered_at:new Date().toISOString()}).eq("id",reminder.id);
    delivered++;
  }
  return Response.json({ok:true,delivered});
});
