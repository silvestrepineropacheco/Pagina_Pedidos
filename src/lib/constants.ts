import type {
  CatalogItem,
  EmailStatus,
  ItemStatus,
  Priority,
  RequestCategory,
  RequestStatus,
} from "./types";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger";

export interface Option<T extends string = string> {
  value: T;
  label: string;
  tone?: Tone;
  hint?: string;
}

export const APP_NAME = "Manila | Pedidos y Compras";
export const APP_SHORT_NAME = "Manila";
export const DEFAULT_CURRENCY = "ARS";
export const TIMEZONE = "America/Argentina/Buenos_Aires";

export const CATEGORIES: Option<RequestCategory>[] = [
  {
    value: "insumos",
    label: "Insumos de producción",
    hint: "Cajas, bolsas, stickers, guantes descartables, film, cintas.",
  },
  {
    value: "indumentaria",
    label: "Indumentaria y equipamiento de trabajo",
    hint: "Uniformes, botas, delantales, ropa térmica, elementos para vestuarios.",
  },
  {
    value: "maquinaria",
    label: "Maquinaria y mejoras",
    hint: "Máquina nueva, reemplazo o reparación de un equipo, o mejora de productividad.",
  },
];

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  draft: { label: "Borrador", tone: "neutral" },
  pending_review: { label: "Pendiente de revisión", tone: "info" },
  needs_info: { label: "Falta información", tone: "warning" },
  evaluating: { label: "En evaluación", tone: "info" },
  approved_pending_purchase: { label: "Aprobado / pendiente de compra", tone: "info" },
  purchasing: { label: "En compra", tone: "info" },
  purchased_pending_receipt: { label: "Comprado / pendiente de recepción", tone: "warning" },
  partially_received: { label: "Recibido parcialmente", tone: "warning" },
  completed: { label: "Completado", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const ITEM_STATUS: Record<ItemStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendiente", tone: "neutral" },
  needs_info: { label: "Falta información", tone: "warning" },
  approved: { label: "Aprobado", tone: "info" },
  rejected: { label: "Rechazado", tone: "danger" },
  purchasing: { label: "En compra", tone: "info" },
  purchased: { label: "Comprado", tone: "info" },
  partially_received: { label: "Recibido parcialmente", tone: "warning" },
  received: { label: "Recibido", tone: "success" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const PRIORITIES: Option<Priority>[] = [
  { value: "normal", label: "Normal", tone: "neutral" },
  { value: "alta", label: "Alta", tone: "warning" },
  { value: "urgente", label: "Urgente", tone: "danger" },
];

export const PRIORITY_MAP: Record<Priority, { label: string; tone: Tone }> = {
  normal: { label: "Normal", tone: "neutral" },
  alta: { label: "Alta", tone: "warning" },
  urgente: { label: "Urgente", tone: "danger" },
};

export const UNITS = [
  "unidades",
  "cajas",
  "paquetes",
  "rollos",
  "pares",
  "juegos",
  "kg",
  "litros",
  "metros",
  "fardos",
];

export const CHANNELS: Option[] = [
  { value: "proveedor", label: "Proveedor" },
  { value: "mercado_libre", label: "Mercado Libre" },
  { value: "otro", label: "Otro" },
];

export const MACHINERY_TYPES: Option[] = [
  { value: "nueva", label: "Compra nueva" },
  { value: "reemplazo", label: "Reemplazo" },
  { value: "reparacion", label: "Reparación" },
  { value: "mejora", label: "Mejora" },
];

export const EQUIPMENT_REASONS = [
  "Reposición por desgaste",
  "Rotura",
  "Incorporación de personal",
  "Otra necesidad",
];

export const EXPECTED_BENEFITS = [
  "Ahorro de tiempo",
  "Mayor capacidad",
  "Menos desperdicio",
  "Seguridad",
  "Otro",
];

export const EMAIL_STATUS: Record<EmailStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pendiente de envío", tone: "neutral" },
  sending: { label: "Enviando", tone: "info" },
  sent: { label: "Enviado", tone: "success" },
  failed: { label: "Falló el envío", tone: "danger" },
  pending_config: { label: "Pendiente de configuración", tone: "warning" },
};

export const ROLES: Option[] = [
  { value: "owner", label: "Propietario" },
  { value: "admin", label: "Administrador" },
  { value: "encargado", label: "Encargado de sector" },
  { value: "pending", label: "Pendiente de autorización" },
];

export const SPEC_FIELDS: Record<RequestCategory, { key: string; label: string }[]> = {
  insumos: [
    { key: "medida", label: "Medida" },
    { key: "material", label: "Material" },
    { key: "modelo", label: "Modelo" },
    { key: "presentacion", label: "Presentación" },
  ],
  indumentaria: [
    { key: "talle", label: "Talle" },
    { key: "medida", label: "Medida" },
    { key: "modelo", label: "Modelo" },
  ],
  maquinaria: [],
};

export const labelOf = (options: Option[], value?: string | null) =>
  options.find((option) => option.value === value)?.label ?? "—";

export const categoryLabel = (value?: string | null) =>
  CATEGORIES.find((option) => option.value === value)?.label ?? "—";

export const catalogItemLabel = (item: CatalogItem) =>
  [item.name, item.variant, item.presentation].filter(Boolean).join(" · ");
