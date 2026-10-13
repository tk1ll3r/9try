import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPreferences } from "../domain/Notification";
import { deviceLabel, type PushDevice, type PushSetup, type TestResult } from "../domain/Push";
import { language, t } from "../../../kernel/i18n";

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const toBase64Url = (bytes: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Web Push for this browser, the person's devices, and their notification preferences. */
export class PushData {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  supported(): boolean {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  /** False when the app was built without the key that push needs. */
  configured(): boolean {
    return Boolean(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY);
  }

  private async subscription(): Promise<PushSubscription | null> {
    if (!this.supported()) return null;
    // `serviceWorker.ready` never settles where no worker is registered (the dev server).
    const registration = await navigator.serviceWorker.getRegistration();
    return await registration?.pushManager.getSubscription() ?? null;
  }

  async isSubscribed(): Promise<boolean> {
    return Boolean(await this.subscription());
  }

  /** What the browser says about push right now. */
  async setup(): Promise<PushSetup> {
    const supported = this.supported();
    return { supported, configured: this.configured(), permission: supported ? Notification.permission : "default", subscribed: await this.isSubscribed() };
  }

  /** Stores this browser's address with its name and language. Safe to repeat. */
  private async register(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!p256dh || !auth) throw new Error(t("Trình duyệt chưa đăng ký được thông báo đẩy. Hãy thử lại."));
    const row = { user_id: this.userId, endpoint: subscription.endpoint, p256dh, auth };
    // The name, the language and the time are newer columns. A server without them still takes the address.
    const full = await this.db.from("push_subscriptions").upsert({
      ...row, label: deviceLabel(navigator.userAgent, navigator.maxTouchPoints).slice(0, 80) || null, language, last_seen_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (!full.error) return;
    const { error } = await this.db.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (error) throw error;
  }

  /**
   * This browser's sign-up under the key of this build, made if it is not there. One that was made
   * under another key is given up first: after the server's key pair was replaced, every push to
   * the old address is refused.
   */
  private async signUp(registration: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
    const existing = await registration.pushManager.getSubscription();
    const madeWith = existing?.options.applicationServerKey;
    if (existing && (!madeWith || toBase64Url(madeWith) === publicKey.replace(/=+$/, ""))) return existing;
    if (existing) {
      await this.db.from("push_subscriptions").delete().eq("endpoint", existing.endpoint);
      await existing.unsubscribe();
    }
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToArrayBuffer(publicKey) });
  }

  /**
   * Turns push on for this browser. Call it straight from the tap, with nothing awaited before it:
   * iPhone and iPad ask for the permission only in direct answer to a tap, so the question is the
   * first thing this waits for.
   */
  async enable(): Promise<void> {
    if (!this.supported()) throw new Error(t("Trình duyệt này không hỗ trợ thông báo đẩy."));
    const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey) throw new Error(t("Bản ứng dụng này chưa bật thông báo đẩy."));

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error(t("Bạn chưa cấp quyền gửi thông báo."));
    if (!await navigator.serviceWorker.getRegistration()) throw new Error(t("Thông báo đẩy chưa dùng được ở bản chạy thử này."));

    await this.register(await this.signUp(await navigator.serviceWorker.ready, publicKey));
    await this.savePreferences({ ...await this.preferences(), pushEnabled: true });
  }

  /**
   * Run once when the app starts: a browser that is signed up tells the server it is still there,
   * under its current language. It also puts back an address that the server lost, and signs up
   * again when the key of this build is no longer the one it signed up under.
   */
  async sync(): Promise<void> {
    const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined;
    if (!publicKey || !await this.subscription()) return;
    await this.register(await this.signUp(await navigator.serviceWorker.ready, publicKey));
  }

  /** Turns push off on this browser. The person's other devices keep theirs. */
  async disable(): Promise<void> {
    const subscription = await this.subscription();
    if (subscription) {
      await this.db.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
    // Push stays on for the account while another device is signed up.
    const { count } = await this.db.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", this.userId);
    if (!count) await this.savePreferences({ ...await this.preferences(), pushEnabled: false });
  }

  /** Every device of the person that is signed up for push, newest first. */
  async devices(): Promise<PushDevice[]> {
    const here = (await this.subscription())?.endpoint;
    const { data, error } = await this.db.from("push_subscriptions").select("*").eq("user_id", this.userId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => ({
      id: row.id, label: row.label || t("Thiết bị không rõ tên"), current: row.endpoint === here, createdAt: row.created_at,
      lastSuccessAt: row.last_success_at ?? null, lastFailureAt: row.last_failure_at ?? null, lastError: row.last_error ?? null,
    }));
  }

  /** Takes a device off the list. It gets no more pushes; on that device the app will offer to turn them on again. */
  async removeDevice(id: string): Promise<void> {
    const { error } = await this.db.from("push_subscriptions").delete().eq("user_id", this.userId).eq("id", id);
    if (error) throw error;
  }

  /** Sends a push to every device of the person right now and resolves with what each one's push service answered. */
  async sendTest(): Promise<TestResult[]> {
    const { data, error } = await this.db.functions.invoke("send-test-push", { body: {} });
    if (error) {
      // The error only says that the function refused; the reason is in the function's answer.
      const reason = await (error as { context?: Response }).context?.json?.().then(body => body?.error, () => undefined);
      throw new Error(typeof reason === "string" ? reason : error.message);
    }
    return (data?.devices ?? []) as TestResult[];
  }

  async preferences(): Promise<NotificationPreferences> {
    const { data, error } = await this.db
      .from("notification_preferences")
      .select("*")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) throw error;
    return {
      pushEnabled: data?.push_enabled ?? false,
      quietStart: data?.quiet_start?.slice(0, 5) ?? "",
      quietEnd: data?.quiet_end?.slice(0, 5) ?? "",
      categoryPush: (data?.category_push as Record<string, boolean> | null) ?? {},
      privatePreviews: data?.private_previews ?? false,
    };
  }

  async savePreferences(prefs: NotificationPreferences): Promise<void> {
    const row = {
      user_id: this.userId,
      push_enabled: prefs.pushEnabled,
      quiet_start: prefs.quietStart || null,
      quiet_end: prefs.quietEnd || null,
      category_push: prefs.categoryPush,
      updated_at: new Date().toISOString(),
    };
    const { error } = await this.db.from("notification_preferences").upsert({ ...row, private_previews: prefs.privatePreviews });
    if (!error) return;
    // A server without that newer column still saves the rest, unless the column is what the person asked for.
    if (prefs.privatePreviews) throw error;
    const retry = await this.db.from("notification_preferences").upsert(row);
    if (retry.error) throw retry.error;
  }
}
