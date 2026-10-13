import { useEffect } from "react";
import { useModule } from "../../../kernel/session";
import { presenceModule } from "../presence.module";

/** Starts the heartbeat with the signed-in app. It stops when the session ends. */
export function PresenceBeacon() {
  const { heartbeat } = useModule(presenceModule);
  useEffect(() => { heartbeat.start(); }, [heartbeat]);
  return null;
}
