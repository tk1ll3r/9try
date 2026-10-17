import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {},
}));

// @ts-expect-error worker is vanilla JS
import { handleMedia } from "../../worker/index.js";

describe("Worker handleMedia", () => {
  const dummyCtx = {
    waitUntil: vi.fn(),
  };

  it("rejects malformed media paths", async () => {
    const req = new Request("https://9try.gnouht.space/media/invalid");
    const res = await handleMedia(req, {}, dummyCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Bad media path");
  });

  it("rejects unauthorized buckets", async () => {
    const req = new Request("https://9try.gnouht.space/media/vault/secret.key?origin=https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/vault/secret.key?token=123");
    const res = await handleMedia(req, {}, dummyCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid media bucket or path");
  });

  it("rejects missing origin parameter", async () => {
    const req = new Request("https://9try.gnouht.space/media/moments/photo.webp");
    const res = await handleMedia(req, {}, dummyCtx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing origin parameter");
  });

  it("blocks SSRF to non-Supabase hosts", async () => {
    const req = new Request("https://9try.gnouht.space/media/moments/photo.webp?origin=https://attacker.com/storage/v1/object/sign/moments/photo.webp?token=abc");
    const res = await handleMedia(req, {}, dummyCtx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Untrusted origin host");
  });

  it("blocks cross-tenant authorization bypass from other Supabase projects", async () => {
    const req = new Request("https://9try.gnouht.space/media/moments/photo.webp?origin=https://evil-project.supabase.co/storage/v1/object/sign/moments/photo.webp?token=abc");
    const res = await handleMedia(req, {}, dummyCtx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Untrusted origin host");
  });

  it("blocks origin path mismatch with requested bucket or key", async () => {
    const req = new Request("https://9try.gnouht.space/media/moments/victim_photo.webp?origin=https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/moments/other_photo.webp?token=abc");
    const res = await handleMedia(req, {}, dummyCtx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Origin path or token mismatch");
  });

  it("blocks origin URLs without a token", async () => {
    const req = new Request("https://9try.gnouht.space/media/moments/photo.webp?origin=https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/moments/photo.webp");
    const res = await handleMedia(req, {}, dummyCtx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Origin path or token mismatch");
  });

  it("verifies user token authorization against Supabase on R2 cache hit", async () => {
    const r2Key = "moments/photo.webp";
    const origin = "https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/moments/photo.webp?token=expired_token";
    const mockR2 = {
      get: vi.fn().mockResolvedValue({
        body: new ReadableStream(),
        writeHttpMetadata: vi.fn(),
      }),
      put: vi.fn(),
    };

    // Simulate Supabase rejecting the expired token during HEAD check
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    const req = new Request(`https://9try.gnouht.space/media/${r2Key}?origin=${encodeURIComponent(origin)}`);
    const res = await handleMedia(req, { MEDIA: mockR2 }, dummyCtx);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized media access");
  });

  it("serves from R2 cache when token is valid and sets security headers", async () => {
    const r2Key = "moments/photo.webp";
    const origin = "https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/moments/photo.webp?token=valid_token";
    const mockR2 = {
      get: vi.fn().mockResolvedValue({
        body: "image-bytes",
        writeHttpMetadata: (headers: Headers) => {
          headers.set("Content-Type", "image/webp");
        },
      }),
      put: vi.fn(),
    };

    // Simulate Supabase accepting the token during HEAD check
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const req = new Request(`https://9try.gnouht.space/media/${r2Key}?origin=${encodeURIComponent(origin)}`);
    const res = await handleMedia(req, { MEDIA: mockR2 }, dummyCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("streams from Supabase and caches to R2 on cache miss", async () => {
    const r2Key = "chat/msg1/pic.webp";
    const origin = "https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/chat/msg1/pic.webp?token=valid_token";
    const mockR2 = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue({}),
    };

    const upstreamStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("fresh-image-data"));
        controller.close();
      }
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(upstreamStream, {
      status: 200,
      headers: { "Content-Type": "image/webp" }
    })));

    const req = new Request(`https://9try.gnouht.space/media/${r2Key}?origin=${encodeURIComponent(origin)}`);
    const res = await handleMedia(req, { MEDIA: mockR2 }, dummyCtx);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("MISS");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(dummyCtx.waitUntil).toHaveBeenCalled();
  });
});
