import { DomainError } from "../../../shared/domain/DomainError";

/** How the signed-in user appears to others. `birthday` is "YYYY-MM-DD" or "". */
export class Profile {
  constructor(
    readonly displayName: string,
    readonly username: string,
    readonly bio: string,
    readonly timezone: string,
    readonly birthday: string,
  ) {}

  /** Friends find each other by username, so both a name and a username are needed. */
  get complete(): boolean {
    return this.displayName !== "" && this.username !== "";
  }

  /** Trims the fields and checks the ones that have rules. */
  static check(input: { displayName: string; username: string; bio: string; timezone: string; birthday: string }): Profile {
    const displayName = input.displayName.trim();
    const username = input.username.trim().toLowerCase();
    if (!displayName) throw new DomainError("NAME_REQUIRED", "Hãy nhập tên hiển thị.");
    if (username && !/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new DomainError("USERNAME_FORMAT", "Username gồm 3–20 ký tự: chữ thường không dấu, số hoặc dấu gạch dưới.");
    }
    return new Profile(displayName, username, input.bio.trim(), input.timezone, input.birthday);
  }
}

export interface ProfileRepository {
  get(): Promise<Profile>;
  save(profile: Profile): Promise<void>;
  /** Everything the app stores about the user, as JSON. */
  exportData(): Promise<unknown>;
  deleteAccount(): Promise<void>;
  signOut(): Promise<void>;
}
