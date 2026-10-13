/** One browser or installed app that receives the person's push notifications. */
export interface PushDevice {
  id: string;
  /** "Chrome · Android": what the browser said it was when it signed up. */
  label: string;
  /** True for the browser this page runs in. */
  current: boolean;
  createdAt: string;
  /** When a push last reached the device's push service, and when one was last refused. */
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** What the push service answered the last time it refused, such as "HTTP 403". Empty after a success. */
  lastError: string | null;
}

/** What stands between this browser and a push, read from the browser itself. */
export interface PushSetup {
  /** The browser has push at all. On iPhone and iPad only an app on the Home Screen does. */
  supported: boolean;
  /** This build of the app has the key that push needs. */
  configured: boolean;
  /** What the person answered when the browser asked. "default" means it has not asked yet. */
  permission: "granted" | "denied" | "default";
  /** This browser is signed up with its push service. */
  subscribed: boolean;
}

/** What each device's push service answered to a test push. A status from 200 to 299 is a success. */
export interface TestResult {
  device: string;
  status: number;
  error: string | null;
}

const browsers: [RegExp, string][] = [[/Edg\//, "Edge"], [/OPR\/|Opera/, "Opera"], [/SamsungBrowser/, "Samsung Internet"], [/Firefox\/|FxiOS/, "Firefox"], [/Chrome\/|CriOS/, "Chrome"], [/Safari\//, "Safari"]];
const systems: [RegExp, string][] = [[/iPhone|iPod/, "iPhone"], [/iPad/, "iPad"], [/Android/, "Android"], [/Windows/, "Windows"], [/Mac OS X|Macintosh/, "Mac"], [/CrOS/, "ChromeOS"], [/Linux/, "Linux"]];

/**
 * A name for a device that its owner can recognize in a list: the browser and the system, from what
 * the browser says about itself. An iPad that says it is a Mac is told apart by its touch screen.
 */
export function deviceLabel(userAgent: string, touchPoints = 0): string {
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = /Macintosh/.test(userAgent) && touchPoints > 1 ? "iPad" : systems.find(([pattern]) => pattern.test(userAgent))?.[1];
  return [browser, system].filter(Boolean).join(" · ");
}
