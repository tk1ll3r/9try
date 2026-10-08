import { UserRoundPen } from "lucide-react";
import { Link } from "react-router-dom";
import { useProfile } from "./useProfile";
import { t } from "../../../kernel/i18n";

/** Shown on Today until the user has a name and a username. */
export function ProfileReminder() {
  const profile = useProfile();
  if (!profile.data || profile.data.complete) return null;
  return (
    <Link to="/me" className="flex items-center gap-3 rounded-2xl bg-[var(--lime)] p-4 text-sm font-semibold text-[#1d230e]">
      <UserRoundPen size={20} className="shrink-0" />
      {t("Đặt tên hiển thị và username để bạn bè tìm thấy bạn.")}
    </Link>
  );
}
