import type { PageWatch } from "../application/OnlineHeartbeat";

/**
 * The page in a browser. It is on screen while the tab is in front and the window not minimised.
 * Safari does not always report a closing tab as hidden, so "pagehide" counts as leaving too, until
 * "pageshow" brings the page back from the browser's back-forward cache.
 */
export function browserPage(): PageWatch {
  let leaving = false;
  return {
    visible: () => !leaving && document.visibilityState === "visible",
    onChange(listener) {
      const hide = () => { leaving = true; listener(); };
      const show = () => { leaving = false; listener(); };
      document.addEventListener("visibilitychange", listener);
      window.addEventListener("pagehide", hide);
      window.addEventListener("pageshow", show);
      return () => {
        document.removeEventListener("visibilitychange", listener);
        window.removeEventListener("pagehide", hide);
        window.removeEventListener("pageshow", show);
      };
    },
  };
}
