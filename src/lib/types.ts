export type AppRole = "owner" | "admin" | "encargado" | "finanzas" | "pending";

export type RequestCategory = "insumos" | "indumentaria" | "maquinaria";

export type RequestStatus =
  | "draft"
  | "pending_review"
  | "needs_info"
  | "evaluating"
  | "approved_pending_purchase"
  | "purchasing"
  | "purchased_pending_receipt"
  | "partially_received"
  | "completed"
  | "rejected"
  | "cancelled";

export type ItemStatus =
  | "pending"
  | "needs_info"
  | "approved"
  | "rejected"
  | "purchasing"
  | "purchased"
  | "partially_received"
  | "received"
  | "cancelled";

export type Priority = "normal" | "alta" | "urgente";

export type PurchaseChannel = "proveedor" | "mercado_libre" | "otro";

export type ChangeRequestStatus = "pending" | "accepted" | "rejected";

export type EmailStatus = "pending" | "sending" | "sent" | "failed" | "pending_config";

export interface Sector {
  id: string;
  name: string;
  code: string | null;
  is_demo: boolean;
  active: boolean;
  created_at?: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  sector_id: string | null;
  active: boolean;
  email_verified: boolean;
  created_at?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: RequestCategory;
  description: string | null;
  variant: string | null;
  unit: string | null;
  presentation: string | null;
  image_url: string | null;
  usual_supplier: string | null;
  usual_url: string | null;
  is_demo: boolean;
  active: boolean;
}

export interface RequestRow {
  id: string;
  folio: string | null;
  idempotency_key: string;
  requester_id: string;
  /** Ya no se usa: la aplicación no trabaja con sectores. */
  sector_id: string | null;
  category: RequestCategory;
  needed_by: string | null;
  priority: Priority;
  urgency_reason: string | null;
  notes: string | null;
  status: RequestStatus;
  assigned_admin_id: string | null;
  submitted_at: string | null;
  closed_by: string | null;
  closed_reason: string | null;
  closed_at: string | null;
  repeated_from_id: string | null;
  machinery_type: "nueva" | "reemplazo" | "reparacion" | "mejora" | null;
  equipment_name: string | null;
  problem: string | null;
  expected_benefit: string | null;
  no_purchase_consequence: string | null;
  current_equipment: string | null;
  technical_specs: string | null;
  estimated_price: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
  sector_name?: string | null;
  requester_name?: string | null;
  assigned_name?: string | null;
}

export interface RequestItemRow {
  id: string;
  request_id: string;
  line_no: number;
  catalog_item_id: string | null;
  name: string;
  description: string | null;
  specifications: Record<string, string> | null;
  unit: string | null;
  package_content: string | null;
  reported_stock: number | null;
  requested_qty: number;
  approved_qty: number;
  approved_at: string | null;
  approved_by: string | null;
  unit_price_estimate: number | null;
  currency: string;
  suggested_url: string | null;
  purchase_url: string | null;
  notes: string | null;
  photo_path: string | null;
  item_status: ItemStatus;
  reason: string | null;
  change_pending: boolean;
  created_at: string;
}

export interface ChangeRequestRow {
  id: string;
  request_id: string;
  request_item_id: string;
  requested_by: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  status: ChangeRequestStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  item_name?: string | null;
  folio?: string | null;
  requester_name?: string | null;
}

export interface PurchaseRow {
  id: string;
  folio: string | null;
  idempotency_key: string;
  created_by: string;
  channel: PurchaseChannel;
  vendor_name: string | null;
  purchase_date: string;
  shipping_cost: number;
  currency: string;
  total: number;
  order_number: string | null;
  estimated_delivery_date: string | null;
  tracking: string | null;
  invoice_path: string | null;
  notes: string | null;
  status: "purchasing" | "purchased";
  created_at: string;
  created_by_name?: string | null;
}

export interface PurchaseItemRow {
  id: string;
  purchase_id: string;
  request_item_id: string;
  qty: number;
  unit_price: number | null;
  currency: string;
  product_url: string | null;
  notes: string | null;
  item_name?: string | null;
  request_folio?: string | null;
  sector_name?: string | null;
}

export interface ReceiptRow {
  id: string;
  folio: string | null;
  idempotency_key: string;
  request_id: string;
  purchase_id: string | null;
  received_at: string;
  received_by_name: string | null;
  created_by: string;
  notes: string | null;
  photo_path: string | null;
  created_at: string;
}

export interface ReceiptItemRow {
  id: string;
  receipt_id: string;
  request_item_id: string;
  qty_accepted: number;
  qty_wrong: number;
  qty_damaged: number;
  qty_missing: number;
  notes: string | null;
}

export interface CommentRow {
  id: string;
  request_id: string;
  author_id: string;
  body: string;
  kind: "comment" | "info_request";
  created_at: string;
  author_name?: string | null;
  author_role?: AppRole | null;
}

export interface EventRow {
  id: string;
  request_id: string;
  actor_id: string | null;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_name?: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  request_id: string | null;
  title: string;
  body: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
}

export interface EmailMessageRow {
  id: string;
  request_id: string;
  recipient_user_id: string | null;
  recipient_email: string;
  subject: string;
  status: EmailStatus;
  attempts: number;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface PendingPurchaseRow {
  request_item_id: string;
  request_id: string;
  folio: string;
  sector_id: string;
  sector_name: string;
  group_key: string;
  catalog_item_id: string | null;
  name: string;
  variant: string | null;
  unit: string | null;
  presentation: string | null;
  requested_qty: number;
  approved_qty: number;
  purchased_qty: number;
  pending_qty: number;
}
