import { Bell } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { NotificationRepository } from "./domain/Notification";
import { PushData } from "./infrastructure/PushData";
import { SupabaseNotificationRepository } from "./infrastructure/SupabaseNotificationRepository";
import { NotificationSettings } from "./presentation/NotificationSettings";
import { UnreadBadge } from "./presentation/UnreadBadge";

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
  navigation: [{ tab: "inbox", to: "/notifications", label: "Thông báo", icon: Bell, order: 10, badge: UnreadBadge }],
  settings: NotificationSettings,
  routes: [
    { path: "notifications", component: lazy(() => import("./presentation/NotificationsPage").then(m => ({ default: m.NotificationsPage }))) },
  ],
};
