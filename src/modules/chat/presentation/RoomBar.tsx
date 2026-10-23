import { useQuery } from "@tanstack/react-query";
import { BellOff, BellRing, DoorOpen, ExternalLink, Lock, UserMinus, UsersRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { MoreMenu, Popover } from "../../../kernel/ui/MoreMenu";
import { chatModule } from "../chat.module";
import { roomSourcePath, type Room } from "../domain/Chat";
import { roomTime } from "./roomTime";
import { chatKey } from "./useChat";
import { t } from "../../../kernel/i18n";

/**
 * What a room adds above its messages: what it is about, when it closes, who is in it, and what a
 * member can do. Everyone can mute or leave; the owner can also take someone out and close the room.
 */
export function RoomBar({ room }: { room: Room }) {
  const chat = useModule(chatModule);
  const me = useUserId();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { run, pending, error } = useAction(chatKey);
  const members = useQuery({ queryKey: [...chatKey, "members", room.id], queryFn: () => chat.roomMembers(room.id) });
  const owner = room.ownerId === me;

  async function close() {
    if (await confirm({ title: t("Đóng phòng?"), body: t("Không ai viết thêm được nữa. Mọi người vẫn đọc được trong 7 ngày, rồi tin nhắn bị xóa."), action: t("Đóng phòng") })) run(() => chat.closeRoom(room.id));
  }
  async function leave() {
    if (await confirm({ title: t("Rời phòng?"), body: t("Bạn sẽ không thấy tin nhắn của phòng này nữa. Khi phòng còn mở, bạn tham gia lại được."), action: t("Rời phòng"), danger: false })) run(() => chat.leaveRoom(room.id), () => navigate("/chat"));
  }
  async function remove(userId: string, name: string) {
    if (await confirm({ title: t("Mời {0} ra khỏi phòng?", name), body: t("{0} sẽ không đọc được phòng này và không tham gia lại được.", name), action: t("Mời ra") })) run(() => chat.removeRoomMember(room.id, userId));
  }

  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-black/8 py-2 text-xs text-[var(--muted)] dark:border-white/8">
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 font-semibold ${room.closed ? "bg-[var(--soft)]" : "bg-[var(--lime)] text-[var(--ink)]"}`}>{room.closed && <Lock size={13} />}{roomTime(room, Date.now())}</span>
    <Link to={roomSourcePath(room, me)} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold underline">{room.source.kind === "meetup" ? t("Mở hoạt động") : room.source.kind === "event" ? t("Mở lịch") : t("Mở Mode")} <ExternalLink size={12} /></Link>
    <span className="ml-auto flex items-center">
      <Popover label={t("Người trong phòng")} trigger={<><UsersRound size={15} /> {members.data?.length ?? room.memberCount}</>} triggerClassName="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold hover:bg-[var(--soft)]" panelClassName="w-64">
        <ul aria-label={t("Người trong phòng")} className="grid gap-1 text-sm text-[var(--ink)]">{(members.data ?? []).map(person => <li key={person.userId} className="flex items-center gap-2 rounded-xl px-1.5 py-1">
          <Avatar name={person.displayName} src={person.avatarUrl} className="size-8 shrink-0 bg-[var(--ink)] text-xs font-bold text-[var(--paper)]" />
          <span className="min-w-0 flex-1 truncate font-semibold">{person.displayName}{person.isOwner && <span className="font-normal text-[var(--muted)]"> · {t("mở phòng")}</span>}</span>
          {owner && !person.isOwner && <button type="button" aria-label={t("Mời {0} ra khỏi phòng", person.displayName)} disabled={pending} onClick={() => void remove(person.userId, person.displayName)} className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--soft)]"><UserMinus size={15} /></button>}
        </li>)}</ul>
      </Popover>
      <MoreMenu label={t("Thao tác với phòng")}>
        <button type="button" disabled={pending} onClick={() => run(() => chat.muteRoom(room.id, !room.muted))}>{room.muted ? <BellRing size={16} /> : <BellOff size={16} />} {room.muted ? t("Bật lại thông báo") : t("Tắt thông báo phòng này")}</button>
        {!owner && <button type="button" disabled={pending} onClick={() => void leave()}><DoorOpen size={16} /> {t("Rời phòng")}</button>}
        {owner && !room.closed && <button type="button" disabled={pending} className="text-[var(--danger)]" onClick={() => void close()}><Lock size={16} /> {t("Đóng phòng")}</button>}
      </MoreMenu>
    </span>
    {error && <p role="alert" className="w-full text-sm text-[var(--danger)]">{error}</p>}
  </div>;
}
