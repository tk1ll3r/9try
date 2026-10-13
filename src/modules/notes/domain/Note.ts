export interface Note {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  permission: "owner" | "view" | "edit";
  updatedAt: string;
}

export interface NoteShare {
  id: string;
  targetKind: "person" | "group";
  targetId: string;
  targetName: string;
  avatarUrl: string | null;
  permission: "view" | "edit";
}

export const notesKey = ["notes"] as const;

/** Notes owned by the signed-in user and notes explicitly shared with them. */
export interface NoteRepository {
  list(): Promise<Note[]>;
  create(title: string, body: string): Promise<void>;
  update(id: string, title: string, body: string): Promise<void>;
  remove(id: string): Promise<void>;
  shares(noteId: string): Promise<NoteShare[]>;
  share(noteId: string, userIds: string[], groupIds: string[], permission: "view" | "edit"): Promise<void>;
  revokeShare(shareId: string): Promise<void>;
}
