import type { DraftItem } from "./draft-item";
import { createEmptyItem } from "./draft-item";
import type { Priority, RequestCategory } from "@/lib/types";
import { isValidHttpUrl } from "@/lib/validation";

export type MachineryType = "nueva" | "reemplazo" | "reparacion" | "mejora";

export interface ItemPayload {
  catalog_item_id: string | null;
  name: string;
  description: string | null;
  specifications: Record<string, string>;
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
  noPurchaseConsequence: string;
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
  noPurchaseConsequence: "",
  currentEquipment: "",
  technicalSpecs: "",
  estimatedPrice: "",
  machineryQty: "1",
  machineryUnit: "unidades",
  items: [createEmptyItem()],
});

export const validateForm = (
  state: RequestFormState,
  category: RequestCategory,
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!state.neededBy) errors.neededBy = "Indicá para qué fecha necesitás el pedido.";
  if (state.priority === "urgente" && !state.urgencyReason.trim()) {
    errors.urgencyReason = "La justificación es obligatoria para prioridad urgente.";
  }

  if (category === "maquinaria") {
    if (!state.equipmentName.trim()) errors.equipmentName = "Indicá el equipo o la solución solicitada.";
    if (!state.machineryType) errors.machineryType = "Elegí el tipo de solicitud.";
    if (!state.problem.trim()) errors.problem = "Contá cuál es el problema o la necesidad actual.";
    if (!state.expectedBenefit.trim()) errors.expectedBenefit = "Indicá el beneficio esperado.";
    if (!state.noPurchaseConsequence.trim()) {
      errors.noPurchaseConsequence = "Indicá las consecuencias de no realizarlo.";
    }
    if (!(Number(state.machineryQty) > 0)) errors.machineryQty = "La cantidad debe ser mayor a cero.";
    return errors;
  }

  const validItems = state.items.filter((item) => item.name.trim().length > 0);
  if (validItems.length === 0) {
    errors.items = "Agregá al menos un artículo.";
    return errors;
  }

  state.items.forEach((item, index) => {
    if (!item.name.trim()) errors[`item-${index}-name`] = "El nombre del artículo es obligatorio.";
    if (!(Number(item.requested_qty) > 0)) {
      errors[`item-${index}-qty`] = "La cantidad debe ser mayor a cero.";
    }
    if (!isValidHttpUrl(item.suggested_url || null)) {
      errors[`item-${index}-url`] = "El enlace debe empezar con http:// o https://";
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
  no_purchase_consequence:
    category === "maquinaria" ? state.noPurchaseConsequence.trim() || null : null,
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
): ItemPayload => ({
  catalog_item_id: category === "maquinaria" ? null : item.catalog_item_id,
  name: item.name.trim(),
  description: item.description.trim() || null,
  specifications: item.specifications ?? {},
  unit: item.unit || null,
  package_content: item.package_content.trim() || null,
  reported_stock:
    item.reported_stock === "" || Number.isNaN(Number(item.reported_stock))
      ? null
      : Number(item.reported_stock),
  requested_qty: Number(item.requested_qty),
  unit_price_estimate:
    item.unit_price_estimate === "" || Number.isNaN(Number(item.unit_price_estimate))
      ? null
      : Number(item.unit_price_estimate),
  suggested_url: item.suggested_url.trim() || null,
  notes: item.notes.trim() || null,
  photo_path: item.photo_path,
  line_no: index + 1,
});
