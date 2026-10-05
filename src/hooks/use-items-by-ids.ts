import { useQuery } from "@tanstack/react-query";
import { fetchItemsByIds } from "@/lib/api";

/** Artículos solicitados a partir de una lista de identificadores. */
export const useItemsByIds = (ids: string[]) =>
  useQuery({
    queryKey: ["items", [...ids].sort()],
    enabled: ids.length > 0,
    queryFn: () => fetchItemsByIds(ids),
  });
