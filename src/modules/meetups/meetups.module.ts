import { CalendarSearch, PartyPopper } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { type MeetupRepository } from "./domain/Meetup";
import { SupabaseMeetupRepository } from "./infrastructure/SupabaseMeetupRepository";
import { MeetupInvitesCard } from "./presentation/MeetupInvitesCard";
import { MeetupStatsCard } from "./presentation/MeetupStatsCard";
import { t } from "../../kernel/i18n";

export const meetupsModule: FeatureModule<MeetupRepository> = {
  id: "meetups",
  create: ({ userId }) => new SupabaseMeetupRepository(requireSupabase(), userId),
  today: { order: 6, card: MeetupInvitesCard },
  stats: { order: 60, card: MeetupStatsCard },
  navigation: [
    { tab: "together", to: "/meetups", label: t("Hoạt động"), icon: PartyPopper, order: 30 },
    { tab: "together", to: "/free-time", label: t("Rảnh lúc nào?"), icon: CalendarSearch, order: 31, parent: "/meetups" },
  ],
  // Mode no longer asks who is coming. That was one list plus a query per meetup every few minutes.
  // The meetup screens still load their own rows when they are opened.
  // A meetup with a confirmed time is on the calendar of everyone who has not declined it.
  agenda: async (meetups, from, to) => (await meetups.list()).flatMap(meetup =>
    meetup.status === "confirmed" && meetup.rsvp !== "declined" && meetup.startAt && meetup.endAt
      && Date.parse(meetup.endAt) > from.getTime() && Date.parse(meetup.startAt) < to.getTime()
      ? [{ id: meetup.id, title: meetup.title, start: meetup.startAt, end: meetup.endAt, kind: t("Hoạt động"), to: `/meetups/${meetup.id}` }] : []),
  routes: [
    { path: "meetups", ...lazyRoute(() => import("./presentation/MeetupsPage").then(m => ({ default: m.MeetupsPage }))) },
    { path: "meetups/:meetupId", ...lazyRoute(() => import("./presentation/MeetupPage").then(m => ({ default: m.MeetupPage }))) },
  ],
};
