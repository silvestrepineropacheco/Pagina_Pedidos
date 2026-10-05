import { useQuery } from "@tanstack/react-query";
import {
  fetchChangeRequests,
  fetchComments,
  fetchEmailMessages,
  fetchEvents,
  fetchPendingPurchaseSummary,
  fetchPurchaseItemsByItemIds,
  fetchPurchasesByIds,
  fetchReceiptItemsByReceiptIds,
  fetchReceipts,
  fetchRequest,
  fetchRequestItems,
  fetchRequests,
  type RequestFilters,
} from "@/lib/api";
import type {
  ChangeRequestRow,
  CommentRow,
  EmailMessageRow,
  EventRow,
  PurchaseItemRow,
  PurchaseRow,
  ReceiptItemRow,
  ReceiptRow,
  RequestItemRow,
  RequestRow,
} from "@/lib/types";

export const useRequests = (filters: RequestFilters = {}) =>
  useQuery({
    queryKey: ["requests", filters],
    queryFn: () => fetchRequests(filters),
  });

export interface RequestBundle {
  request: RequestRow;
  items: RequestItemRow[];
  comments: CommentRow[];
  events: EventRow[];
  changes: ChangeRequestRow[];
  receipts: ReceiptRow[];
  receiptItems: ReceiptItemRow[];
  purchases: PurchaseRow[];
  purchaseItems: PurchaseItemRow[];
  emails: EmailMessageRow[];
}

export const useRequestBundle = (requestId?: string, options?: { emails?: boolean }) => {
  const withEmails = options?.emails ?? false;
  return useQuery<RequestBundle>({
    queryKey: ["request-bundle", requestId, withEmails],
    enabled: Boolean(requestId),
    queryFn: async () => {
      const id = requestId as string;
      const [request, items, comments, events, changes, receipts] = await Promise.all([
        fetchRequest(id),
        fetchRequestItems(id),
        fetchComments(id),
        fetchEvents(id),
        fetchChangeRequests(id),
        fetchReceipts(id),
      ]);

      const receiptItems = await fetchReceiptItemsByReceiptIds(receipts.map((receipt) => receipt.id));

      const itemIds = items.map((item) => item.id);
      const purchaseItems = await fetchPurchaseItemsByItemIds(itemIds);
      const purchases = await fetchPurchasesByIds([
        ...new Set(purchaseItems.map((line) => line.purchase_id)),
      ]);

      const emails = withEmails ? await fetchEmailMessages(id) : [];

      return {
        request,
        items,
        comments,
        events,
        changes,
        receipts,
        receiptItems,
        purchases,
        purchaseItems,
        emails,
      };
    },
  });
};

export const usePendingChangeRequests = () =>
  useQuery({
    queryKey: ["change-requests", "all"],
    queryFn: () => fetchChangeRequests(),
  });

export const usePendingPurchaseSummary = () =>
  useQuery({
    queryKey: ["pending-purchase-summary"],
    queryFn: fetchPendingPurchaseSummary,
  });
