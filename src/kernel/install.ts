// Chrome and Edge, on Android and on desktop, offer installation through one event that fires early.
// It is kept from the first moment of the page, so that a screen shown later can still use it.
interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
}

let offer: InstallOffer | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

// Unit tests load this file outside a browser.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); // no automatic banner; the app asks at a moment of its own
    offer = event as InstallOffer;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    offer = undefined;
    changed();
  });
}

export const installOffer = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** True while the browser will show its install dialog when asked. */
  available: () => offer !== undefined,
  /** Shows the browser's install dialog. A browser allows this once per offer. */
  async accept() {
    const current = offer;
    offer = undefined;
    changed();
    await current?.prompt();
  },
};

/** The app was opened from the home screen, not in a browser tab. */
export const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** iPhone and iPad have no install dialog; people add the app from Safari's share menu. */
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
