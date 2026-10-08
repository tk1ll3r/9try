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
