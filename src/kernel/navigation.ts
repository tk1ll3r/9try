import { t } from "./i18n";
import type { NavContribution, NavTab } from "./module";

/** The Menu's screens, grouped by part of the app. */
const sections: readonly { label: string; tabs: readonly NavTab[] }[] = [
  { label: t("Hằng ngày"), tabs: ["mode", "today"] },
  { label: t("Kế hoạch"), tabs: ["plan"] },
  { label: t("Cùng nhau"), tabs: ["chat", "together"] },
  { label: t("Của bạn"), tabs: ["stats"] },
];

/** The five screens of a phone's bottom bar, in order. */
export const primaryScreens = (navigation: readonly NavContribution[]) =>
  navigation.filter(item => item.primary !== undefined).sort((a, b) => a.primary! - b.primary!);

/**
 * All of the app's screens, grouped by part of the app. Child tabs can also be opened directly here;
 * notifications and personal screens already have a fixed button in the top bar.
 */
export function directory(navigation: readonly NavContribution[]): { label: string; items: NavContribution[] }[] {
  const screens = navigation.filter(item => item.tab !== "inbox" && item.tab !== "me" && item.tab !== "menu");
  return sections.map(section => ({
    label: section.label,
    items: section.tabs.flatMap(tab => screens.filter(item => item.tab === tab)),
  })).filter(section => section.items.length);
}
