import { useEffect } from "react";
import { useModule } from "../../../kernel/session";
import { notificationsModule } from "../notifications.module";

/**
 * Draws nothing. Once for each signed-in session, a browser that is signed up for push tells the
 * server it is still there and which language its app is in, so a push is written in that language.
 */
export function PushSync() {
  const { push } = useModule(notificationsModule);
  useEffect(() => { void push.sync().catch(() => undefined); }, [push]);
  return null;
}
