import { MessageSquareText } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { t } from "../../kernel/i18n";
import type { FeedbackRepository } from "./domain/Feedback";
import { SupabaseFeedbackRepository } from "./infrastructure/SupabaseFeedbackRepository";

export const feedbackModule: FeatureModule<FeedbackRepository> = {
  id: "feedback",
  create: () => new SupabaseFeedbackRepository(requireSupabase()),
  navigation: [{ tab: "together", to: "/feedback", label: t("Góp ý admin"), icon: MessageSquareText, order: 60 }],
  routes: [{ path: "feedback", ...lazyRoute(() => import("./presentation/FeedbackPage").then(module => ({ default: module.FeedbackPage }))) }],
};
