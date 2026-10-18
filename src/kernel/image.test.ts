import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { toJpeg } from "./image";

describe("toJpeg image compression", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes image to webp when supported and within limits", async () => {
    const mockBlob = new Blob(["fake-webp"], { type: "image/webp" });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string) => {
        if (type === "image/webp") {
          callback(mockBlob);
        } else {
          callback(null);
        }
      }),
    };

    vi.stubGlobal("document", {
      createElement: vi.fn((tag: string) => {
        if (tag === "canvas") return mockCanvas;
        return {};
      }),
    });

    vi.stubGlobal("Image", class {
      naturalWidth = 1200;
      naturalHeight = 800;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    });

    const file = new Blob(["raw-image"]);
    const limits = { maxSide: 1080, maxBytes: 300_000 };
    const result = await toJpeg(file, limits);

    expect(result.blob.type).toBe("image/webp");
    expect(result.width).toBe(1080);
    expect(result.height).toBe(720);
  });

  it("falls back to jpeg when webp canvas export returns png", async () => {
    const pngBlob = new Blob(["fake-png"], { type: "image/png" });
    const jpegBlob = new Blob(["fake-jpeg"], { type: "image/jpeg" });
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string) => {
        if (type === "image/webp") {
          // Unsupported WebP in browser returns PNG
          callback(pngBlob);
        } else if (type === "image/jpeg") {
          callback(jpegBlob);
        } else {
          callback(null);
        }
      }),
    };

    vi.stubGlobal("document", {
      createElement: vi.fn((tag: string) => {
        if (tag === "canvas") return mockCanvas;
        return {};
      }),
    });

    vi.stubGlobal("Image", class {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    });

    const file = new Blob(["raw-image"]);
    const limits = { maxSide: 1080, maxBytes: 300_000 };
    const result = await toJpeg(file, limits);

    expect(result.blob.type).toBe("image/jpeg");
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("adaptively downscales when initial compression exceeds maxBytes", async () => {
    // Large blob at first scale (800KB), smaller blob at downscaled dimension (250KB)
    let callCount = 0;
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
        callCount++;
        // If canvas was downscaled (mockCanvas.width < 1080)
        if (mockCanvas.width < 1080) {
          callback(new Blob([new Uint8Array(200_000)], { type: "image/webp" }));
        } else {
          callback(new Blob([new Uint8Array(600_000)], { type: "image/webp" }));
        }
      }),
    };

    vi.stubGlobal("document", {
      createElement: vi.fn((tag: string) => {
        if (tag === "canvas") return mockCanvas;
        return {};
      }),
    });

    vi.stubGlobal("Image", class {
      naturalWidth = 2000;
      naturalHeight = 1500;
      onload: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    });

    const file = new Blob(["raw-image"]);
    const limits = { maxSide: 1080, maxBytes: 300_000 };
    const result = await toJpeg(file, limits);

    expect(result.blob.size).toBeLessThanOrEqual(300_000);
    expect(result.width).toBeLessThan(1080);
    expect(callCount).toBeGreaterThan(5); // initial qualities tried then downscaled
  });

  it("rejects when image cannot be loaded", async () => {
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    });

    const file = new Blob(["invalid-data"]);
    await expect(toJpeg(file, { maxSide: 1080, maxBytes: 300_000 })).rejects.toThrow(
      "Không đọc được ảnh này. Hãy chọn ảnh khác."
    );
  });
});
