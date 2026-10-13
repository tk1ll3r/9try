import { Camera, ImagePlus, Plus, Send } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { toJpeg } from "../../../kernel/image";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { PeoplePicker, useAcceptedFriends } from "../../friends";
import { choices, quickDefaults, choiceOf, useCustomModes, CustomModeDialog, type CustomActivityMode } from "../../presence";
import { captionLength, photoLimits } from "../domain/Moment";
import { momentsModule } from "../moments.module";
import { momentsKey } from "./useMoments";
import { t } from "../../../kernel/i18n";

const viewersKey = "gnouht-moment-viewers";
/** The friends the person chose last time on this device. None means the last photo was for every friend. */
function rememberedViewers(): string[] {
  try { const stored = JSON.parse(localStorage.getItem(viewersKey) ?? "[]"); return Array.isArray(stored) ? stored.filter(id => typeof id === "string") : []; } catch { return []; }
}

interface Prepared { blob: Blob; width: number; height: number; preview: string }

/**
 * Posting a photo: take or choose it, add a line and the activity it belongs to, say who sees it.
 * The photo is redrawn smaller on this device before anything is sent, which also drops the place
 * and the device a camera writes into the file.
 */
export function MomentComposer({ open, onOpenChange, mode, modeMinutes = 120 }: { open: boolean; onOpenChange(open: boolean): void; mode?: string; modeMinutes?: number }) {
  const repository = useModule(momentsModule);
  const { run, pending, error } = useAction(momentsKey);
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState("");
  const [caption, setCaption] = useState("");
  const [attached, setAttached] = useState<string | null>(mode ?? null);
  const [creatingMode, setCreatingMode] = useState(false);
  const customModes = useCustomModes();
  const [viewerIds, setViewerIds] = useState(rememberedViewers);
  const [chosenOnly, setChosenOnly] = useState(() => rememberedViewers().length > 0);
  // Someone chosen last time may no longer be a friend. They are not in the list to untick, and the server refuses a photo for them.
  const friends = useAcceptedFriends();
  const chosen = viewerIds.filter(id => friends.some(friend => friend.userId === id));

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);
  useEffect(() => {
    if (open) setAttached(mode ?? null);
    else { setPhoto(null); setCaption(""); setProblem(""); }
  }, [open, mode]);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setProblem(""); setPreparing(true);
    try {
      const made = await toJpeg(file, photoLimits);
      setPhoto({ ...made, preview: URL.createObjectURL(made.blob) });
    } catch (cause) { setProblem(cause instanceof Error && cause.message ? cause.message : t("Không đọc được ảnh này. Hãy chọn ảnh khác.")); }
    finally { setPreparing(false); }
  }

  function post() {
    if (!photo) return;
    const viewers = chosenOnly ? chosen : null;
    run(() => repository.post({ blob: photo.blob, width: photo.width, height: photo.height, mode: attached, caption: caption.trim(), viewerIds: viewers, activateMode: !!attached && attached !== mode, modeMinutes }), () => {
      try { localStorage.setItem(viewersKey, JSON.stringify(viewers ?? [])); } catch { /* The choice then lasts for this photo only. */ }
      onOpenChange(false);
    });
  }

  // The activity the person has on comes first, then the ones offered for one tap on the Mode screen.
  const offered = [...new Set([...(mode ? [mode] : []), ...quickDefaults])].flatMap(id => {
    const builtin = choices.find(choice => choice.id === id);
    if (builtin) return [builtin];
    const custom = customModes.data?.find(item => item.mode === id);
    return custom ? [choiceOf(custom.mode, custom)!] : [];
  }).concat((customModes.data ?? []).map(item => choiceOf(item.mode, item)!));
  const uniqueOffered = [...new Map(offered.map(choice => [choice.id, choice])).values()];
  const source = "pressable flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl bg-[var(--soft)] p-4 text-sm font-semibold focus-within:ring-2 focus-within:ring-[var(--focus)]";
  const chip = "inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold";

  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} size="sm" returnFocusId="post-moment" title={t("Đăng ảnh")}
    description={t("Story hiện với bạn bè trong 24 giờ. Ảnh được lưu ngay vào kho riêng với cùng quyền xem. Vị trí và thông tin máy ảnh ghi trong file không được gửi đi.")}>
    {!photo && <div className="grid gap-3 sm:grid-cols-2">
      <label className={source}><Camera size={24} /> {t("Chụp ảnh")}<input type="file" accept="image/*" capture="environment" className="sr-only" disabled={preparing} onChange={event => void pick(event)} /></label>
      <label className={source}><ImagePlus size={24} /> {t("Chọn ảnh có sẵn")}<input type="file" accept="image/*" className="sr-only" disabled={preparing} onChange={event => void pick(event)} /></label>
    </div>}
    {preparing && <p role="status" className="mt-3 text-sm text-[var(--muted)]">{t("Đang chuẩn bị ảnh…")}</p>}
    {problem && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{problem}</p>}

    {photo && <div className="space-y-4">
      <div className="flex items-end gap-3">
        <img src={photo.preview} alt={t("Ảnh sắp đăng")} className="max-h-56 max-w-[60%] rounded-2xl object-contain" />
        <Button variant="ghost" disabled={pending} onClick={() => setPhoto(null)}>{t("Đổi ảnh")}</Button>
      </div>
      <label className="block text-sm font-semibold">{t("Chú thích (không bắt buộc)")}
        <input className="field mt-1 w-full" maxLength={captionLength} value={caption} onChange={event => setCaption(event.target.value)} placeholder={t("Viết một dòng…")} />
      </label>
      <fieldset>
        <legend className="text-sm font-semibold">{t("Bạn đang làm gì? (không bắt buộc)")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {uniqueOffered.map(choice => <button key={choice.id} type="button" aria-pressed={attached === choice.id} onClick={() => setAttached(attached === choice.id ? null : choice.id)}
            className={`${chip} ${attached === choice.id ? "text-white" : "bg-[var(--soft)]"}`} style={attached === choice.id ? { background: choice.color } : undefined}>
            <choice.Icon size={16} /> {choice.label}
          </button>)}
        </div>
        <button type="button" onClick={() => setCreatingMode(true)} className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--soft)]"><Plus size={15}/>{t("Tạo mode riêng")}</button>
        {attached && attached !== mode && <p className="mt-1 text-xs text-[var(--muted)]">{t("Mode này sẽ được bật cho bạn khi đăng ảnh.")}</p>}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">{t("Ai thấy ảnh này")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-pressed={!chosenOnly} onClick={() => setChosenOnly(false)} className={`${chip} ${chosenOnly ? "bg-[var(--soft)]" : "bg-[var(--ink)] text-[var(--paper)]"}`}>{t("Mọi bạn bè")}</button>
          <button type="button" aria-pressed={chosenOnly} onClick={() => setChosenOnly(true)} className={`${chip} ${chosenOnly ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)]"}`}>{t("Chỉ những người tôi chọn")}</button>
        </div>
        {chosenOnly && <div className="mt-2"><PeoplePicker legend={t("Gửi cho")} value={chosen} onChange={setViewerIds} /></div>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <Button className="w-full" disabled={pending || (chosenOnly && !chosen.length)} onClick={post}><Send size={17} /> {pending ? t("Đang đăng…") : t("Đăng")}</Button>
    </div>}
    <CustomModeDialog open={creatingMode} onOpenChange={setCreatingMode} onCreated={(created: CustomActivityMode) => setAttached(created.mode)} />
  </DialogPanel>;
}
