import { describe, expect, it } from "vitest";
import { layoutRelationshipGraph, relationshipCurve, relationshipColor, type RelationshipMapFriend } from "./relationshipGraph";

const friend = (userId: string, status: RelationshipMapFriend["status"], relationship: string | null = null) => ({
  userId, displayName: userId, username: null, avatarUrl: null, status, relationship, inviteId: null,
}) satisfies RelationshipMapFriend;

describe("relationship graph layout", () => {
  it("centers the signed-in person and keeps every friend's node tappable on a phone", () => {
    const layout = layoutRelationshipGraph([
      friend("a", "connected", "Tình yêu"), friend("b", "incoming"), friend("c", "outgoing"), friend("d", "none"), friend("e", "connected", "Gia đình"),
    ], 358);
    expect(layout.width).toBe(358);
    expect(layout.columns).toBe(2);
    expect(layout.height).toBeGreaterThan(200);
    expect(layout.nodes).toHaveLength(5);
    expect(layout.nodeWidth).toBeGreaterThanOrEqual(128);
    expect(layout.edges).toHaveLength(4);
    expect(layout.edges[0]).toMatchObject({ friendId: "a", color: "var(--relationship-love)", status: "connected" });
    expect(layout.edges[0].a.y).toBeGreaterThan(layout.self.y);
    expect(layout.edges[0].b.y).toBeLessThan(layout.nodes[0].y);
  });

  it("uses more columns on larger screens while capping the graph density", () => {
    expect(layoutRelationshipGraph([], 768).columns).toBe(3);
    expect(layoutRelationshipGraph(Array.from({ length: 10 }, (_, i) => friend(String(i), "none")), 1280).columns).toBe(4);
  });

  it("draws smooth connections and assigns semantic, theme-aware colors", () => {
    expect(relationshipCurve({ x: 80, y: 60 }, { x: 260, y: 176 })).toMatch(/^M 80 60 C 80 118 260 118 260 176$/);
    expect(relationshipColor("Bạn thân")).toBe("var(--relationship-friendship)");
    expect(relationshipColor("Gia đình")).toBe("var(--relationship-family)");
  });
});
