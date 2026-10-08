import { localDateKey } from "../../../kernel/dates";
import { DomainError } from "../../../kernel/errors";
import { locale, t } from "../../../kernel/i18n";

export type TaskPriority = "low" | "medium" | "high";

/** What a person types when adding or editing. `dueDate` is "YYYY-MM-DD" on their device, or "". */
export interface TaskDraft {
  /** May carry labels as hashtags: "Nộp bài tập #giảitích". */
  title: string;
  dueDate: string;
  /** "HH:mm" on their device. Empty or missing means any time that day. */
  dueTime?: string;
  priority: TaskPriority;
}

/** A checked draft, ready to store. */
export interface TaskDetails {
  title: string;
  priority: TaskPriority;
  dueAt: string | null;
  tags: string[];
}

/** Where an open task sits in the list. */
export type TaskSection = "overdue" | "today" | "upcoming" | "undated";

// A label is a "#" at the start of a word, followed by letters, digits, "_" or "-".
const hashtag = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
const maxTags = 5;

/** A one-off personal task. Routines share the database table but are a separate concept. */
export class Task {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly priority: TaskPriority,
    readonly dueAt: string | null,
    readonly completedAt: string | null,
    /** Labels such as a course name, lower-case and without the "#". */
    readonly tags: readonly string[] = [],
  ) {}

  get done(): boolean {
    return this.completedAt !== null;
  }

  /** The due day on this device as "YYYY-MM-DD", or "" when the task has no due date. */
  get dueDate(): string {
    return this.dueAt ? localDateKey(new Date(this.dueAt)) : "";
  }

  /** The due time on this device as "HH:mm", or "" when the task is due any time that day (stored as 23:59). */
  get dueTime(): string {
    if (!this.dueAt) return "";
    const at = new Date(this.dueAt);
    const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    return time === "23:59" ? "" : time;
  }

  /** The due day and time as shown in a list: "7/10/2026" or "7/10/2026 14:00". */
  get dueLabel(): string {
    return this.dueAt ? [new Date(this.dueAt).toLocaleDateString(locale), this.dueTime].filter(Boolean).join(" ") : t("Không hạn");
  }

  isOverdue(now = new Date()): boolean {
    return !this.done && this.dueAt !== null && Date.parse(this.dueAt) < now.getTime();
  }

  section(now = new Date()): TaskSection {
    return this.dueDate === "" ? "undated" : this.isOverdue(now) ? "overdue" : this.dueDate === localDateKey(now) ? "today" : "upcoming";
  }

  /** The title as it is typed in a form, with the labels back in as hashtags. */
  get draftTitle(): string {
    return [this.title, ...this.tags.map(tag => `#${tag}`)].join(" ");
  }

  /**
   * Checks a draft, moves its hashtags into labels and turns its date and time into a timestamp;
   * without a time that is the end of the day. When editing `current`, an unchanged date and time
   * keep the task's original timestamp.
   */
  static details(draft: TaskDraft, current?: Task): TaskDetails {
    const tags = [...new Set([...draft.title.matchAll(hashtag)].map(match => match[2].toLocaleLowerCase("vi-VN")))].slice(0, maxTags);
    const title = draft.title.replace(hashtag, "$1").replace(/\s+/g, " ").trim();
    if (!title) throw new DomainError("TITLE_REQUIRED", t("Hãy nhập tên công việc."));
    const dueAt = !draft.dueDate ? null
      : current?.dueDate === draft.dueDate && current.dueTime === (draft.dueTime ?? "") ? current.dueAt
      : new Date(`${draft.dueDate}T${draft.dueTime || "23:59"}:00`).toISOString();
    return { title, priority: draft.priority, dueAt, tags };
  }
}
