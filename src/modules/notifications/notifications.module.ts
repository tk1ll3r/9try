import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../shared/infrastructure/supabase";
import type { NotificationRepository } from "./domain/Notification";
import { PushData } from "./infrastructure/PushData";
import { SupabaseNotificationRepository } from "./infrastructure/SupabaseNotificationRepository";

export interface NotificationServices {
  inbox: NotificationRepository;
  push: PushData;
}

export const notificationsModule: FeatureModule<NotificationServices> = {
  id: "notifications",
  create: ({ userId }) => ({
    inbox: new SupabaseNotificationRepository(requireSupabase(), userId),
    push: new PushData(requireSupabase(), userId),
  }),
  routes: [
    { path: "notifications", component: lazy(() => import("./presentation/NotificationsPage").then(m => ({ default: m.NotificationsPage }))) },
  ],
};
