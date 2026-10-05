import { useQuery } from "@tanstack/react-query";
import { fetchCatalogItems, fetchProfiles } from "@/lib/api";
import type { RequestCategory } from "@/lib/types";

export const useCatalog = (category?: RequestCategory) =>
  useQuery({ queryKey: ["catalog", category ?? "all"], queryFn: () => fetchCatalogItems(category) });

export const useProfiles = () => useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

/** Nombres de las personas, para mostrarlos sin repetir consultas. */
export const usePeopleMaps = () => {
  const { data: profiles } = useProfiles();

  return {
    profiles: profiles ?? [],
    personName: (id?: string | null) => {
      if (!id) return null;
      const found = (profiles ?? []).find((profile) => profile.id === id);
      return found?.full_name ?? found?.email ?? null;
    },
  };
};
