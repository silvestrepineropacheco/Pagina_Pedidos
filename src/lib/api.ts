import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type {
  AppRole,
  CatalogItem,
  ChangeRequestRow,
  CommentRow,
  EmailMessageRow,
  EventRow,
  ItemStatus,
  NotificationRow,
  PendingPurchaseRow,
  Profile,
  PurchaseItemRow,
  PurchaseRow,
  ReceiptItemRow,
  ReceiptRow,
  RequestCategory,
  RequestItemRow,
  RequestRow,
  RequestStatus,
} from "./types";

type Tables = Database["public"]["Tables"];
export type RequestItemInput = Tables["request_items"]["Insert"];
export type RequestUpdate = Tables["requests"]["Update"];
export type RequestItemUpdate = Tables["request_items"]["Update"];
export type PurchaseUpdate = Tables["purchases"]["Update"];

type QueryResult = { data: unknown; error: { message: string } | null };

const run = async <T>(query: PromiseLike<QueryResult>): Promise<T> => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
};

const db = () => supabase;

/* ---------------------------------- Referencias --------------------------------- */

export const fetchCatalogItems = (category?: RequestCategory) => {
  const query = db().from("catalog_items").select("*").order("name");
  return run<CatalogItem[]>(category ? query.eq("category", category) : query);
};

export const fetchProfiles = () => run<Profile[]>(db().from("profiles").select("*").order("full_name"));

export const fetchProfile = (userId: string) =>
  run<Profile | null>(db().from("profiles").select("*").eq("id", userId).maybeSingle());

export const updateOwnProfile = (userId: string, fullName: string) =>
  run<Profile>(db().from("profiles").update({ full_name: fullName }).eq("id", userId).select("*").single());

/* ----------------------------------- Pedidos ----------------------------------- */

export interface RequestFilters {
  statuses?: RequestStatus[];
  sectorId?: string;
  category?: RequestCategory;
  priority?: string;
  assignedAdminId?: string;
  requesterId?: string;
  unassigned?: boolean;
  limit?: number;
}

export const fetchRequests = (filters: RequestFilters = {}) => {
  let query = db().from("requests").select("*").order("created_at", { ascending: false });
  if (filters.statuses && filters.statuses.length > 0) query = query.in("status", filters.statuses);
  if (filters.sectorId) query = query.eq("sector_id", filters.sectorId);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.assignedAdminId) query = query.eq("assigned_admin_id", filters.assignedAdminId);
  if (filters.unassigned) query = query.is("assigned_admin_id", null);
  query = query.limit(filters.limit ?? 300);
  return run<RequestRow[]>(query);
};

export const fetchRequest = (id: string) =>
  run<RequestRow>(db().from("requests").select("*").eq("id", id).single());

export const fetchRequestItems = (requestId: string) =>
  run<RequestItemRow[]>(
    db().from("request_items").select("*").eq("request_id", requestId).order("line_no"),
  );

export const fetchItemsByIds = (ids: string[]) =>
  ids.length === 0
    ? Promise.resolve([] as RequestItemRow[])
    : run<RequestItemRow[]>(db().from("request_items").select("*").in("id", ids));

export const fetchAllRequestItems = () =>
  run<RequestItemRow[]>(db().from("request_items").select("*").limit(2000));

export interface NewRequestPayload {
  idempotency_key: string;
  requester_id: string;
  category: RequestCategory;
  needed_by: string | null;
  priority: string;
  urgency_reason: string | null;
  notes: string | null;
  machinery_type?: string | null;
  equipment_name?: string | null;
  problem?: string | null;
  expected_benefit?: string | null;
  no_purchase_consequence?: string | null;
  current_equipment?: string | null;
  technical_specs?: string | null;
  estimated_price?: number | null;
}

export const createDraftRequest = (payload: NewRequestPayload) =>
  run<RequestRow>(db().from("requests").insert({ ...payload, status: "draft" }).select("*").single());

export const updateRequest = (id: string, patch: RequestUpdate) =>
  run<RequestRow[]>(db().from("requests").update(patch).eq("id", id).select("*"));

export const insertRequestItems = (items: RequestItemInput[]) =>
  run<RequestItemRow[]>(db().from("request_items").insert(items).select("*"));

export const deleteRequestItem = (id: string) =>
  run<null>(db().from("request_items").delete().eq("id", id));

export const updateRequestItem = (id: string, patch: RequestItemUpdate) =>
  run<RequestItemRow[]>(db().from("request_items").update(patch).eq("id", id).select("*"));

export const submitRequest = (requestId: string) =>
  run<RequestRow>(db().rpc("submit_request", { p_request_id: requestId }));

export const assignRequest = (requestId: string, adminId?: string | null, reassign = false) =>
  run<RequestRow>(
    db().rpc("assign_request", {
      p_request_id: requestId,
      p_admin_id: adminId ?? null,
      p_reassign: reassign,
    }),
  );

export const closeRequestBalance = (requestId: string, reason: string) =>
  run<RequestRow>(db().rpc("close_request_balance", { p_request_id: requestId, p_reason: reason }));

