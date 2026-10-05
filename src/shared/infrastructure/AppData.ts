import { requireSupabase } from "./supabase";
export class AppData{
 async home(userId:string){const db=requireSupabase(); const [e,t,g,n]=await Promise.all([
 db.from("calendar_events").select("id,title,start_at,all_day_start").eq("owner_id",userId).limit(6),
 db.from("personal_tasks").select("id,title,priority,due_at,completed_at").eq("owner_id",userId).is("completed_at",null).limit(6),
 db.from("group_memberships").select("role,group:groups(id,name,description)").eq("user_id",userId).limit(6),
 db.from("notifications").select("id,title,body,read_at,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(20)
 ]); for(const r of [e,t,g,n]) if(r.error) throw r.error; return {events:e.data??[],tasks:t.data??[],groups:g.data??[],notifications:n.data??[]};}
 async createTask(userId:string,title:string){const {error}=await requireSupabase().from("personal_tasks").insert({owner_id:userId,title,priority:"medium"}); if(error)throw error;}
 async completeTask(id:string){const {error}=await requireSupabase().from("personal_tasks").update({completed_at:new Date().toISOString()}).eq("id",id);if(error)throw error;}
 async createGroup(name:string,description:string){const {error}=await requireSupabase().rpc("create_group",{p_name:name,p_description:description});if(error)throw error;}
 async createEvent(userId:string,title:string,startAt:string,endAt:string){const {error}=await requireSupabase().from("calendar_events").insert({owner_id:userId,title,event_kind:"timed",start_at:startAt,end_at:endAt,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,visibility:"only_me"});if(error)throw error;}
 async markRead(id:string){const {error}=await requireSupabase().from("notifications").update({read_at:new Date().toISOString()}).eq("id",id);if(error)throw error;}
 async profile(userId:string){const {data,error}=await requireSupabase().from("profiles").select("*").eq("id",userId).single();if(error)throw error;return data;}
 async saveProfile(userId:string,v:{display_name:string;username:string;bio:string;timezone:string}){const {error}=await requireSupabase().from("profiles").update(v).eq("id",userId);if(error)throw error;}
 async startLocation(duration:number,usernames:string[]){const {data,error}=await requireSupabase().rpc("start_location_session",{p_duration_minutes:duration,p_recipient_usernames:usernames});if(error)throw error;return data as string;}
 async publishLocation(sessionId:string,p:GeolocationPosition){const {error}=await requireSupabase().from("location_positions").upsert({session_id:sessionId,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy_m:p.coords.accuracy,recorded_at:new Date(p.timestamp).toISOString()});if(error)throw error;}
 async stopLocation(id:string){const {error}=await requireSupabase().rpc("stop_location_session",{p_session_id:id});if(error)throw error;}
 async exportMyData(){const {data,error}=await requireSupabase().rpc("export_my_data");if(error)throw error;return data;}
 async deleteMyAccount(){const {data,error}=await requireSupabase().functions.invoke("delete-account",{body:{confirm:true}});if(error)throw error;if(data?.error)throw new Error(data.error);}
} export const appData=new AppData();
