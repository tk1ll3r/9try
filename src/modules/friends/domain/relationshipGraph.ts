import { t } from "../../../kernel/i18n";

export type RelationshipMapStatus = "connected" | "incoming" | "outgoing" | "none";

export interface RelationshipMapFriend {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  status: RelationshipMapStatus;
  relationship: string | null;
  inviteId: string | null;
}

export interface GraphPoint { x: number; y: number }
export interface RelationshipMapNode extends RelationshipMapFriend, GraphPoint {}
export interface RelationshipMapEdge {
  friendId: string;
  a: GraphPoint;
  b: GraphPoint;
  status: Exclude<RelationshipMapStatus, "none">;
  color: string;
}

export interface RelationshipGraphLayout {
  width: number;
  height: number;
  columns: number;
  nodeWidth: number;
  self: GraphPoint;
  nodes: RelationshipMapNode[];
  edges: RelationshipMapEdge[];
}

/** Place the signed-in person above their friends; each line describes only that person's own relationship. */
export function layoutRelationshipGraph(
  friends: readonly RelationshipMapFriend[],
  measuredWidth: number,
): RelationshipGraphLayout {
  const width = Math.max(240, Math.round(measuredWidth));
  const columns = width >= 960 ? 4 : width >= 640 ? 3 : width >= 300 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(friends.length / columns));
  const cellWidth = width / columns;
  const nodeWidth = Math.max(128, Math.min(248, cellWidth - 12));
  const self = { x: width / 2, y: 52 };
  const nodes = friends.map((friend, index) => ({
    ...friend,
    x: (index % columns + 0.5) * cellWidth,
    y: 166 + Math.floor(index / columns) * 112,
  }));
  const edges = nodes.flatMap(person => {
    if (person.status === "none") return [];
    return [{
      friendId: person.userId,
      a: { x: self.x, y: self.y + 38 },
      b: { x: person.x, y: person.y - 39 },
      status: person.status,
      color: person.status === "connected"
        ? relationshipColor(person.relationship ?? "")
        : "var(--relationship-pending)",
    }];
  });
  return { width, height: friends.length ? 214 + (rows - 1) * 112 : 148, columns, nodeWidth, self, nodes, edges };
}

export function relationshipColor(label: string): string {
  const value = label.trim().toLocaleLowerCase();
  if ([t("Tình yêu"), t("Mập")].some(kind => value === kind.toLocaleLowerCase())) return "var(--relationship-love)";
  if (value === t("Gia đình").toLocaleLowerCase()) return "var(--relationship-family)";
  if (value === t("Đồng nghiệp").toLocaleLowerCase()) return "var(--relationship-work)";
  if ([t("Tình bạn"), t("Bạn thân"), t("Bạn bè")].some(kind => value === kind.toLocaleLowerCase())) return "var(--relationship-friendship)";
  return "var(--relationship-custom)";
}

export function relationshipCurve(a: GraphPoint, b: GraphPoint): string {
  const middleY = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${middleY} ${b.x} ${middleY} ${b.x} ${b.y}`;
}
