import { useQuery } from "@tanstack/react-query";
import {
  fetchAllPurchaseItems,
  fetchNotifications,
  fetchPurchase,
  fetchPurchaseItems,
  fetchPurchases,
} from "@/lib/api";

export const usePurchases = () =>
  useQuery({ queryKey: ["purchases"], queryFn: fetchPurchases });

export const useAllPurchaseItems = () =>
  useQuery({ queryKey: ["purchase-items"], queryFn: fetchAllPurchaseItems });

export const usePurchaseBundle = (purchaseId?: string) =>
  useQuery({
    queryKey: ["purchase", purchaseId],
    enabled: Boolean(purchaseId),
    queryFn: async () => {
      const id = purchaseId as string;
      const [purchase, items] = await Promise.all([fetchPurchase(id), fetchPurchaseItems(id)]);
      return { purchase, items };
    },
  });

export const useNotifications = () =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    refetchInterval: 60_000,
  });
