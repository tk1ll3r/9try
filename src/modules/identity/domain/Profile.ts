import { monthName } from "../../../kernel/dates";
import { DomainError } from "../../../kernel/errors";
import { t } from "../../../kernel/i18n";

/** Who sees a part of the profile: nobody else, or the person's friends. */
export type FieldAudience = "private" | "friends";

/** What the profile form holds. `birthday` is "YYYY-MM-DD" or "". `avatarUrl` is a small inline picture or "". */
export interface ProfileFields {
  displayName: string;
  username: string;
  bio: string;
  timezone: string;
  birthday: string;
  avatarUrl: string;
  bioAudience: FieldAudience;
  birthdayAudience: FieldAudience;
}

export const usernamePattern = /^[a-z0-9_]{3,20}$/;

/** How the signed-in user appears to others. */
export class Profile implements ProfileFields {
  constructor(
    readonly displayName: string,
    readonly username: string,
    readonly bio: string,
    readonly timezone: string,
    readonly birthday: string,
    readonly avatarUrl = "",
    /** Friends see the introduction unless it is made private. The birthday is private unless it is shown. */
    readonly bioAudience: FieldAudience = "friends",
    readonly birthdayAudience: FieldAudience = "private",
  ) {}

  /** Friends find each other by username, so both a name and a username are needed. */
  get complete(): boolean {
    return this.displayName !== "" && this.username !== "";
  }

  /** Trims the fields and checks the ones that have rules. */
  static check(input: Pick<ProfileFields, "displayName" | "username" | "bio" | "timezone" | "birthday"> & Partial<ProfileFields>): Profile {
    const displayName = input.displayName.trim();
    const username = input.username.trim().toLowerCase();
    if (!displayName) throw new DomainError("NAME_REQUIRED", t("Hãy nhập tên hiển thị."));
    if (username && !usernamePattern.test(username)) {
      throw new DomainError("USERNAME_FORMAT", t("Username gồm 3–20 ký tự: chữ thường không dấu, số hoặc dấu gạch dưới."));
    }
    return new Profile(displayName, username, input.bio.trim(), input.timezone, input.birthday, input.avatarUrl, input.bioAudience, input.birthdayAudience);
  }
}

/** What a friend may see of someone's profile. A part its owner keeps private is null. */
export interface ProfileCard {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /** Month and day, "MM-DD". The year is never sent. */
  birthday: string | null;
}

export interface ProfileRepository {
  get(): Promise<Profile>;
  save(profile: Profile): Promise<void>;
  /** Whether nobody else has this username. */
  usernameAvailable(username: string): Promise<boolean>;
  /** A friend's card, or null when this person is not a friend. */
  card(userId: string): Promise<ProfileCard | null>;
  /** Everything the app stores about the user, as JSON. */
  exportData(): Promise<unknown>;
  deleteAccount(): Promise<void>;
  signOut(): Promise<void>;
}

/** "9 tháng 3", from "YYYY-MM-DD" or "MM-DD". */
export const birthdayText = (value: string) => { const [month, day] = value.split("-").slice(-2).map(Number); return `${day} ${monthName(month)}`; };
