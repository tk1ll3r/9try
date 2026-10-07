import { CalendarCheck2 } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { isSoon, meetupSignals, type MeetupRepository } from "./domain/Meetup";
import { SupabaseMeetupRepository } from "./infrastructure/SupabaseMeetupRepository";
import { MeetupInvitesCard } from "./presentation/MeetupInvitesCard";

export const meetupsModule: FeatureModule<MeetupRepository> = {
  id: "meetups",
  create: ({ userId }) => new SupabaseMeetupRepository(requireSupabase(), userId),
  searchItems: async meetups => (await meetups.list()).map(meetup => ({ title: meetup.title, kind: "Hoạt động", to: `/meetups/${meetup.id}`, keywords: meetup.description })),
  navigation: [{ tab: "together", to: "/meetups", label: "Hoạt động", icon: CalendarCheck2, order: 30 }],
  today: { order: 6, card: MeetupInvitesCard },
  friendSignals: async (meetups, { userId, now }) => {
    const all = await meetups.list();
    const soon = all.filter(meetup => isSoon(meetup, now)).slice(0, 5);
    // A database without migration 0023 cannot list who is invited; the organizer still counts.
    const invited = await Promise.all(soon.map(meetup => meetups.participants(meetup.id).catch(() => [])));
    const going = new Map(soon.map((meetup, index) => [meetup.id, invited[index].filter(person => person.rsvp !== "declined").map(person => person.userId)]));
    return meetupSignals(all, going, userId, now);
  },
  // A meetup with a confirmed time is on the calendar of everyone who has not declined it.
  agenda: async (meetups, from, to) => (await meetups.list()).flatMap(meetup =>
    meetup.status === "confirmed" && meetup.rsvp !== "declined" && meetup.startAt && meetup.endAt
      && Date.parse(meetup.endAt) > from.getTime() && Date.parse(meetup.startAt) < to.getTime()
      ? [{ id: meetup.id, title: meetup.title, start: meetup.startAt, end: meetup.endAt, kind: "Hoạt động", to: `/meetups/${meetup.id}` }] : []),
  routes: [
    { path: "meetups", component: lazy(() => import("./presentation/MeetupsPage").then(m => ({ default: m.MeetupsPage }))) },
    { path: "meetups/:meetupId", component: lazy(() => import("./presentation/MeetupPage").then(m => ({ default: m.MeetupPage }))) },
  ],
};
