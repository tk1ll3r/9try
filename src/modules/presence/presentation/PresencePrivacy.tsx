import { useQuery } from "@tanstack/react-query";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { presenceModule } from "../presence.module";
import { choiceOf, presenceKey } from "./modes";

export function PresencePrivacy() {
  const presence = useModule(presenceModule);
  const userId = useUserId();
  const list = useQuery({ queryKey: presenceKey, queryFn: () => presence.list() });
  const { run, pending, error } = useAction(presenceKey);
  const mine = list.data?.find(item => item.userId === userId && Date.parse(item.expiresAt) > Date.now());
  const label = choiceOf(mine?.mode)?.label;

  return <Card title="Mode của bạn">
    {mine ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm leading-6">Mọi bạn bè của bạn thấy mode “{label}” tới {new Date(mine.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}.</p>
      <Button variant="danger" disabled={pending} onClick={() => run(() => presence.set(null, 0))}>Tắt mode</Button>
    </div> : <p className="text-sm leading-6 text-[var(--muted)]">{list.isError ? "Chưa tải được mode của bạn." : "Bạn không bật mode nào. Mode do bạn tự chọn và tự tắt khi hết hạn."}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}
