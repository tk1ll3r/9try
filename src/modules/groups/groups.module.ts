import { UsersRound } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { GroupRepository } from "./domain/Group";
import { SupabaseGroupRepository } from "./infrastructure/SupabaseGroupRepository";
import { t } from "../../kernel/i18n";

export const groupsModule: FeatureModule<GroupRepository> = {
  id: "groups",
  create: ({ userId }) => new SupabaseGroupRepository(requireSupabase(), userId),
  searchItems: async groups => (await groups.list()).map(group => ({ title: group.name, kind: t("Nhóm"), to: `/groups/${group.id}`, keywords: group.description })),
  navigation: [{ tab: "together", to: "/groups", label: t("Nhóm"), icon: UsersRound, order: 20 }],
  routes: [
    { path: "groups", component: lazy(() => import("./presentation/GroupsPage").then(m => ({ default: m.GroupsPage }))) },
    { path: "groups/:groupId", component: lazy(() => import("./presentation/GroupPage").then(m => ({ default: m.GroupPage }))) },
    { path: "invite/group/:token", component: lazy(() => import("./presentation/GroupInvitePage").then(m => ({ default: m.GroupInvitePage }))) },
  ],
};
