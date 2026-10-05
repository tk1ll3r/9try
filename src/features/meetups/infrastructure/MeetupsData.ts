import { requireSupabase } from "../../../shared/infrastructure/supabase";

export type Rsvp = "pending" | "going" | "maybe" | "declined";

export interface MeetupListItem {
  id: string;
  groupId: string | null;
  organizerId: string;
  title: string;
  description: string;
  status: "draft" | "proposed" | "confirmed" | "canceled" | "completed";
  timezone: string;
  startAt: string | null;
  endAt: string | null;
  capacity: number | null;
  locationName: string | null;
  rsvp: Rsvp;
}

export interface PollOption {
  optionId: string;
  startsAt: string;
  endsAt: string;
  availableCount: number;
  totalVotes: number;
  myVote: boolean | null;
}

export class MeetupsData {
  async list(userId: string): Promise<MeetupListItem[]> {
    const { data, error } = await requireSupabase()
      .from("meetup_invitees")
      .select("rsvp_status,meetup:meetups(id,group_id,organizer_id,title,description,status,timezone,start_at,end_at,capacity,location_name)")
      .eq("user_id", userId)
      .order("responded_at", { ascending: false, nullsFirst: false });
    if (error) throw error;

    return (data ?? []).flatMap((row: any) => {
      const meetup = Array.isArray(row.meetup) ? row.meetup[0] : row.meetup;
      if (!meetup) return [];
      return [{
        id: meetup.id,
        groupId: meetup.group_id,
        organizerId: meetup.organizer_id,
        title: meetup.title,
        description: meetup.description ?? "",
        status: meetup.status,
        timezone: meetup.timezone,
        startAt: meetup.start_at,
        endAt: meetup.end_at,
        capacity: meetup.capacity,
        locationName: meetup.location_name,
        rsvp: row.rsvp_status,
      }];
    });
  }

  async create(input: { groupId: string | null; title: string; description: string; capacity: number | null }): Promise<string> {
    const { data, error } = await requireSupabase().rpc("create_meetup", {
      p_group_id: input.groupId,
      p_title: input.title.trim(),
      p_description: input.description.trim(),
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_capacity: input.capacity,
    });
    if (error) throw error;
    return data as string;
  }

  async invite(meetupId: string, username: string): Promise<void> {
    const { error } = await requireSupabase().rpc("invite_to_meetup", {
      p_meetup_id: meetupId,
      p_username: username.trim(),
    });
    if (error) throw error;
  }

  async respond(meetupId: string, response: Exclude<Rsvp, "pending">): Promise<void> {
    const { error } = await requireSupabase().rpc("respond_meetup_rsvp", {
      p_meetup_id: meetupId,
      p_response: response,
    });
    if (error) throw error;
  }

  async addOption(meetupId: string, startsAt: Date, endsAt: Date): Promise<void> {
    const { error } = await requireSupabase().rpc("create_meetup_time_option", {
      p_meetup_id: meetupId,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
    });
    if (error) throw error;
  }

  async poll(meetupId: string): Promise<PollOption[]> {
    const { data, error } = await requireSupabase().rpc("get_meetup_poll_summary", { p_meetup_id: meetupId });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      optionId: row.option_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      availableCount: Number(row.available_count ?? 0),
      totalVotes: Number(row.total_votes ?? 0),
      myVote: row.my_vote,
    }));
  }

  async vote(optionId: string, available: boolean): Promise<void> {
    const { error } = await requireSupabase().rpc("vote_meetup_time", {
      p_option_id: optionId,
      p_available: available,
    });
    if (error) throw error;
  }

  async confirm(meetupId: string, optionId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("confirm_meetup_time", {
      p_meetup_id: meetupId,
      p_option_id: optionId,
    });
    if (error) throw error;
  }
}

export const meetupsData = new MeetupsData();
