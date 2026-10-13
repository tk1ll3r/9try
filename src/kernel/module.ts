import type { ComponentType, LazyExoticComponent, ReactNode } from "react";
import { matchPath } from "react-router-dom";

/** What a module's services are built from: one signed-in user. */
export interface SessionContext {
  readonly userId: string;
}

export interface RouteContribution {
  /** React Router path relative to "/". The home page is "". */
  readonly path: string;
  readonly component: ComponentType | LazyExoticComponent<ComponentType>;
  /** Starts the screen's download. A press on its link calls this before the click navigates. */
  readonly preload?: () => void;
}

/** Starts the download of the screen `to` opens. A longer matching path wins over a prefix. */
export function preloadRoute(routes: readonly RouteContribution[], to: string): void {
  let best: RouteContribution | undefined;
  let score = -1;
  for (const route of routes) {
    if (!route.preload) continue;
    const pattern = route.path ? `/${route.path}` : "/";
    if (matchPath({ path: pattern, end: true }, to) && pattern.length > score) {
      score = pattern.length;
      best = route;
    }
  }
  best?.preload?.();
}

/** Handlers for a link: the screen starts downloading when the pointer arrives, before the click. */
export function warmHandlers(routes: readonly RouteContribution[], to: string) {
  const go = () => preloadRoute(routes, to);
  return { onPointerEnter: go, onPointerDown: go, onFocus: go };
}

/**
 * The part of the app a screen belongs to. "inbox" and "me" are the bell and the account menu in the top
 * right corner. The others only group the screens in the Menu; see `menuSections`.
 */
export type NavTab = "today" | "mode" | "plan" | "chat" | "together" | "stats" | "inbox" | "me" | "menu";

/** One screen in the navigation. */
export interface NavContribution {
  readonly tab: NavTab;
  readonly to: string;
  readonly label: string;
  readonly icon: (props: { size?: number }) => ReactNode;
  /** Position among the screens of the same part of the app. */
  readonly order: number;
  /** Position in the bar at the bottom of a phone, which holds five screens. */
  readonly primary?: number;
  /**
   * A capability the account must hold for this screen to be listed, such as "couple_expenses". The
   * server gives capabilities and checks them itself; see `kernel/features.ts`.
   */
  readonly feature?: string;
  /** A small counter drawn on the icon, such as unread notifications. */
  readonly badge?: ComponentType;
  /**
   * The `to` of the entry this screen belongs under. Such a screen is not listed in the menu; it is
   * reached through a strip of tabs on its parent, as "Thói quen" is under "Việc".
   */
  readonly parent?: string;
}

/** A card on the Today screen. A card with nothing to say renders nothing. */
export interface TodayContribution {
  /** Lower comes first: things waiting for an answer use 0–9, plans 10–39, people 40 and up. */
  readonly order: number;
  readonly card: ComponentType;
}

/** A card on the statistics screen: what a module can count about the last `days` days, today included. */
export interface StatsContribution {
  /** Lower comes first: the user's own work 10–39, time 40–59, other people 60 and up. */
  readonly order: number;
  readonly card: ComponentType<{ days: number }>;
}

/** Something with a time that another module puts on the calendar and under "Sắp tới", such as a confirmed meetup. */
export interface AgendaItem {
  readonly id: string;
  readonly title: string;
  /** Start and end as ISO instants. */
  readonly start: string;
  readonly end: string;
  /** What it is, shown next to the title: "Hoạt động". */
  readonly kind: string;
  /** Where a tap leads. */
  readonly to: string;
}

/** Something a module knows about one of the user's friends right now. The Mode screen sorts friends by these. */
export interface FriendSignal {
  readonly userId: string;
  /** What kind of reason this is: "meetup", "unread", "location". The ranking gives each kind a weight. */
  readonly kind: string;
  /** How strong it is, from 0 to 1. */
  readonly strength: number;
  /** Shown on the friend's card: "Hẹn 18:00 hôm nay · Ăn tối". A signal without a label only counts. */
  readonly label?: string;
  /** Where a tap on the label leads. */
  readonly to?: string;
}

/** One thing the global search can find. */
export interface SearchItem {
  readonly title: string;
  /** What kind of thing it is, shown next to the title: "Việc", "Ghi chú". */
  readonly kind: string;
  readonly to: string;
  /** More text to match against, such as the body of a note. It is not shown. */
  readonly keywords?: string;
}

/**
 * A feature plugs into the app by exporting one of these and being listed in `app/modules.ts`.
 * `Services` is whatever the module's own screens need: an application service, a repository.
 */
export interface FeatureModule<Services = unknown> {
  readonly id: string;
  readonly create?: (session: SessionContext) => Services;
  readonly routes?: readonly RouteContribution[];
  readonly navigation?: readonly NavContribution[];
  /** A banner shown on every screen while it has something to say, such as "sharing location". */
  readonly indicator?: ComponentType;
  /** A section of the privacy screen: what this module shows to other people right now, and how to stop it. */
  readonly privacy?: ComponentType;
  /** A section of the settings screen: what this module lets the person set up, such as push notifications. */
  readonly settings?: ComponentType;
  /** Everything of this module that a person may look for by name. The search filters it as they type. */
  searchItems?(services: Services): Promise<readonly SearchItem[]>;
  readonly today?: TodayContribution;
  readonly stats?: StatsContribution;
  /** What this module adds to the calendar between two instants. The calendar's own events are not listed here. */
  agenda?(services: Services, from: Date, to: Date): Promise<readonly AgendaItem[]>;
  /** What this module knows about the user's friends at `now`. */
  friendSignals?(services: Services, context: { readonly userId: string; readonly now: Date }): Promise<readonly FriendSignal[]>;
}

/** A path of plain segments. Used in a link, it cannot lead outside the app. */
export const isPlainPath = (path: string) => /^\/[A-Za-z0-9_\-/]*$/.test(path) && !path.includes("//");

export class ModuleRegistry {
  readonly routes: readonly RouteContribution[];
  readonly navigation: readonly NavContribution[];
  readonly today: readonly TodayContribution[];
  readonly stats: readonly StatsContribution[];

  constructor(readonly modules: readonly FeatureModule[]) {
    this.routes = modules.flatMap(module => module.routes ?? []);
    this.navigation = modules.flatMap(module => module.navigation ?? []).sort((a, b) => a.order - b.order);
    this.today = modules.flatMap(module => module.today ?? []).sort((a, b) => a.order - b.order);
    this.stats = modules.flatMap(module => module.stats ?? []).sort((a, b) => a.order - b.order);
  }

  /**
   * Returns `path` when it is a plain route of a registered module, otherwise "/".
   * Every path that comes from outside the code goes through this: the page to return
   * to after sign-in and the links stored with notifications.
   */
  safePath = (path: string): string => {
    if (!isPlainPath(path)) return "/";
    return this.routes.some(route => matchPath(`/${route.path}`, path)) ? path : "/";
  };
}
