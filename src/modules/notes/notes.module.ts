import { NotebookPen } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { NoteRepository } from "./domain/Note";
import { SupabaseNoteRepository } from "./infrastructure/SupabaseNoteRepository";
import { t } from "../../kernel/i18n";

export const notesModule: FeatureModule<NoteRepository> = {
  id: "notes",
  create: ({ userId }) => new SupabaseNoteRepository(requireSupabase(), userId),
  searchItems: async notes => (await notes.list()).map(note => ({ title: note.title || note.body.slice(0, 60), kind: t("Ghi chú"), to: "/notes", keywords: note.body })),
  navigation: [{ tab: "plan", to: "/notes", label: t("Ghi chú"), icon: NotebookPen, order: 30 }],
  routes: [{ path: "notes", ...lazyRoute(() => import("./presentation/NotesPage").then(m => ({ default: m.NotesPage }))) }],
};
