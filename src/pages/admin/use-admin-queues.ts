import { useMemo } from "react";
import { useAuth } from "@/hooks/auth-context";
import { usePendingChangeRequests, usePendingPurchaseSummary, useRequests } from "@/hooks/use-requests";
import { usePurchases } from "@/hooks/use-purchases";
import { todayInTimeZone } from "@/lib/format";
import type { ChangeRequestRow, PendingPurchaseRow, PurchaseRow, RequestRow } from "@/lib/types";

const OPEN_STATUSES = [
  "pending_review",
  "needs_info",
  "evaluating",
  "approved_pending_purchase",
  "purchasing",
  "purchased_pending_receipt",
  "partially_received",
];

export interface AdminQueues {
  requests: RequestRow[];
  newRequests: RequestRow[];
  urgent: RequestRow[];
  mine: RequestRow[];
  approvedPendingPurchase: RequestRow[];
  pendingReceipt: RequestRow[];
  overdueDeliveries: PurchaseRow[];
  pendingChanges: ChangeRequestRow[];
  pendingSummary: PendingPurchaseRow[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useAdminQueues = (): AdminQueues => {
  const { user } = useAuth();
  const { data: requests, isLoading, error, refetch } = useRequests({});
  const { data: changes } = usePendingChangeRequests();
  const { data: summary } = usePendingPurchaseSummary();
  const { data: purchases } = usePurchases();

  return useMemo(() => {
    const list = requests ?? [];
    const isOpen = (request: RequestRow) => OPEN_STATUSES.includes(request.status);
    const today = todayInTimeZone();

    return {
      requests: list,
      newRequests: list.filter((request) => request.status === "pending_review"),
      urgent: list.filter((request) => request.priority === "urgente" && isOpen(request)),
      mine: list.filter((request) => request.assigned_admin_id === user?.id && isOpen(request)),
      approvedPendingPurchase: list.filter(
        (request) => request.status === "approved_pending_purchase",
      ),
      pendingReceipt: list.filter((request) =>
        ["purchased_pending_receipt", "partially_received"].includes(request.status),
      ),
      overdueDeliveries: (purchases ?? []).filter(
        (purchase) =>
          purchase.estimated_delivery_date != null &&
          purchase.estimated_delivery_date < today &&
          purchase.status !== "purchased",
      ),
      pendingChanges: (changes ?? []).filter((change) => change.status === "pending"),
      pendingSummary: summary ?? [],
      isLoading,
      error: (error as Error | null) ?? null,
      refetch: () => void refetch(),
    };
  }, [requests, changes, summary, purchases, user?.id, isLoading, error, refetch]);
};
