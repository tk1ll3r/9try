import { ModuleRegistry } from "../kernel/module";
import { calendarModule } from "../modules/calendar/calendar.module";
import { chatModule } from "../modules/chat/chat.module";
import { expensesModule } from "../modules/expenses/expenses.module";
import { friendsModule } from "../modules/friends/friends.module";
import { groupsModule } from "../modules/groups/groups.module";
import { habitsModule } from "../modules/habits/habits.module";
import { identityModule } from "../modules/identity/identity.module";
import { locationModule } from "../modules/location/location.module";
import { meetupsModule } from "../modules/meetups/meetups.module";
import { menuModule } from "../modules/menu/menu.module";
import { momentsModule } from "../modules/moments/moments.module";
import { notesModule } from "../modules/notes/notes.module";
import { notificationsModule } from "../modules/notifications/notifications.module";
import { presenceModule } from "../modules/presence/presence.module";
import { statsModule } from "../modules/stats/stats.module";
import { tasksModule } from "../modules/tasks/tasks.module";
import { todayModule } from "../modules/today/today.module";

/** Every feature of the app. Adding a feature means adding its module to this list. */
const modules = [todayModule, calendarModule, tasksModule, habitsModule, notesModule, notificationsModule, chatModule, friendsModule, groupsModule, meetupsModule, presenceModule, momentsModule, locationModule, statsModule, expensesModule, identityModule, menuModule];

// Keep existing routes and data available for notifications and old links, while removing these
// screens from the Menu/navigation and global-search entry points.
const hiddenNavigation = new Set(["today", "tasks", "stats", "meetups", "expenses"]);
export const registry = new ModuleRegistry(modules.map(module => hiddenNavigation.has(module.id)
  ? { ...module, navigation: [], searchItems: undefined }
  : module));
