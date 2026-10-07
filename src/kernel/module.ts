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
}

/** The app's main destinations. A phone shows five of them as bottom tabs. */
export type NavTab = "today" | "plan" | "chat" | "together" | "inbox" | "me";

/** One screen in the navigation. */
export interface NavContribution {
  readonly tab: NavTab;
  readonly to: string;
  readonly label: string;
  readonly icon: (props: { size?: number }) => ReactNode;
  /** Position inside the tab. The lowest one is where the tab lands. */
  readonly order: number;
  /** A small counter drawn on the icon, such as unread notifications. */
  readonly badge?: ComponentType;
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
  /** Everything of this module that a person may look for by name. The search filters it as they type. */
  searchItems?(services: Services): Promise<readonly SearchItem[]>;
}

export class ModuleRegistry {
  readonly routes: readonly RouteContribution[];
  readonly navigation: readonly NavContribution[];

  constructor(readonly modules: readonly FeatureModule[]) {
    this.routes = modules.flatMap(module => module.routes ?? []);
    this.navigation = modules.flatMap(module => module.navigation ?? []).sort((a, b) => a.order - b.order);
  }

  /**
   * Returns `path` when it is a plain route of a registered module, otherwise "/".
   * Every path that comes from outside the code goes through this: the page to return
   * to after sign-in and the links stored with notifications.
   */
  safePath = (path: string): string => {
    if (!/^\/[A-Za-z0-9_\-/]*$/.test(path) || path.includes("//")) return "/";
    return this.routes.some(route => matchPath(`/${route.path}`, path)) ? path : "/";
  };
}
