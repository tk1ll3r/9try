import { CalendarCheck2 } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { MeetupRepository } from "./domain/Meetup";
import { SupabaseMeetupRepository } from "./infrastructure/SupabaseMeetupRepository";

export const meetupsModule: FeatureModule<MeetupRepository> = {
  id: "meetups",
  create: ({ userId }) => new SupabaseMeetupRepository(requireSupabase(), userId),
  searchItems: async meetups => (await meetups.list()).map(meetup => ({ title: meetup.title, kind: "Hoạt động", to: "/meetups", keywords: meetup.description })),
  navigation: [{ tab: "together", to: "/meetups", label: "Hoạt động", icon: CalendarCheck2, order: 30 }],
  routes: [{ path: "meetups", component: lazy(() => import("./presentation/MeetupsPage").then(m => ({ default: m.MeetupsPage }))) }],
};
