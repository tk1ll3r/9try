import type { CSSProperties } from "react";
import type { CalendarEntry } from "../domain/calendarView";

/** Sets `--tone`, the color an entry's own classes are drawn in. The colors are in styles.css. */
export const toneOf = (entry: CalendarEntry) => ({ "--tone": `var(--tone-${entry.tone})` }) as CSSProperties;
