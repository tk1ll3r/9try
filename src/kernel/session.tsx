import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AgendaItem, FeatureModule, FriendSignal, ModuleRegistry, SearchItem } from "./module";

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
  // In development React's StrictMode runs this cleanup right after the first mount and mounts again.
  // Ending the session there would leave the screens holding dead services, so the end waits a moment
  // and the second mount calls it off. A real unmount (sign-out, another account) lets it happen.
  const ending = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(ending.current);
    return () => { ending.current = window.setTimeout(() => session.dispose()); };
  }, [session]);
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

/** Loads what every module offers to the global search. A module that fails is left out. */
export function useSearchItems(): () => Promise<SearchItem[]> {
  const session = useSession();
  return async () => (await Promise.all(session.registry.modules.map(async module =>
    module.searchItems ? module.searchItems(session.get(module)).catch(() => []) : []))).flat();
}

/** Loads what the modules add to the calendar between two instants. A module that fails is left out. */
export function useAgenda(): (from: Date, to: Date) => Promise<AgendaItem[]> {
  const session = useSession();
  return async (from, to) => (await Promise.all(session.registry.modules.map(async module =>
    module.agenda ? module.agenda(session.get(module), from, to).catch(() => []) : []))).flat();
}

/** Loads what the modules know about the user's friends right now. A module that fails is left out. */
export function useFriendSignals(): () => Promise<FriendSignal[]> {
  const session = useSession();
  return async () => {
    const context = { userId: session.userId, now: new Date() };
    return (await Promise.all(session.registry.modules.map(async module =>
      module.friendSignals ? module.friendSignals(session.get(module), context).catch(() => []) : []))).flat();
  };
}
