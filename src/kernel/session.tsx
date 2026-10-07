import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { FeatureModule, ModuleRegistry } from "./module";

/** Everything that belongs to one signed-in user. */
class Session {
  private readonly services = new Map<FeatureModule, unknown>();

  constructor(readonly userId: string, readonly registry: ModuleRegistry) {}

  /** Builds a module's services on first use and keeps them for the rest of the session. */
  get<Services>(module: FeatureModule<Services>): Services {
    if (!this.services.has(module)) {
      if (!module.create) throw new Error(`Module "${module.id}" provides no services.`);
      this.services.set(module, module.create({ userId: this.userId }));
    }
    return this.services.get(module) as Services;
  }

  /** Ends long-lived work such as GPS watching. Services are built again if they are needed later. */
  dispose() {
    for (const services of this.services.values()) (services as { dispose?: () => void } | null)?.dispose?.();
    this.services.clear();
  }
}

const Current = createContext<Session | null>(null);

/**
 * Render with `key={userId}`. Switching accounts then remounts the tree with new services
 * and an empty query cache, so nothing loaded for the previous user can reach the screen.
 */
export function SessionProvider({ userId, registry, children }: { userId: string; registry: ModuleRegistry; children: ReactNode }) {
  const [session] = useState(() => new Session(userId, registry));
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  useEffect(() => () => session.dispose(), [session]);
  return <Current.Provider value={session}><QueryClientProvider client={queries}>{children}</QueryClientProvider></Current.Provider>;
}

function useSession(): Session {
  const session = useContext(Current);
  if (!session) throw new Error("This component needs a signed-in session.");
  return session;
}

export function useModule<Services>(module: FeatureModule<Services>): Services {
  return useSession().get(module);
}

export function useRegistry(): ModuleRegistry {
  return useSession().registry;
}

export function useUserId(): string {
  return useSession().userId;
}
