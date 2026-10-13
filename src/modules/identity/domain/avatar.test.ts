import { describe, expect, it } from "vitest";
import { cropSquare } from "./avatar";

describe("the square a profile picture is cut to", () => {
  it("is the largest one in the middle until the person moves it", () => {
    expect(cropSquare(400, 300, 1, 0.5, 0.5)).toEqual({ left: 50, top: 0, side: 300 });
    expect(cropSquare(300, 400, 1, 0.5, 0.5)).toEqual({ left: 0, top: 50, side: 300 });
  });
  it("gets smaller with the zoom and reaches every corner", () => {
    expect(cropSquare(400, 300, 2, 0, 0)).toEqual({ left: 0, top: 0, side: 150 });
    expect(cropSquare(400, 300, 2, 1, 1)).toEqual({ left: 250, top: 150, side: 150 });
  });
  it("never leaves the picture", () => {
    expect(cropSquare(400, 300, 0.2, -3, 7)).toEqual({ left: 0, top: 0, side: 300 });
  });
});
