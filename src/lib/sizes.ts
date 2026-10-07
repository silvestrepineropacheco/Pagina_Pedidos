export interface SavedSize {
  talle: string;
  cantidad: number;
}

/**
 * Lee el desglose guardado en las especificaciones de un artículo.
 * Acepta tanto "talles" (indumentaria) como "variantes" (insumos) y no confía
 * en la forma del dato, porque puede venir de versiones anteriores.
 */
export const readSavedSizes = (
  specifications: Record<string, unknown> | null | undefined,
): SavedSize[] => {
  const raw = specifications?.talles ?? specifications?.variantes;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const label = String(record.talle ?? record.etiqueta ?? "").trim();
      const cantidad = Number(record.cantidad ?? 0);
      if (!label || !(cantidad > 0)) return null;
      return { talle: label, cantidad };
    })
    .filter((entry): entry is SavedSize => entry !== null);
};

/** Adjuntos guardados en las especificaciones (presupuestos, fichas técnicas). */
export const readSavedAttachments = (
  specifications: Record<string, unknown> | null | undefined,
): string[] => {
  const raw = specifications?.adjuntos;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
};
