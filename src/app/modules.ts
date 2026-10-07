import { ModuleRegistry } from "../kernel/module";
import { chatModule } from "../modules/chat/chat.module";
import { friendsModule } from "../modules/friends/friends.module";
import { groupsModule } from "../modules/groups/groups.module";
import { identityModule } from "../modules/identity/identity.module";
import { notificationsModule } from "../modules/notifications/notifications.module";
import { tasksModule } from "../modules/tasks/tasks.module";
import { legacyModule } from "./legacy.module";

/** Every feature of the app. Adding a feature means adding its module to this list. */
export const registry = new ModuleRegistry([tasksModule, notificationsModule, chatModule, friendsModule, groupsModule, identityModule, legacyModule]);
