import { describe, expect, it } from "vitest";
import { deviceLabel } from "./domain/Push";

describe("the name of a device in the list of devices", () => {
  it("is the browser and the system, as the browser tells them", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36")).toBe("Chrome · Android");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari · iPhone");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0")).toBe("Edge · Windows");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox · Linux");
  });
  it("tells an iPad that says it is a Mac by its touch screen", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
    expect(deviceLabel(mac, 0)).toBe("Safari · Mac");
    expect(deviceLabel(mac, 5)).toBe("Safari · iPad");
  });
  it("is empty for a browser it does not know, so the list says so instead of guessing", () => {
    expect(deviceLabel("SomethingNew/1.0")).toBe("");
  });
});
