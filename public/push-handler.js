// The part of the service worker that receives a push and opens the app from it. vite.config.ts adds it to
// the generated worker. A push is text from a server, so the link in it is followed only when it is a plain
// path of this app; the worker that sends it (supabase/functions/_shared/notificationTexts.ts) has the same rule.
const inApp = (url) => typeof url === "string" && /^\/[A-Za-z0-9_\-/]*$/.test(url) && !url.includes("//") ? url : "/notifications";

self.addEventListener("push", (event) => {
  let payload = { title: "Gnouht Together", body: "Bạn có thông báo mới.", url: "/notifications" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(String(payload.title || "Gnouht Together"), {
      body: String(payload.body ?? ""),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: inApp(payload.url) },
      // A later push about the same thing replaces the earlier one instead of stacking under it.
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(inApp(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      // A window of the app that is already open is brought to the front and taken to the screen.
      const open = clients.find((client) => client.url === target) ?? clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(target);
      if (open.url !== target && "navigate" in open) await open.navigate(target).catch(() => undefined);
      return "focus" in open ? open.focus() : undefined;
    }),
  );
});
