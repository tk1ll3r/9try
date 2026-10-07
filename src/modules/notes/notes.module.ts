import { NotebookPen } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../shared/infrastructure/supabase";
import type { NoteRepository } from "./domain/Note";
import { SupabaseNoteRepository } from "./infrastructure/SupabaseNoteRepository";

export const notesModule: FeatureModule<NoteRepository> = {
  id: "notes",
  create: ({ userId }) => new SupabaseNoteRepository(requireSupabase(), userId),
  navigation: [{ tab: "plan", to: "/notes", label: "Ghi chú", icon: NotebookPen, order: 24 }],
  routes: [{ path: "notes", component: lazy(() => import("./presentation/NotesPage").then(m => ({ default: m.NotesPage }))) }],
};
