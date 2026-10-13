import { ListChecks } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { t } from "../../kernel/i18n";
import { requireSupabase } from "../../kernel/supabase";
import { TaskService } from "./application/TaskService";
import { SupabaseTaskRepository } from "./infrastructure/SupabaseTaskRepository";
import { TaskStatsCard } from "./presentation/TaskStatsCard";
import { TodayTasksCard } from "./presentation/TodayTasksCard";

export const tasksModule: FeatureModule<TaskService> = {
  id: "tasks",
  create: ({ userId }) => new TaskService(new SupabaseTaskRepository(requireSupabase(), userId)),
  today: { order: 20, card: TodayTasksCard },
  stats: { order: 10, card: TaskStatsCard },
  navigation: [{ tab: "plan", to: "/me/organizer", label: t("Việc"), icon: ListChecks, order: 20 }],
  // The address keeps its old name: reminders that were already sent link to it.
  routes: [{ path: "me/organizer", ...lazyRoute(() => import("./presentation/TasksPage").then(m => ({ default: m.TasksPage }))) }],
};
