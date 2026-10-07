import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllPurchaseItems,
  fetchAllReceiptItems,
  fetchAllReceipts,
  fetchAllRequestItems,
} from "@/lib/api";
import { usePurchases } from "@/hooks/use-purchases";
import { useRequests } from "@/hooks/use-requests";
import type {
  PurchaseItemRow,
  PurchaseRow,
  ReceiptItemRow,
  ReceiptRow,
  RequestItemRow,
  RequestRow,
} from "@/lib/types";

export interface EnrichedOrder {
  request: RequestRow;
  items: RequestItemRow[];
  purchases: PurchaseRow[];
  receipts: ReceiptRow[];
  requestedQty: number;
  purchasedQty: number;
  receivedQty: number;
  vendors: string;
  total: number;
  purchaseDate: string | null;
  receiptDate: string | null;
}

/**
 * Pedidos con toda su informacion relacionada (articulos, compras y recepciones).
 * Los cruces se resuelven con mapas (acceso directo) para que la pantalla no se trabe.
 */
export const useOrdersEnriched = () => {
  const requestsQuery = useRequests({ limit: 1000 });
  const itemsQuery = useQuery({ queryKey: ["all-items"], queryFn: fetchAllRequestItems });
  const purchasesQuery = usePurchases();
  const purchaseItemsQuery = useQuery({
    queryKey: ["all-purchase-items"],
    queryFn: fetchAllPurchaseItems,
  });
  const receiptsQuery = useQuery({ queryKey: ["all-receipts"], queryFn: fetchAllReceipts });
  const receiptItemsQuery = useQuery({
    queryKey: ["all-receipt-items"],
    queryFn: fetchAllReceiptItems,
  });

  const orders = useMemo<EnrichedOrder[]>(() => {
    const itemsByRequest = new Map<string, RequestItemRow[]>();
    for (const item of itemsQuery.data ?? []) {
      const list = itemsByRequest.get(item.request_id) ?? [];
      list.push(item);
      itemsByRequest.set(item.request_id, list);
    }

    const purchaseItemsByPurchase = new Map<string, PurchaseItemRow[]>();
    for (const line of purchaseItemsQuery.data ?? []) {
      const list = purchaseItemsByPurchase.get(line.purchase_id) ?? [];
      list.push(line);
      purchaseItemsByPurchase.set(line.purchase_id, list);
    }

    const acceptedByItem = new Map<string, number>();
    for (const line of receiptItemsQuery.data ?? []) {
      acceptedByItem.set(
        line.request_item_id,
        (acceptedByItem.get(line.request_item_id) ?? 0) + Number(line.qty_accepted),
      );
    }

    const receiptsByRequest = new Map<string, ReceiptRow[]>();
    for (const receipt of receiptsQuery.data ?? []) {
      const list = receiptsByRequest.get(receipt.request_id) ?? [];
      list.push(receipt);
      receiptsByRequest.set(receipt.request_id, list);
    }

    return (requestsQuery.data ?? []).map((request) => {
      const items = itemsByRequest.get(request.id) ?? [];
      const itemIds = new Set(items.map((item) => item.id));

      const purchases: PurchaseRow[] = [];
      let purchasedQty = 0;
      for (const purchase of purchasesQuery.data ?? []) {
        const mine = (purchaseItemsByPurchase.get(purchase.id) ?? []).filter((line) =>
          itemIds.has(line.request_item_id),
        );
        if (mine.length === 0) continue;
        purchases.push(purchase);
        purchasedQty += mine.reduce((total, line) => total + Number(line.qty), 0);
      }

      const receipts = receiptsByRequest.get(request.id) ?? [];
      const requestedQty = items.reduce((total, item) => total + Number(item.requested_qty), 0);
      const receivedQty = items.reduce(
        (total, item) => total + (acceptedByItem.get(item.id) ?? 0),
        0,
      );

      return {
        request,
        items,
        purchases,
        receipts,
        requestedQty,
        purchasedQty,
        receivedQty,
        vendors: [
          ...new Set(purchases.map((purchase) => purchase.vendor_name).filter(Boolean) as string[]),
        ].join(", "),
        total: purchases.reduce((total, purchase) => total + Number(purchase.total ?? 0), 0),
        purchaseDate: purchases.length > 0 ? purchases[0].purchase_date : null,
        receiptDate: receipts.length > 0 ? receipts[0].received_at : null,
      };
    });
  }, [
    requestsQuery.data,
    itemsQuery.data,
    purchasesQuery.data,
    purchaseItemsQuery.data,
    receiptsQuery.data,
    receiptItemsQuery.data,
  ]);

  return {
    orders,
    isLoading:
      requestsQuery.isLoading ||
      itemsQuery.isLoading ||
      purchasesQuery.isLoading ||
      purchaseItemsQuery.isLoading ||
      receiptsQuery.isLoading ||
      receiptItemsQuery.isLoading,
    error: (requestsQuery.error as Error | null) ?? null,
    refetch: () => {
      void requestsQuery.refetch();
      void itemsQuery.refetch();
      void purchasesQuery.refetch();
      void purchaseItemsQuery.refetch();
      void receiptsQuery.refetch();
      void receiptItemsQuery.refetch();
    },
  };
};
