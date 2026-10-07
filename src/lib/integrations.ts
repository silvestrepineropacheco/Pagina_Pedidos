import { supabase } from "@/integrations/supabase/client";
import type { RequestStatus } from "./types";

export type SyncEvent = "created" | "approved" | "purchased" | "received" | "rejected";

export interface SyncChannelResult {
  status: string;
  detail?: string;
}

export interface SyncResult {
  ok?: boolean;
  folio?: string;
  event?: SyncEvent;
  state?: string;
  recipients?: string[];
  channels?: Record<string, SyncChannelResult>;
  error?: string;
}

export const FUNCTION_NAME = "manila-sync-e23b5a18faa9";

/** Traduce el estado del pedido al evento que se avisa y se registra. */
export const eventFromStatus = (status: RequestStatus): SyncEvent | null => {
  switch (status) {
    case "pending_review":
      return "created";
    case "approved_pending_purchase":
    case "purchasing":
      return "approved";
    case "purchased_pending_receipt":
    case "partially_received":
      return "purchased";
    case "completed":
      return "received";
    case "rejected":
    case "cancelled":
      return "rejected";
    default:
      return null;
  }
};

/** Sincroniza con Gmail, Drive y Sheets. Devuelve el detalle por canal. */
export const syncOrderToGoogle = async (
  requestId: string,
  event: SyncEvent,
): Promise<SyncResult> => {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: { request_id: requestId, event },
      headers: { "Content-Type": "application/json" },
    });
    const result = (data ?? {}) as SyncResult;
    if (error) {
      console.error("[integraciones] error técnico:", error.message, result);
      return { ok: false, error: result.error ?? error.message };
    }
    return result;
  } catch (error) {
    console.error("[integraciones] error técnico:", error);
    return { ok: false, error: String(error) };
  }
};

/**
 * Refleja el pedido en los conectores sin bloquear ni romper la acción principal:
 * si la sincronización falla, el pedido ya quedó guardado y se puede reintentar.
 */
export const syncInBackground = (requestId: string, status: RequestStatus) => {
  const event = eventFromStatus(status);
  if (!event) return;
  void syncOrderToGoogle(requestId, event);
};
