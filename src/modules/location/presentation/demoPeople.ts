import type { MapPoint } from "./MapCanvas";
import { t } from "../../../kernel/i18n";

export const demoPeople = [
  { id: "an", name: "An", email: "an@example.test", username: "demo_an", place: t("Chợ Bến Thành (điểm công cộng)"), latitude: 10.7725, longitude: 106.6980, task: t("An: chuẩn bị lịch cuối tuần") },
  { id: "binh", name: t("Bình"), email: "binh@example.test", username: "demo_binh", place: t("Nhà hát Thành phố (điểm công cộng)"), latitude: 10.7767, longitude: 106.7036, task: t("Bình: xem các khung giờ hẹn") },
] as const;
export function demoMapPoints(hiddenIds: string[] = []): MapPoint[] {
  return demoPeople.filter(person => !hiddenIds.includes(person.id)).map(person => ({
    id: person.id, name: person.name, latitude: person.latitude, longitude: person.longitude, stale: false, approximate: true,
  }));
}

/**
 * `count` made-up friends on a grid over the centre of Ho Chi Minh City, for trying the map with many
 * people on a real phone. Every `turn` they all move a few metres, as people who share do. One in
 * four has an old position and one in five a rounded one.
 */
export function crowd(count: number, turn = 0): MapPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `crowd-${index}`, name: t("Bạn {0}", index + 1),
    latitude: 10.76 + (index % 10) * 0.004 + Math.sin(turn + index) * 0.0003,
    longitude: 106.68 + Math.floor(index / 10) * 0.006 + Math.cos(turn + index) * 0.0003,
    stale: index % 4 === 0, approximate: index % 5 === 0,
  }));
}
