export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

/** The signed-in user's private notes, most recently changed first. */
export interface NoteRepository {
  list(): Promise<Note[]>;
  create(title: string, body: string): Promise<void>;
  update(id: string, title: string, body: string): Promise<void>;
  remove(id: string): Promise<void>;
}
