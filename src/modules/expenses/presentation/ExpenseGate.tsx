import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useFeatures } from "../../../kernel/features";
import { ledgerFeature } from "../domain/Ledger";
import { t } from "../../../kernel/i18n";

/**
 * Shows a screen of the ledger to an account that has the capability and sends every other account
 * to the home screen, as an address that does not exist would. Nothing of the ledger is asked from
 * the server for them.
 */
export function ExpenseGate({ children }: { children: ReactNode }) {
  const features = useFeatures();
  if (!features.ready) return <div role="status" aria-label={t("Đang tải trang")} className="space-y-5"><div className="skeleton h-12 w-3/4" /><div className="skeleton h-44" /></div>;
  return features.has(ledgerFeature) ? <>{children}</> : <Navigate to="/" replace />;
}
