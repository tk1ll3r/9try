import type { ComponentType, LazyExoticComponent } from "react";
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

/**
 * A feature plugs into the app by exporting one of these and being listed in `app/modules.ts`.
 * `Services` is whatever the module's own screens need: an application service, a repository.
 */
export interface FeatureModule<Services = unknown> {
  readonly id: string;
  readonly create?: (session: SessionContext) => Services;
  readonly routes?: readonly RouteContribution[];
}

export class ModuleRegistry {
  readonly routes: readonly RouteContribution[];

  constructor(readonly modules: readonly FeatureModule[]) {
    this.routes = modules.flatMap(module => module.routes ?? []);
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
