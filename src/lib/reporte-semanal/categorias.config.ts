/**
 * Reglas para clasificar cada producto en una categoría del reporte semanal.
 *
 * Este archivo se puede editar sin tocar el cálculo:
 * - Las reglas se prueban en orden y gana la primera que coincide.
 * - No se distinguen mayúsculas de minúsculas.
 * - `empiezaCon`: el nombre del producto empieza con alguno de esos textos.
 * - `contiene`: el nombre del producto contiene alguno de esos textos.
 * - Lo que no coincide con ninguna regla va a `CATEGORIA_RESTO`.
 */
export interface ReglaCategoria {
  categoria: string;
  empiezaCon?: string[];
  contiene?: string[];
}

export const CATEGORIA_RESTO = "Otros";

export const REGLAS_CATEGORIA: ReglaCategoria[] = [
  { categoria: "Latas", empiezaCon: ["Lata"] },
  { categoria: "Ahumado", contiene: ["Ahumad"] },
  { categoria: "Filet Trim D", contiene: ["Trim D"], empiezaCon: ["FTD"] },
  { categoria: "Trucha Desespinada", contiene: ["Desespinada"] },
  { categoria: "BF (bife de trucha)", empiezaCon: ["BF"] },
  {
    categoria: "Trucha entera (HON)",
    contiene: ["HON", "eviscerada", "TEF", "Trucha congelada"],
  },
  { categoria: "Filet Trim C", contiene: ["FTC", "Trim C", "IWP PBO"] },
  { categoria: "Filet fresco PBI/PBO", contiene: ["PBI", "PBO"] },
];

/**
 * Productos que se venden por unidad y no por peso: su "Cantidad kg" son
 * unidades. Se cuentan aparte y no entran en los kilos ni en el precio por kilo.
 * Mismas reglas que arriba: sin distinguir mayúsculas.
 */
export const VENTA_POR_UNIDAD: Omit<ReglaCategoria, "categoria"> = {
  empiezaCon: ["Lata"],
};
