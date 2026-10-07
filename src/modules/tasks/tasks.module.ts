import { ListChecks } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { TaskService } from "./application/TaskService";
import { SupabaseTaskRepository } from "./infrastructure/SupabaseTaskRepository";

export const tasksModule: FeatureModule<TaskService> = {
  id: "tasks",
  create: ({ userId }) => new TaskService(new SupabaseTaskRepository(requireSupabase(), userId)),
  searchItems: async tasks => (await tasks.list()).filter(task => !task.done).map(task => ({ title: task.title, kind: "Việc", to: "/me/organizer" })),
  navigation: [{ tab: "plan", to: "/me/organizer", label: "Việc", icon: ListChecks, order: 20 }],
  // The address keeps its old name: reminders that were already sent link to it.
  routes: [{ path: "me/organizer", component: lazy(() => import("./presentation/TasksPage").then(m => ({ default: m.TasksPage }))) }],
};
