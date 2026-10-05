import type { DraftItem } from "./draft-item";
import { createEmptyItem, filledSizes, sizesTotal } from "./draft-item";
import type { Json } from "@/integrations/supabase/types";
import type { Priority, RequestCategory } from "@/lib/types";
import { URL_ERROR, isValidHttpUrl } from "@/lib/validation";

export type MachineryType = "nueva" | "reemplazo" | "reparacion" | "mejora";

export interface ItemPayload {
  catalog_item_id: string | null;
  name: string;
  description: string | null;
  specifications: Json;
  unit: string | null;
  package_content: string | null;
  reported_stock: number | null;
  requested_qty: number;
  unit_price_estimate: number | null;
  suggested_url: string | null;
  notes: string | null;
  photo_path: string | null;
  line_no: number;
}

export interface RequestFormState {
  neededBy: string;
  priority: Priority;
  urgencyReason: string;
  notes: string;
  machineryType: MachineryType;
  equipmentName: string;
  problem: string;
  expectedBenefit: string;
  currentEquipment: string;
  technicalSpecs: string;
  estimatedPrice: string;
  machineryQty: string;
  machineryUnit: string;
  items: DraftItem[];
}

export const emptyFormState = (): RequestFormState => ({
  neededBy: "",
  priority: "normal",
  urgencyReason: "",
  notes: "",
  machineryType: "nueva",
  equipmentName: "",
  problem: "",
  expectedBenefit: "",
  currentEquipment: "",
  technicalSpecs: "",
  estimatedPrice: "",
  machineryQty: "1",
  machineryUnit: "unidades",
  items: [createEmptyItem()],
});

const hasSomething = (item: DraftItem) =>
  item.name.trim().length > 0 ||
  Number(item.requested_qty) > 0 ||
  sizesTotal(item.sizes) > 0;

export const validateForm = (
  state: RequestFormState,
  category: RequestCategory,
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!state.neededBy) errors.neededBy = "La fecha para la que se necesita es obligatoria.";
  if (state.priority === "urgente" && !state.urgencyReason.trim()) {
    errors.urgencyReason = "La justificación es obligatoria para prioridad urgente.";
  }

  if (category === "maquinaria") {
    if (!state.equipmentName.trim()) errors.equipmentName = "Indicá el equipo o la solución solicitada.";
    if (!state.machineryType) errors.machineryType = "Elegí el tipo de solicitud.";
    if (!state.problem.trim()) errors.problem = "Contá cuál es el problema o la necesidad actual.";
    if (!state.expectedBenefit.trim()) errors.expectedBenefit = "Indicá el beneficio esperado.";
    if (!(Number(state.machineryQty) > 0)) errors.machineryQty = "La cantidad debe ser mayor a cero.";
    return errors;
  }

  const withContent = state.items.filter(hasSomething);
  if (withContent.length === 0) {
    errors.items = "Agregá al menos un artículo.";
    return errors;
  }

  state.items.forEach((item, index) => {
    if (!hasSomething(item)) return;
    if (!item.name.trim()) {
      errors[`item-${index}-name`] = "Indicá qué producto necesitás.";
    }
    if (sizesTotal(item.sizes) <= 0) {
      errors[`item-${index}-sizes`] =
        category === "indumentaria"
          ? "Cargá la cantidad de al menos un talle o medida."
          : "Cargá la cantidad de al menos una medida o presentación.";
    }
    if (!isValidHttpUrl(item.suggested_url || null)) {
      errors[`item-${index}-url`] = URL_ERROR;
    }
  });

  return errors;
};

export const requestPatchFromState = (state: RequestFormState, category: RequestCategory) => ({
  needed_by: state.neededBy || null,
  priority: state.priority,
  urgency_reason: state.urgencyReason.trim() || null,
  notes: state.notes.trim() || null,
  machinery_type: category === "maquinaria" ? state.machineryType || null : null,
  equipment_name: category === "maquinaria" ? state.equipmentName.trim() || null : null,
  problem: category === "maquinaria" ? state.problem.trim() || null : null,
  expected_benefit: category === "maquinaria" ? state.expectedBenefit.trim() || null : null,
  current_equipment: category === "maquinaria" ? state.currentEquipment.trim() || null : null,
  technical_specs: category === "maquinaria" ? state.technicalSpecs.trim() || null : null,
  estimated_price:
    state.estimatedPrice === "" || Number.isNaN(Number(state.estimatedPrice))
      ? null
      : Number(state.estimatedPrice),
});

export const itemPayload = (
  item: DraftItem,
  index: number,
  category: RequestCategory,
): ItemPayload => {
  const isClothing = category === "indumentaria";
  const rows = filledSizes(item.sizes);
  const total = rows.length > 0 ? sizesTotal(item.sizes) : Number(item.requested_qty) || 0;

  const specifications: { [key: string]: Json | undefined } = {};
  if (rows.length > 0) {
    // Insumos: medida o presentación. Indumentaria: talle o medida.
    specifications[isClothing ? "talles" : "variantes"] = rows;
  }
  if (isClothing) {
    if (item.motivo.trim()) specifications.motivo = item.motivo.trim();
    if (item.destinatario.trim()) specifications.destinatario = item.destinatario.trim();
  }

  return {
    catalog_item_id: item.catalog_item_id,
    name: item.name.trim(),
    description: null,
    specifications,
    unit: item.unit || null,
    package_content: null,
    reported_stock: null,
    requested_qty: total,
    unit_price_estimate: null,
    suggested_url: item.suggested_url.trim() || null,
    notes: item.notes.trim() || null,
    photo_path: item.photo_path,
    line_no: index + 1,
  };
};
