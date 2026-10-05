import type { CatalogItem } from "@/lib/types";

export interface DraftItem {
  key: string;
  id?: string;
  catalog_item_id: string | null;
  name: string;
  description: string;
  specifications: Record<string, string>;
  unit: string;
  package_content: string;
  reported_stock: string;
  requested_qty: string;
  unit_price_estimate: string;
  suggested_url: string;
  notes: string;
  photo_path: string | null;
}

export const createEmptyItem = (): DraftItem => ({
  key:
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  catalog_item_id: null,
  name: "",
  description: "",
  specifications: {},
  unit: "unidades",
  package_content: "",
  reported_stock: "",
  requested_qty: "1",
  unit_price_estimate: "",
  suggested_url: "",
  notes: "",
  photo_path: null,
});

export const itemFromCatalog = (catalogItem: CatalogItem): DraftItem => ({
  ...createEmptyItem(),
  catalog_item_id: catalogItem.id,
  name: catalogItem.name,
  description: catalogItem.description ?? "",
  unit: catalogItem.unit ?? "unidades",
  package_content: catalogItem.presentation ?? "",
  specifications: catalogItem.variant ? { variant: catalogItem.variant } : {},
});
