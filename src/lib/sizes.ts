export interface SavedSize {
  talle: string;
  cantidad: number;
}

/**
 * Lee el desglose por talle guardado en las especificaciones de un artículo,
 * sin confiar en la forma del dato (puede venir de versiones anteriores).
 */
export const readSavedSizes = (
  specifications: Record<string, unknown> | null | undefined,
): SavedSize[] => {
  const raw = specifications?.talles;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const talle = String(record.talle ?? "").trim();
      const cantidad = Number(record.cantidad ?? 0);
      if (!talle || !(cantidad > 0)) return null;
      return { talle, cantidad };
    })
    .filter((entry): entry is SavedSize => entry !== null);
};
