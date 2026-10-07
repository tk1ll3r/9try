import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { groupsModule } from "../groups.module";

export const groupsKey = ["groups"] as const;

/** The signed-in user's groups, without archived ones. */
export function useMyGroups() {
  const groups = useModule(groupsModule);
  return useQuery({ queryKey: [...groupsKey, "list"], queryFn: () => groups.list() });
}
