import type { Page } from "@playwright/test";

export const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
export const kha = "22222222-2222-4222-8222-222222222222";

/**
 * A map without a tile service: the app's two styles are answered with a bare background, each in its
 * own color. That exercises real WebGL and the bundled worker; it is not evidence that tiles arrive.
 * `failed` says, each time a style is asked for, whether the answer is an error.
 */
export async function bareMap(page: Page, failed: () => boolean = () => false) {
  await page.route("**/map/*.json", route => failed() ? route.fulfill({ status: 503, body: "unavailable" })
    : route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": route.request().url().includes("dark") ? "#11130e" : "#f4f1e8" } }] } }));
}

/** Opens every page as a signed-in person. No request reaches an Auth server; the data requests are for the test to answer. */
export async function signIn(page: Page) {
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
}
