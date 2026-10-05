import type { CatalogItem } from "@/lib/types";
import { readSavedSizes } from "@/lib/sizes";

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

export interface SizeRow {
  key: string;
  label: string;
  qty: string;
}

export interface DraftItem {
  key: string;
  id?: string;
  catalog_item_id: string | null;
  name: string;
  /** Cantidad para insumos y maquinaria. Para indumentaria se calcula desde los talles. */
  requested_qty: string;
  unit: string;
  /** Desglose por talle o medida (solo indumentaria). */
  sizes: SizeRow[];
  /** motivo y destinatario en indumentaria. */
  motivo: string;
  destinatario: string;
  suggested_url: string;
  notes: string;
  photo_path: string | null;
}

export const createEmptyItem = (): DraftItem => ({
  key: newKey(),
  catalog_item_id: null,
  name: "",
  requested_qty: "1",
  unit: "unidades",
  sizes: [],
  motivo: "",
  destinatario: "",
  suggested_url: "",
  notes: "",
  photo_path: null,
});

export const createSizeRow = (label = "", qty = ""): SizeRow => ({
  key: newKey(),
  label,
  qty,
});

export const itemFromCatalog = (catalogItem: CatalogItem): DraftItem => ({
  ...createEmptyItem(),
  catalog_item_id: catalogItem.id,
  name: catalogItem.name,
  unit: catalogItem.unit ?? "unidades",
});

/** Suma de las cantidades cargadas por talle. */
export const sizesTotal = (rows: SizeRow[]): number =>
  rows.reduce((total, row) => total + (Number(row.qty) > 0 ? Number(row.qty) : 0), 0);

/**
 * Filas iniciales para un producto de insumos: se usa la presentación del
 * catálogo (por ejemplo "Fardo x 25 unidades") o, si no hay, la medida.
 * Nunca sugiere talles de indumentaria.
 */
export const insumoRowsFromCatalog = (catalogItem: CatalogItem): SizeRow[] => {
  const descriptor = [catalogItem.presentation, catalogItem.variant]
    .map((value) => (value ?? "").trim())
    .find((value) => value.length > 0);
  return [createSizeRow(descriptor ?? "", "")];
};

export const filledSizes = (rows: SizeRow[]) =>
  rows
    .filter((row) => row.label.trim().length > 0 && Number(row.qty) > 0)
    .map((row) => ({ talle: row.label.trim(), cantidad: Number(row.qty) }));

/** Lee el desglose guardado en la base, sin confiar en la forma del dato. */
export const sizeRowsFromSpecifications = (
  specifications: Record<string, unknown> | null | undefined,
): SizeRow[] =>
  readSavedSizes(specifications).map((entry) => createSizeRow(entry.talle, String(entry.cantidad)));

export const readSpecificationText = (
  specifications: Record<string, unknown> | null | undefined,
  key: string,
): string => {
  const value = specifications?.[key];
  return typeof value === "string" ? value : "";
};
