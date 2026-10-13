import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("error text", () => {
  it("turns a code raised by a SQL function into its Vietnamese text", () => {
    expect(errorMessage({ message: "capacity reached" }, "x")).toBe("Hoạt động vừa đủ số người tham gia.");
    expect(errorMessage(new Error("routine not found"), "x")).toBe("Không tìm thấy thói quen này.");
  });
  it("says the server is behind when a function, table or column of a newer migration is missing", () => {
    for (const code of ["PGRST202", "PGRST205", "42703"]) {
      expect(errorMessage({ code, message: "Could not find the function public.send_message in the schema cache" }, "x")).toBe("Tính năng này chưa dùng được vì máy chủ chưa được cập nhật.");
    }
  });
  it("reads a server function's refusal only when it is the whole message", () => {
    expect(errorMessage(new Error("unauthorized"), "x")).toBe("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
    expect(errorMessage(new Error("push not configured"), "x")).toBe("Máy chủ chưa có khóa để gửi thông báo đẩy.");
    // The same words inside another message are that message's own.
    expect(errorMessage(new Error("Poll temporarily unavailable"), "x")).toBe("Poll temporarily unavailable");
  });
  it("falls back to the given text when the failure says nothing", () => {
    expect(errorMessage(undefined, "Thử lại.")).toBe("Thử lại.");
    expect(errorMessage({ code: "23505", message: "" }, "Thử lại.")).toBe("Thử lại.");
  });
});
