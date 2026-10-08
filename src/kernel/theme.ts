/** The app's look: the device's own setting, or a choice kept on this device. */
export type Theme = "system" | "light" | "dark";

// index.html reads the same key before the first paint, so the page never shows the other look first.
const key = "gnouht-theme";
const listeners = new Set<() => void>();
// Unit tests load this file outside a browser.
const deviceDark = typeof window === "undefined" ? undefined : window.matchMedia("(prefers-color-scheme: dark)");

function kept(): Theme {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}

let current: Theme = deviceDark ? kept() : "system";

function apply() {
  document.documentElement.dataset.theme = current === "system" ? (deviceDark?.matches ? "dark" : "light") : current;
}

if (deviceDark) {
  apply();
  // A device that turns dark in the evening takes the app with it, unless a look was chosen.
  deviceDark.addEventListener("change", apply);
}

export const theme = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get: () => current,
  set(next: Theme) {
    current = next;
    try {
      if (next === "system") localStorage.removeItem(key); else localStorage.setItem(key, next);
    } catch { /* Storage may be blocked; the choice then lasts for this visit. */ }
    apply();
    listeners.forEach(listener => listener());
  },
};
