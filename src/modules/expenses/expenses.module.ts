import { BookOpen, ChartNoAxesColumn, Wallet } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { SupabaseLedgerRepository } from "./infrastructure/SupabaseLedgerRepository";
import { t } from "../../kernel/i18n";

/**
 * Expense books, for the accounts that have one to open: their own, or one they were let into. Its
 * screens are listed nowhere for anyone else, and the server gives them no row of it.
 */
export const expensesModule: FeatureModule<SupabaseLedgerRepository> = {
  id: "expenses",
  create: ({ userId }) => new SupabaseLedgerRepository(requireSupabase(), userId),
  navigation: [
    { tab: "stats", to: "/expenses", label: t("Chi tiêu"), icon: Wallet, order: 20, feature: "expenses" },
    { tab: "stats", to: "/expenses/stats", label: t("Thống kê chi tiêu"), icon: ChartNoAxesColumn, order: 30, parent: "/expenses", feature: "expenses" },
    { tab: "stats", to: "/expenses/settings", label: t("Sổ và lịch sử"), icon: BookOpen, order: 40, parent: "/expenses", feature: "expenses" },
  ],
  routes: [
    { path: "expenses", ...lazyRoute(() => import("./presentation/ExpensesPage").then(m => ({ default: m.ExpensesPage }))) },
    { path: "expenses/stats", ...lazyRoute(() => import("./presentation/ExpenseStatsPage").then(m => ({ default: m.ExpenseStatsPage }))) },
    { path: "expenses/settings", ...lazyRoute(() => import("./presentation/ExpenseSettingsPage").then(m => ({ default: m.ExpenseSettingsPage }))) },
    // Where a notification about a book leads: that book becomes the open one.
    { path: "expenses/:bookId", ...lazyRoute(() => import("./presentation/OpenBookPage").then(m => ({ default: m.OpenBookPage }))) },
  ],
};
