import { describe, expect, it } from "vitest";
import { demoPeople, demoMapPoints } from "./demoPeople";

describe("isolated map fixtures", () => {
  it("uses two fictional identities and valid public-location coordinates", () => {
    expect(demoPeople).toHaveLength(2);
    expect(demoPeople.map(person => person.name)).toEqual(["An", "Bình"]);
    for (const person of demoPeople) { expect(person.email).toMatch(/@example\.test$/); expect(Math.abs(person.latitude)).toBeLessThan(90); expect(Math.abs(person.longitude)).toBeLessThan(180); }
  });
  it("changes only returned fixtures and never mutates the source", () => {
    expect(demoMapPoints(["binh"]).map(point => point.name)).toEqual(["An"]);
    expect(demoMapPoints()).toHaveLength(2);
    expect(demoMapPoints(["an", "binh"])).toHaveLength(0);
  });
});
