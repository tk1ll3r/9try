import { NotebookPen } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { NoteRepository } from "./domain/Note";
import { SupabaseNoteRepository } from "./infrastructure/SupabaseNoteRepository";

export const notesModule: FeatureModule<NoteRepository> = {
  id: "notes",
  create: ({ userId }) => new SupabaseNoteRepository(requireSupabase(), userId),
  searchItems: async notes => (await notes.list()).map(note => ({ title: note.title || note.body.slice(0, 60), kind: "Ghi chú", to: "/notes", keywords: note.body })),
  navigation: [{ tab: "plan", to: "/notes", label: "Ghi chú", icon: NotebookPen, order: 24, parent: "/me/organizer" }],
  routes: [{ path: "notes", component: lazy(() => import("./presentation/NotesPage").then(m => ({ default: m.NotesPage }))) }],
};
