import { useQuery } from "@tanstack/react-query";
import { fetchCatalogItems, fetchProfiles, fetchSectors } from "@/lib/api";
import type { RequestCategory } from "@/lib/types";

export const useSectors = (onlyActive = false) =>
  useQuery({ queryKey: ["sectors", onlyActive], queryFn: () => fetchSectors(onlyActive) });

export const useCatalog = (category?: RequestCategory) =>
  useQuery({ queryKey: ["catalog", category ?? "all"], queryFn: () => fetchCatalogItems(category) });

export const useProfiles = () =>
  useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

/** Mapa id -> datos de perfil para mostrar nombres sin repetir consultas. */
export const usePeopleMaps = () => {
  const { data: profiles } = useProfiles();
  const { data: sectors } = useSectors();

  return {
    profiles: profiles ?? [],
    sectors: sectors ?? [],
    personName: (id?: string | null) => {
      if (!id) return null;
      const found = (profiles ?? []).find((profile) => profile.id === id);
      return found?.full_name ?? found?.email ?? null;
    },
    sectorName: (id?: string | null) => {
      if (!id) return null;
      return (sectors ?? []).find((sector) => sector.id === id)?.name ?? null;
    },
  };
};
