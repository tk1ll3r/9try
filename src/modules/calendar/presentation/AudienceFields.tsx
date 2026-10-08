import { PeoplePicker } from "../../friends";
import { useMyGroups } from "../../groups";
import { audienceNames } from "../domain/calendarView";
import type { CalendarVisibility } from "../domain/Occurrence";
import { t } from "../../../kernel/i18n";

export interface AudienceChoice {
  visibility: CalendarVisibility;
  userIds: string[];
  /** "" while no group is chosen. */
  groupId: string;
}

export const onlyMe: AudienceChoice = { visibility: "only_me", userIds: [], groupId: "" };

/** What is missing from a choice, as a sentence to show, or "" when it can be saved. */
export function audienceProblem(choice: AudienceChoice): string {
  if (choice.visibility === "selected_friends" && !choice.userIds.length) return t("Hãy chọn ít nhất một người bạn được xem sự kiện.");
  if (choice.visibility === "group" && !choice.groupId) return t("Hãy chọn nhóm được xem sự kiện.");
  return "";
}

/** "Ai được xem?", with the friends or the group that the answer needs. Made for a two-column form. */
export function AudienceFields({ value, onChange }: { value: AudienceChoice; onChange(next: AudienceChoice): void }) {
  const groups = useMyGroups().data ?? [];
  return <>
    <label className="grid gap-1 text-sm font-semibold">{t("Ai được xem?")}
      <select className="field" value={value.visibility} onChange={event => onChange({ ...onlyMe, visibility: event.target.value as CalendarVisibility })}>
        {(Object.keys(audienceNames) as CalendarVisibility[]).map(name => <option key={name} value={name}>{audienceNames[name]}</option>)}
      </select>
    </label>
    {value.visibility === "selected_friends" && <div className="md:col-span-2">
      <PeoplePicker legend={t("Bạn bè được xem sự kiện này")} value={value.userIds} onChange={userIds => onChange({ ...value, userIds })} />
    </div>}
    {value.visibility === "group" && <label className="grid gap-1 text-sm font-semibold md:col-span-2">{t("Nhóm được xem")}
      <select className="field" value={value.groupId} onChange={event => onChange({ ...value, groupId: event.target.value })}>
        <option value="">{t("Chọn nhóm")}</option>
        {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
    </label>}
    {value.visibility === "public" && <p className="rounded-2xl bg-amber-100 p-3 text-sm leading-6 text-amber-950 md:col-span-2">{t("Ai dùng Gnouht và mở lịch của bạn cũng thấy tên và giờ của sự kiện này. Địa điểm không được gửi đi.")}</p>}
  </>;
}
