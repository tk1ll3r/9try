import { useCallback, useEffect, useRef, useState } from "react";
import type { Coordinates } from "../domain/Location";

export interface MyPosition extends Coordinates {
  accuracyM: number;
}

/**
 * "off": never asked. "asking": waiting for the person or for the first position. "on": following.
 * "denied": the browser refuses this site. "unavailable": allowed, but no position could be read.
 */
export type MyPositionStatus = "off" | "asking" | "on" | "denied" | "unavailable";

/**
 * The viewer's own position, for the screen that asks. It starts when they ask, lives in this
 * screen's memory and stops when the screen closes. Nothing in this file can send it anywhere:
 * sharing a position with friends is the session in LocationController, which they start themselves.
 */
export function useMyPosition(gps: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined = navigator.geolocation) {
  const [state, setState] = useState<{ status: MyPositionStatus; position?: MyPosition }>({ status: "off" });
  const watch = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (watch.current !== null) gps?.clearWatch(watch.current);
    watch.current = null;
  }, [gps]);
  useEffect(() => stop, [stop]);

  /** Asks the browser for the position and keeps following it. Asking again starts over, which is how a refusal is retried. */
  const locate = useCallback(() => {
    if (!gps) { setState({ status: "unavailable" }); return; }
    stop();
    setState(previous => ({ ...previous, status: previous.position ? "on" : "asking" }));
    watch.current = gps.watchPosition(
      found => setState({ status: "on", position: { latitude: found.coords.latitude, longitude: found.coords.longitude, accuracyM: found.coords.accuracy } }),
      error => {
        // 1 is a refusal. Anything else is a reading that failed: the browser keeps trying, and a position already shown stays.
        if (error.code === 1) { stop(); setState({ status: "denied" }); }
        else setState(previous => previous.position ? previous : { status: "unavailable" });
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }, [gps, stop]);

  return { ...state, locate };
}
