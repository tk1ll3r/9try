import { requireSupabase } from "../../../shared/infrastructure/supabase";

export interface NotificationPreferences {
  pushEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  categoryPush: Record<string, boolean>;
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export class PushData {
  supported(): boolean {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  async isSubscribed(): Promise<boolean> {
    if (!this.supported()) return false;
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
  }

  async enable(userId: string): Promise<void> {
    if (!this.supported()) throw new Error("Trình duyệt này không hỗ trợ web push.");
    const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey) throw new Error("Web push chưa được cấu hình trên môi trường này.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Bạn chưa cấp quyền gửi thông báo.");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!p256dh || !auth) throw new Error("Không đọc được khóa push subscription.");

    const db = requireSupabase();
    const { error: subError } = await db.from("push_subscriptions").upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
    }, { onConflict: "endpoint" });
    if (subError) throw subError;

    const current = await this.preferences(userId);
    await this.savePreferences(userId, { ...current, pushEnabled: true });
  }

  async disable(userId: string): Promise<void> {
    if (this.supported()) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await requireSupabase().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
    }
    const current = await this.preferences(userId);
    await this.savePreferences(userId, { ...current, pushEnabled: false });
  }

  async preferences(userId: string): Promise<NotificationPreferences> {
    const { data, error } = await requireSupabase()
      .from("notification_preferences")
      .select("push_enabled,quiet_start,quiet_end,category_push")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return {
      pushEnabled: data?.push_enabled ?? false,
      quietStart: data?.quiet_start?.slice(0, 5) ?? "",
      quietEnd: data?.quiet_end?.slice(0, 5) ?? "",
      categoryPush: (data?.category_push as Record<string, boolean> | null) ?? {},
    };
  }

  async savePreferences(userId: string, prefs: NotificationPreferences): Promise<void> {
    const { error } = await requireSupabase().from("notification_preferences").upsert({
      user_id: userId,
      push_enabled: prefs.pushEnabled,
      quiet_start: prefs.quietStart || null,
      quiet_end: prefs.quietEnd || null,
      category_push: prefs.categoryPush,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

export const pushData = new PushData();
