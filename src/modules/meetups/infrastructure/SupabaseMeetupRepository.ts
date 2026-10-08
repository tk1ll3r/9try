import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeetupComment, MeetupParticipant, MeetupRepository, MeetupSummary, PollOption, Rsvp } from "../domain/Meetup";
import { t } from "../../../kernel/i18n";

/** Reads go through row level security; every change goes through a SQL function that checks who is asking. */
export class SupabaseMeetupRepository implements MeetupRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  private async call(name: string, args: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async list(): Promise<MeetupSummary[]> {
    const { data, error } = await this.db.from("meetup_invitees")
      .select("rsvp_status,meetup:meetups(id,group_id,organizer_id,title,description,status,timezone,start_at,end_at,capacity,location_name)")
      .eq("user_id", this.userId).order("responded_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).flatMap((row: any) => {
      const meetup = Array.isArray(row.meetup) ? row.meetup[0] : row.meetup;
      return meetup ? [{
        id: meetup.id, groupId: meetup.group_id, organizerId: meetup.organizer_id, title: meetup.title, description: meetup.description ?? "",
        status: meetup.status, startAt: meetup.start_at, endAt: meetup.end_at, capacity: meetup.capacity, locationName: meetup.location_name, rsvp: row.rsvp_status,
      }] : [];
    });
  }

  create(meetup: { groupId: string | null; title: string; description: string; capacity: number | null }): Promise<string> {
    return this.call("create_meetup", {
      p_group_id: meetup.groupId, p_title: meetup.title.trim(), p_description: meetup.description.trim(),
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, p_capacity: meetup.capacity,
    });
  }

  async invite(meetupId: string, userIds: string[]): Promise<number> {
    return Number(await this.call("invite_users_to_meetup", { p_meetup_id: meetupId, p_user_ids: userIds }) ?? 0);
  }

  async participants(meetupId: string): Promise<MeetupParticipant[]> {
    const rows = await this.call("list_meetup_participants", { p_meetup_id: meetupId });
    return (rows ?? []).map((row: any) => ({ userId: row.user_id, displayName: row.display_name || row.username || t("Người dùng"), rsvp: row.rsvp_status }));
  }

  async respond(meetupId: string, response: Exclude<Rsvp, "pending">): Promise<void> {
    await this.call("respond_meetup_rsvp", { p_meetup_id: meetupId, p_response: response });
  }

  async addOption(meetupId: string, startsAt: Date, endsAt: Date): Promise<void> {
    await this.call("create_meetup_time_option", { p_meetup_id: meetupId, p_starts_at: startsAt.toISOString(), p_ends_at: endsAt.toISOString() });
  }

  async poll(meetupId: string): Promise<PollOption[]> {
    const rows = await this.call("get_meetup_poll_summary", { p_meetup_id: meetupId });
    return (rows ?? []).map((row: any) => ({
      optionId: row.option_id, startsAt: row.starts_at, endsAt: row.ends_at,
      availableCount: Number(row.available_count ?? 0), totalVotes: Number(row.total_votes ?? 0), myVote: row.my_vote,
    }));
  }

  async vote(optionId: string, available: boolean): Promise<void> {
    await this.call("vote_meetup_time", { p_option_id: optionId, p_available: available });
  }

  async confirm(meetupId: string, optionId: string): Promise<void> {
    await this.call("confirm_meetup_time", { p_meetup_id: meetupId, p_option_id: optionId });
  }

  async cancel(meetupId: string): Promise<void> {
    await this.call("cancel_meetup", { p_meetup_id: meetupId });
  }

  async comments(meetupId: string): Promise<MeetupComment[]> {
    const rows = await this.call("list_meetup_comments", { p_meetup_id: meetupId });
    return (rows ?? []).map((row: any) => ({
      id: row.id, body: row.body, createdAt: row.created_at, authorDisplayName: row.author_display_name || row.author_username || t("Người dùng"),
    }));
  }

  async postComment(meetupId: string, body: string): Promise<void> {
    await this.call("post_meetup_comment", { p_meetup_id: meetupId, p_body: body });
  }
}
