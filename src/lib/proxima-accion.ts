import type { RequestRow, RequestStatus } from "./types";

/** Quién tiene que hacer el próximo paso de un pedido. */
export type QuienActua = "responsable" | "solicitante" | "finanzas" | null;

export interface ProximaAccion {
  /** Lo que hay que hacer, en pocas palabras. */
  texto: string;
  quien: QuienActua;
  /** Para listas: si el pedido está esperando a alguien o ya terminó. */
  terminado: boolean;
}

const ACCIONES: Record<RequestStatus, ProximaAccion> = {
  draft: { texto: "Enviar el pedido", quien: "solicitante", terminado: false },
  pending_review: { texto: "Autorizar o rechazar", quien: "responsable", terminado: false },
  evaluating: { texto: "Autorizar o rechazar", quien: "responsable", terminado: false },
  needs_info: { texto: "Completar la información pedida", quien: "solicitante", terminado: false },
  approved_pending_purchase: { texto: "Registrar la compra", quien: "finanzas", terminado: false },
  purchasing: { texto: "Registrar la compra", quien: "finanzas", terminado: false },
  purchased_pending_receipt: { texto: "Confirmar la recepción", quien: "solicitante", terminado: false },
  partially_received: {
    texto: "Recibir lo que falta (o comprar el saldo)",
    quien: "solicitante",
    terminado: false,
  },
  completed: { texto: "Finalizado", quien: null, terminado: true },
  rejected: { texto: "Rechazado", quien: null, terminado: true },
  cancelled: { texto: "Cancelado", quien: null, terminado: true },
};

export const proximaAccion = (status: RequestStatus): ProximaAccion =>
  ACCIONES[status] ?? { texto: "—", quien: null, terminado: false };

/** Nombre de quien tiene que actuar: el responsable, el solicitante o "Finanzas". */
export const quienActua = (
  request: Pick<RequestRow, "status" | "assigned_admin_id" | "requester_id">,
  personName: (id?: string | null) => string | null,
): string | null => {
  const { quien } = proximaAccion(request.status);
  if (quien === "responsable") return personName(request.assigned_admin_id) ?? "Responsable";
  if (quien === "solicitante") return personName(request.requester_id) ?? "Solicitante";
  if (quien === "finanzas") return "Finanzas";
  return null;
};