export const refreshRequestAfterReview = (requestId: string) =>
  run<RequestRow>(db().rpc("refresh_request_after_review", { p_request_id: requestId }));

export const approveItem = (
  itemId: string,
  approvedQty: number,
  userId: string,
  reason?: string | null,
) =>
  updateRequestItem(itemId, {
    approved_qty: approvedQty,
    item_status: "approved" as ItemStatus,
    approved_by: userId,
    approved_at: new Date().toISOString(),
    reason: reason ?? null,
  });

export const rejectItem = (itemId: string, userId: string, reason: string) =>
  updateRequestItem(itemId, {
    approved_qty: 0,
    item_status: "rejected" as ItemStatus,
    approved_by: userId,
    approved_at: new Date().toISOString(),
    reason,
  });

export const markItemNeedsInfo = (itemId: string, userId: string, reason: string) =>
  updateRequestItem(itemId, {
    item_status: "needs_info" as ItemStatus,
    approved_by: userId,
    reason,
  });

/* ------------------------------- Comentarios y historial ------------------------------- */

export const fetchComments = (requestId: string) =>
  run<CommentRow[]>(
    db().from("request_comments").select("*").eq("request_id", requestId).order("created_at"),
  );

export const addComment = (payload: {
  request_id: string;
  author_id: string;
  body: string;
  kind?: "comment" | "info_request";
}) => run<CommentRow>(db().from("request_comments").insert(payload).select("*").single());

export const fetchEvents = (requestId: string) =>
  run<EventRow[]>(
    db().from("request_events").select("*").eq("request_id", requestId).order("created_at", { ascending: false }),
  );

/* ---------------------------- Solicitudes de cambio ---------------------------- */

export const fetchChangeRequests = (requestId?: string) => {
  const query = db().from("change_requests").select("*").order("created_at", { ascending: false });
  return run<ChangeRequestRow[]>(requestId ? query.eq("request_id", requestId) : query);
};

export const createChangeRequest = (payload: {
  request_id: string;
  request_item_id: string;
  requested_by: string;
  field: string;
  old_value: string | null;
  new_value: string;
  reason: string;
}) => run<ChangeRequestRow>(db().from("change_requests").insert(payload).select("*").single());

export const applyChangeRequest = (id: string, note?: string | null) =>
  run<ChangeRequestRow>(db().rpc("apply_change_request", { p_change_id: id, p_note: note ?? null }));

export const rejectChangeRequest = (id: string, note: string) =>
  run<ChangeRequestRow>(db().rpc("reject_change_request", { p_change_id: id, p_note: note }));

/* --------------------------------- Compras --------------------------------- */

export const fetchPurchases = () =>
  run<PurchaseRow[]>(db().from("purchases").select("*").order("created_at", { ascending: false }));

export const fetchPurchase = (id: string) =>
  run<PurchaseRow>(db().from("purchases").select("*").eq("id", id).single());

export const fetchPurchaseItems = (purchaseId: string) =>
  run<PurchaseItemRow[]>(db().from("purchase_items").select("*").eq("purchase_id", purchaseId));

export const fetchAllPurchaseItems = () =>
  run<PurchaseItemRow[]>(db().from("purchase_items").select("*").limit(2000));

export const fetchPurchaseItemsByItemIds = (itemIds: string[]) =>
  itemIds.length === 0
    ? Promise.resolve([] as PurchaseItemRow[])
    : run<PurchaseItemRow[]>(
        db().from("purchase_items").select("*").in("request_item_id", itemIds),
      );

export const fetchPurchasesByIds = (ids: string[]) =>
  ids.length === 0
    ? Promise.resolve([] as PurchaseRow[])
    : run<PurchaseRow[]>(db().from("purchases").select("*").in("id", ids));

export const registerPurchase = (payload: Json, idempotencyKey: string) =>
  run<PurchaseRow>(db().rpc("register_purchase", { p_payload: payload, p_idempotency_key: idempotencyKey }));

export const updatePurchase = (id: string, patch: PurchaseUpdate) =>
  run<PurchaseRow[]>(db().from("purchases").update(patch).eq("id", id).select("*"));

export const fetchPendingPurchaseSummary = () =>
  run<PendingPurchaseRow[]>(db().rpc("pending_purchase_summary", {}));

/* --------------------------------- Recepciones --------------------------------- */

export const fetchAllReceiptItems = () =>
  run<ReceiptItemRow[]>(db().from("receipt_items").select("*").limit(4000));

export const fetchAllReceipts = () =>
  run<ReceiptRow[]>(
    db().from("receipts").select("*").order("created_at", { ascending: false }).limit(2000),
  );

export const fetchReceipts = (requestId: string) =>
  run<ReceiptRow[]>(
    db().from("receipts").select("*").eq("request_id", requestId).order("created_at", { ascending: false }),
  );

export const fetchReceiptItemsByReceiptIds = (receiptIds: string[]) =>
  receiptIds.length === 0
    ? Promise.resolve([] as ReceiptItemRow[])
    : run<ReceiptItemRow[]>(
        db().from("receipt_items").select("*").in("receipt_id", receiptIds),
      );

