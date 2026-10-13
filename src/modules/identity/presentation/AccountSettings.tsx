import { Download, LogOut, Share, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useAuth } from "../../../kernel/auth";
import { installOffer, isInstalled, isIos } from "../../../kernel/install";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { OwnedBooksWarning } from "../../expenses";
import { identityModule } from "../identity.module";
import { profileKey } from "./useProfile";
import { t } from "../../../kernel/i18n";

/** The settings that belong to the account and to the app on this device: install, the user's data, sign-out, deletion. */
export function AccountSettings() {
  const profiles = useModule(identityModule);
  const auth = useAuth();
  const confirm = useConfirm();
  const { run, pending, error } = useAction(profileKey);
  const installable = useSyncExternalStore(installOffer.subscribe, installOffer.available);
  const [message, setMessage] = useState("");
  const [typed, setTyped] = useState("");

  function exportData() {
    setMessage("");
    run(() => profiles.exportData(), data => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gnouht-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(t("Đã tải bản dữ liệu của bạn về máy."));
    });
  }
  async function deleteAccount() {
    if (!await confirm({ title: t("Xóa tài khoản?"), body: t("Hồ sơ, lịch, việc, ghi chú, tin nhắn và mọi dữ liệu khác của bạn sẽ bị xóa. Không thể khôi phục."), action: t("Xóa tài khoản") })) return;
    run(() => profiles.deleteAccount());
  }

  return <>
    {!isInstalled() && (installable || isIos()) && <Card title={t("Cài ứng dụng")}>
      <p className="text-sm leading-6 text-[var(--muted)]">{t("Đưa Gnouht lên màn hình chính để mở nhanh và chạy toàn màn hình.{0}", isIos() ? t(" Trên iPhone và iPad, thông báo đẩy chỉ tới khi ứng dụng đã được cài.") : "")}</p>
      {installable ? <Button className="mt-3" variant="secondary" onClick={() => void installOffer.accept()}><Download size={17} /> {t("Cài ứng dụng")}</Button>
        : <p className="mt-3 flex items-start gap-2 text-sm leading-6"><Share size={17} className="mt-1 shrink-0" /> {t("Mở trang này bằng Safari, chạm nút Chia sẻ, rồi chọn “Thêm vào Màn hình chính”.")}</p>}
    </Card>}

    <Card title={t("Dữ liệu và tài khoản")}>
      {message && <p role="status" className="mb-4 rounded-2xl bg-[var(--soft)] p-3 text-sm">{message}</p>}
      {error && <p role="alert" className="mb-4 rounded-2xl bg-[var(--soft)] p-3 text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold">{t("Tải dữ liệu của bạn")}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("Một tệp JSON chứa những gì Gnouht đang lưu cho tài khoản này.")}</p>
        </div>
        <Button variant="ghost" className="shrink-0" disabled={pending} onClick={exportData}><Download size={17} /> {t("Tải dữ liệu")}</Button>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold">{t("Đăng xuất")}</p>
          <p className="mt-1 break-all text-sm text-[var(--muted)]">{t("Đang đăng nhập bằng {0}.", auth.user?.email ?? t("tài khoản này"))}</p>
        </div>
        <Button variant="ghost" className="shrink-0" onClick={() => void auth.signOut()}><LogOut size={17} /> {t("Đăng xuất")}</Button>
      </div>
      <div className="mt-5 border-t border-[var(--border)] pt-5">
        <p className="font-bold text-[var(--danger)]">{t("Xóa tài khoản")}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("Dữ liệu cá nhân của bạn sẽ bị xóa và không khôi phục được. Nếu bạn là chủ của nhóm có thành viên khác, hãy chuyển quyền chủ nhóm trước.")}</p>
        <OwnedBooksWarning />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="field min-w-0 flex-1" aria-label={t("Xác nhận xóa tài khoản")} value={typed} onChange={event => setTyped(event.target.value)} placeholder={t("Nhập \"XÓA\" để mở nút xóa")} />
          <Button variant="danger" disabled={typed !== t("XÓA") || pending} onClick={() => void deleteAccount()}><Trash2 size={17} /> {t("Xóa tài khoản")}</Button>
        </div>
      </div>
    </Card>
  </>;
}
