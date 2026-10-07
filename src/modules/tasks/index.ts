import { lazy } from "react";

// The only file other features may import from this module.
export { TodayTasksCard } from "./presentation/TodayTasksCard";
// Loaded on demand so that Today does not download the full list and its dialog.
export const TaskListCard = lazy(() => import("./presentation/TaskListCard").then(m => ({ default: m.TaskListCard })));
