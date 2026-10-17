import { describe, expect, it, vi, beforeEach } from "vitest";
import { SignedFiles } from "./files";

describe("SignedFiles", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
  });

  it("fetches and caches signed addresses for files", async () => {
    const mockCreateSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: "user1/photo1.webp", signedUrl: "https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/moments/user1/photo1.webp?token=xyz" },
        { path: "user1/photo2.webp", signedUrl: "https://jqmkfgmfisjmqizqyyct.supabase.co/storage/v1/object/sign/moments/user1/photo2.webp?token=abc" }
      ],
      error: null
    });

    const mockDb = {
      storage: {
        from: () => ({
          createSignedUrls: mockCreateSignedUrls,
          upload: vi.fn(),
          remove: vi.fn()
        })
      }
    } as any;

    const files = new SignedFiles(mockDb, "moments");
    const result = await files.addresses(["user1/photo1.webp", "user1/photo2.webp"]);

    expect(result.size).toBe(2);
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);

    // Second call should hit the in-memory cache without calling Supabase again
    const cachedResult = await files.addresses(["user1/photo1.webp"]);
    expect(cachedResult.size).toBe(1);
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("uploads with correct webp content type", async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null });
    const mockDb = {
      storage: {
        from: () => ({
          createSignedUrls: vi.fn(),
          upload: mockUpload,
          remove: vi.fn()
        })
      }
    } as any;

    const files = new SignedFiles(mockDb, "moments");
    const blob = new Blob(["fake-image-bytes"], { type: "image/webp" });
    await files.put("user1/test.webp", blob, 31536000);

    expect(mockUpload).toHaveBeenCalledWith("user1/test.webp", blob, {
      contentType: "image/webp",
      cacheControl: "31536000"
    });
  });

  it("clears cached addresses upon removal", async () => {
    const mockRemove = vi.fn().mockResolvedValue({ error: null });
    const mockDb = {
      storage: {
        from: () => ({
          createSignedUrls: vi.fn(),
          upload: vi.fn(),
          remove: mockRemove
        })
      }
    } as any;

    const files = new SignedFiles(mockDb, "moments");
    await files.remove(["user1/photo1.webp"]);
    expect(mockRemove).toHaveBeenCalledWith(["user1/photo1.webp"]);
    expect(localStorage.getItem("gnouht-file:moments:user1/photo1.webp")).toBeNull();
  });
});