export const registerReceipt = (payload: Json, idempotencyKey: string) =>
  run<ReceiptRow>(db().rpc("register_receipt", { p_payload: payload, p_idempotency_key: idempotencyKey }));

/**
 * Confirmacion simplificada de recepcion.
 * mode "complete": llego todo lo aprobado (no se cargan cantidades).
 * mode "partial": se indican los articulos y cantidades que llegaron.
 */
export const confirmReceipt = ({
  requestId,
  mode,
  receivedAt,
  notes,
  photoPath,
  items,
  idempotencyKey,
}: {
  requestId: string;
  mode: "complete" | "partial";
  receivedAt: string | null;
  notes?: string | null;
  photoPath?: string | null;
  items?: { request_item_id: string; qty_accepted: number }[] | null;
  idempotencyKey: string;
}) =>
  run<ReceiptRow>(
    db().rpc("confirm_receipt", {
      p_request_id: requestId,
      p_mode: mode,
      p_received_at: receivedAt,
      p_notes: notes ?? null,
      p_photo_path: photoPath ?? null,
      p_items: (items ?? null) as Json,
      p_idempotency_key: idempotencyKey,
    }),
  );

/* ------------------------ Notificaciones y preferencias ------------------------ */

export const fetchNotifications = (limit = 30) =>
  run<NotificationRow[]>(
    db().from("notifications").select("*").order("created_at", { ascending: false }).limit(limit),
  );

export const markNotificationRead = (id: string) =>
  run<NotificationRow[]>(
    db().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("*"),
  );

export const markAllNotificationsRead = (userId: string) =>
  run<NotificationRow[]>(
    db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null)
      .select("*"),
  );

export interface NotificationPrefs {
  user_id: string;
  notify_new_requests: boolean;
  sector_ids: string[];
  categories: string[];
}

export const fetchNotificationPrefs = (userId: string) =>
  run<NotificationPrefs | null>(
    db().from("admin_notification_prefs").select("*").eq("user_id", userId).maybeSingle(),
  );

export const saveNotificationPrefs = (
  userId: string,
  patch: Partial<Omit<NotificationPrefs, "user_id">>,
) =>
  run<NotificationPrefs>(
    db()
      .from("admin_notification_prefs")
      .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("*")
      .single(),
  );

/* --------------------------------- Correo --------------------------------- */

export interface EmailSendResult {
  status?: string;
  claimed?: number;
  sent?: number;
  failed?: number;
  detail?: string;
  error?: string;
}

export const sendRequestEmails = async (requestId: string): Promise<EmailSendResult> => {
  const { data, error } = await db().functions.invoke("send-request-emails", {
    body: { request_id: requestId },
    headers: { "Content-Type": "application/json" },
  });
  if (error) {
    const detail = (data as EmailSendResult | null)?.error;
    throw new Error(detail ?? "No se pudieron procesar los avisos por correo.");
  }
  return (data ?? {}) as EmailSendResult;
};

export interface IntegrationLogRow {
  id: string;
  request_id: string;
  event: string;
  channel: string;
  status: string;
  detail: string | null;
  external_id: string | null;
  updated_at: string;
}

export const fetchIntegrationLog = (requestId: string) =>
  run<IntegrationLogRow[]>(
    db()
      .from("integration_sync_log")
      .select("*")
      .eq("request_id", requestId)
      .order("updated_at", { ascending: false }),
  );

export const fetchEmailMessages = (requestId: string) =>
  run<EmailMessageRow[]>(
    db().from("email_messages").select("*").eq("request_id", requestId).order("created_at"),
  );

/* ------------------------------ Gestion de usuarios ------------------------------ */

/**
 * Autorizar una cuenta que ya existe (registrada) y asignarle su rol.
 * Es una actualizacion directa: la base valida en el servidor que quien la
 * ejecuta sea el Propietario. No depende de credenciales de administrador.
 */
export const authorizeProfile = (userId: string, role: AppRole) =>
  run<Profile[]>(
    db()
      .from("profiles")
      .update({ role, active: true, email_verified: true })
      .eq("id", userId)
      .select("*"),
  );

export const setProfileActive = (userId: string, active: boolean) =>
  run<Profile[]>(db().from("profiles").update({ active }).eq("id", userId).select("*"));

export interface ManageUsersResult {
  status?: string;
  user_id?: string;
  email?: string;
  temporary_password?: string;
  note?: string;
  error?: string;
  fallback?: string;
}

export const invokeManageUsers = async (payload: Record<string, unknown>): Promise<ManageUsersResult> => {
  const { data, error } = await db().functions.invoke("manage-users", {
    body: payload,
    headers: { "Content-Type": "application/json" },
  });
  const result = (data ?? {}) as ManageUsersResult;
  if (error) {
    throw new Error(result.error ?? "No se pudo completar la gestion de usuarios.");
  }
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
};

export const SERVICE_ROLE_UNAVAILABLE = "service role";

/* ------------------------- Configuracion inicial del sistema ------------------------- */

export const ownerSetupPending = () =>
  run<boolean>(db().rpc("owner_setup_pending", {})).then((value) => value === true);

export const syncOwnerProfile = () => run<number>(db().rpc("sync_owner_profile", {}));
