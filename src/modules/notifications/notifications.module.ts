import { Bell } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { NotificationRepository } from "./domain/Notification";
import { PushData } from "./infrastructure/PushData";
import { SupabaseNotificationRepository } from "./infrastructure/SupabaseNotificationRepository";
import { NotificationSettings } from "./presentation/NotificationSettings";
import { PushSync } from "./presentation/PushSync";
import { UnreadBadge } from "./presentation/UnreadBadge";
import { t } from "../../kernel/i18n";

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
  navigation: [{ tab: "inbox", to: "/notifications", label: t("Thông báo"), icon: Bell, order: 10, badge: UnreadBadge }],
  settings: NotificationSettings,
  indicator: PushSync,
  routes: [
    { path: "notifications", ...lazyRoute(() => import("./presentation/NotificationsPage").then(m => ({ default: m.NotificationsPage }))) },
  ],
};
