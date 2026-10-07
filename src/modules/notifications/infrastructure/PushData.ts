import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPreferences } from "../domain/Notification";

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Web Push for this browser, plus the signed-in user's notification preferences. */
export class PushData {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  supported(): boolean {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  async isSubscribed(): Promise<boolean> {
    if (!this.supported()) return false;
    // `serviceWorker.ready` never settles where no worker is registered (the dev server).
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(await registration?.pushManager.getSubscription());
  }

  async enable(): Promise<void> {
    if (!this.supported()) throw new Error("Trình duyệt này không hỗ trợ web push.");
    const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey) throw new Error("Web push chưa được cấu hình trên môi trường này.");
    if (!await navigator.serviceWorker.getRegistration()) throw new Error("Web push chưa dùng được ở bản chạy thử này vì chưa có service worker.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Bạn chưa cấp quyền gửi thông báo.");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToArrayBuffer(publicKey),
      });
    }

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!p256dh || !auth) throw new Error("Không đọc được khóa push subscription.");

    const { error } = await this.db.from("push_subscriptions").upsert({
      user_id: this.userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
    }, { onConflict: "endpoint" });
    if (error) throw error;

    await this.savePreferences({ ...await this.preferences(), pushEnabled: true });
  }

  async disable(): Promise<void> {
    const registration = this.supported() ? await navigator.serviceWorker.getRegistration() : undefined;
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await this.db.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
    await this.savePreferences({ ...await this.preferences(), pushEnabled: false });
  }

  async preferences(): Promise<NotificationPreferences> {
    const { data, error } = await this.db
      .from("notification_preferences")
      .select("push_enabled,quiet_start,quiet_end,category_push")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) throw error;
    return {
      pushEnabled: data?.push_enabled ?? false,
      quietStart: data?.quiet_start?.slice(0, 5) ?? "",
      quietEnd: data?.quiet_end?.slice(0, 5) ?? "",
      categoryPush: (data?.category_push as Record<string, boolean> | null) ?? {},
    };
  }

  async savePreferences(prefs: NotificationPreferences): Promise<void> {
    const { error } = await this.db.from("notification_preferences").upsert({
      user_id: this.userId,
      push_enabled: prefs.pushEnabled,
      quiet_start: prefs.quietStart || null,
      quiet_end: prefs.quietEnd || null,
      category_push: prefs.categoryPush,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}
