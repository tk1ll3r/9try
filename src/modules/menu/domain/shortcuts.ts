/** The screens offered as shortcuts until the person chooses their own. */
export const defaultShortcuts: readonly string[] = ["/calendar", "/me/friends", "/habits", "/notes"];

/** Two rows of four on a phone. */
export const shortcutLimit = 8;

/**
 * The chosen screens that this person can still open, in the order they chose them. A screen that
 * left the app, or one the account lost the right to see, drops out without a trace.
 */
export function pickShortcuts<Screen extends { to: string }>(screens: readonly Screen[], chosen: readonly string[] | null): Screen[] {
  return (chosen ?? defaultShortcuts).flatMap(to => screens.find(screen => screen.to === to) ?? []).slice(0, shortcutLimit);
}

/** Adds a screen at the end or takes it out. A full row takes no more. */
export function toggleShortcut(chosen: readonly string[], to: string): string[] {
  if (chosen.includes(to)) return chosen.filter(item => item !== to);
  return chosen.length < shortcutLimit ? [...chosen, to] : [...chosen];
}
