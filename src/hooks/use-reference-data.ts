import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCatalogItems, fetchProfiles } from "@/lib/api";
import type { RequestCategory } from "@/lib/types";

export const useCatalog = (category?: RequestCategory) =>
  useQuery({ queryKey: ["catalog", category ?? "all"], queryFn: () => fetchCatalogItems(category) });

export const useProfiles = () => useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

/**
 * Nombres de las personas.
 *
 * Importante: `personName` es estable entre renders (useCallback) y busca en un
 * mapa (O(1)). Si cambiara de identidad en cada render, cualquier useMemo que
 * dependa de ella se recalcularía siempre y la pantalla se trabaría.
 */
export const usePeopleMaps = () => {
  const { data: profiles } = useProfiles();
  // Memoizado: si esto se recreara en cada render, las identidades de abajo
  // también cambiarían y los useMemo de las pantallas se recalcularían siempre.
  const list = useMemo(() => profiles ?? [], [profiles]);

  const byId = useMemo(() => {
    const map = new Map<string, { full_name: string | null; email: string | null }>();
    for (const profile of list) {
      map.set(profile.id, { full_name: profile.full_name, email: profile.email });
    }
    return map;
  }, [list]);

  const personName = useCallback(
    (id?: string | null) => {
      if (!id) return null;
      const found = byId.get(id);
      return found?.full_name ?? found?.email ?? null;
    },
    [byId],
  );

  return useMemo(() => ({ profiles: list, byId, personName }), [list, byId, personName]);
};
