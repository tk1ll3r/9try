import { lazy, type ComponentType } from "react";
import type { RouteContribution } from "./module";

/** A screen loaded when it is opened, plus a way to start that download at the moment of a press. */
export function lazyRoute(load: () => Promise<{ default: ComponentType }>): Pick<RouteContribution, "component" | "preload"> {
  let started = false;
  return {
    component: lazy(load),
    preload: () => {
      if (started) return;
      started = true;
      void load().catch(() => { started = false; });
    },
  };
}
