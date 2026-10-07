import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { identityModule } from "../identity.module";

export const profileKey = ["profile"] as const;

export function useProfile() {
  const profiles = useModule(identityModule);
  return useQuery({ queryKey: profileKey, queryFn: () => profiles.get() });
}
