import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../shared/infrastructure/supabase";
import { TaskService } from "./application/TaskService";
import { SupabaseTaskRepository } from "./infrastructure/SupabaseTaskRepository";

export const tasksModule: FeatureModule<TaskService> = {
  id: "tasks",
  create: ({ userId }) => new TaskService(new SupabaseTaskRepository(requireSupabase(), userId)),
};
