import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, ShieldAlert, PackageCheck, FileWarning } from "lucide-react";
import { AttachmentUpload } from "@/components/attachments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { friendlyError } from "@/lib/errors";
import { syncInBackground } from "@/lib/integrations";
import {
  addComment,
  applyChangeRequest,
  approveItem,
  closeRequestBalance,
  confirmReceipt,
  createChangeRequest,
  markItemNeedsInfo,
  refreshRequestAfterReview,
  registerReceipt,
  rejectChangeRequest,
  rejectItem,
} from "@/lib/api";
import { formatQty } from "@/lib/format";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { RequestItemRow } from "@/lib/types";
import { todayInTimeZone } from "@/lib/format";

const invalidate = async (queryClient: ReturnType<typeof useQueryClient>, requestId: string) => {
  await queryClient.invalidateQueries({ queryKey: ["request-bundle", requestId] });
  await queryClient.invalidateQueries({ queryKey: ["requests"] });
  await queryClient.invalidateQueries({ queryKey: ["pending-purchase-summary"] });
  await queryClient.invalidateQueries({ queryKey: ["change-requests", "all"] });
};

const showError = (error: unknown) =>
  toast({
    title: "No se pudo completar la acción",
    description: friendlyError(
      error,
      "No pudimos completar la acción. Intentá nuevamente o contactá a un administrador.",
    ),
    variant: "destructive",
  });

/* ------------------------------ Solicitar cambio ------------------------------ */

const CHANGE_FIELDS = [
  { value: "requested_qty", label: "Cantidad solicitada" },
  { value: "specifications", label: "Especificación adicional" },
  { value: "description", label: "Descripción" },
  { value: "notes", label: "Observaciones" },
  { value: "unit", label: "Unidad de pedido" },
];

export const ChangeRequestDialog = ({
  open,
  onOpenChange,
  requestId,
  item,
  userId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  requestId: string;
  item: RequestItemRow | null;
  userId: string;
}) => {
  const queryClient = useQueryClient();
  const [field, setField] = useState("requested_qty");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setField("requested_qty");
      setNewValue("");
      setReason("");
    }
  }, [open]);

  if (!item) return null;

  const oldValue = (() => {
    switch (field) {
      case "requested_qty":
        return String(item.requested_qty);
      case "unit":
        return item.unit ?? "";
      case "notes":
        return item.notes ?? "";
      case "description":
        return item.description ?? "";
      default:
        return Object.entries(item.specifications ?? {})
          .map(([key, value]) => `${key}: ${value}`)
          .join(" · ");
    }
  })();

  const handleSubmit = async () => {
    if (saving) return;
    if (!newValue.trim() || !reason.trim()) {
      toast({
        title: "Faltan datos",
        description: "Indicá el valor propuesto y el motivo del cambio.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      // La propuesta se guarda en su propia operación: queda registrada aunque
      // después falle cualquier otro paso.
      await createChangeRequest({
        request_id: requestId,
        request_item_id: item.id,
        requested_by: userId,
        field,
        old_value: oldValue || null,
        new_value: newValue.trim(),
        reason: reason.trim(),
      });
      await invalidate(queryClient, requestId);
      toast({
        title: "Cambio registrado para revisión",
        description: "El artículo original y las compras existentes no se modificaron.",
      });
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar cambio</DialogTitle>
          <DialogDescription>
            {item.name} ya fue aprobado o comprado. La propuesta queda registrada para que un
            administrador la revise; no se modifica el artículo ni las compras existentes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Qué querés cambiar</Label>
            <Select value={field} onValueChange={setField}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_FIELDS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">Valor actual</p>
            <p className="font-medium text-foreground">{oldValue || "—"}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new_value">Valor propuesto</Label>
            <Input
              id="new_value"
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              placeholder={field === "requested_qty" ? "Ej.: 12" : "Escribí el nuevo valor"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change_reason">Motivo</Label>
            <Textarea
              id="change_reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explicá por qué necesitás el cambio"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Registrar propuesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* --------------------------- Confirmar recepción (simple) --------------------------- */

/**
 * Flujo simple despues de registrar la compra:
 *   "¿Este pedido ya llegó?"  ->  completo / parcialmente
 * No vuelve a pedir proveedor, precios, enlaces ni articulos: todo eso ya quedo
 * guardado en el registro de compra.
 */
export const ConfirmReceiptDialog = ({
  open,
  onOpenChange,
  requestId,
  items,
  pendingById,
  onDetailed,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  requestId: string;
  items: RequestItemRow[];
  pendingById: Record<string, number>;
  onDetailed: () => void;
}) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"ask" | "complete" | "partial">("ask");
  const [receivedAt, setReceivedAt] = useState(todayInTimeZone());
  const [notes, setNotes] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const initialized = useRef(false);

  const pendientes = items.filter(
    (item) => item.approved_qty > 0 && (pendingById[item.id] ?? item.approved_qty) > 0,
  );

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      setMode("ask");
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    setReceivedAt(todayInTimeZone());
    setNotes("");
    setPhotoPath(null);
    setIdempotencyKey(createIdempotencyKey());
    setPartial(
      Object.fromEntries(
        items
          .filter((item) => item.approved_qty > 0 && (pendingById[item.id] ?? item.approved_qty) > 0)
          .map((item) => [item.id, String(pendingById[item.id] ?? item.approved_qty)]),
      ),
    );
  }, [open, items, pendingById]);

  const handleConfirm = async () => {
    if (saving || mode === "ask") return;

    const lines =
      mode === "complete"
        ? null
        : pendientes
            .map((item) => ({
              request_item_id: item.id,
              qty_accepted: Number(partial[item.id] ?? 0),
            }))
            .filter((line) => line.qty_accepted > 0);

    if (mode === "partial" && (lines ?? []).length === 0) {
      toast({
        title: "Indicá qué cantidades llegaron",
        description: "Cargá al menos un artículo con cantidad recibida.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await confirmReceipt({
        requestId,
        mode,
        receivedAt,
        notes: notes.trim() || null,
        photoPath,
        items: lines,
        idempotencyKey,
      });
      syncInBackground(requestId, mode === "complete" ? "completed" : "partially_received");
      await invalidate(queryClient, requestId);
      toast({
        title: mode === "complete" ? "Pedido recibido" : "Recepción parcial registrada",
        description:
          mode === "complete"
            ? "El pedido quedó como “Recibido” y ya aparece en Pedidos recibidos."
            : "Lo que quedó pendiente sigue registrado: el pedido queda como “Recibido parcialmente”.",
      });
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        {mode === "ask" ? (
          <>
            <DialogHeader>
              <DialogTitle>¿Este pedido ya llegó?</DialogTitle>
              <DialogDescription>
                Solo tenés que confirmarlo: el proveedor, los precios, los enlaces y los artículos ya
                quedaron guardados cuando registraste la compra.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Button
                className="h-auto w-full justify-start px-4 py-3 text-left"
                variant="success"
                onClick={() => setMode("complete")}
              >
                <div>
                  <p className="font-medium">Sí, llegó completo</p>
                  <p className="text-xs opacity-90">Se recibe todo lo aprobado.</p>
                </div>
              </Button>
              <Button
                className="h-auto w-full justify-start px-4 py-3 text-left"
                variant="outline"
                onClick={() => setMode("partial")}
              >
                <div>
                  <p className="font-medium">Llegó parcialmente</p>
                  <p className="text-xs text-muted-foreground">
                    Indicás qué llegó y qué queda pendiente.
                  </p>
                </div>
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  onOpenChange(false);
                  onDetailed();
                }}
              >
                Necesito registrar con detalle (faltantes, incorrectos o dañados)
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {mode === "complete" ? "Confirmar que llegó completo" : "Confirmar recepción parcial"}
              </DialogTitle>
              <DialogDescription>
                {mode === "complete"
                  ? "Se registra la recepción de todo lo aprobado."
                  : "Cargá las cantidades que llegaron; el saldo pendiente se calcula solo."}
              </DialogDescription>
            </DialogHeader>

            {mode === "partial" ? (
              <div className="space-y-3">
                {pendientes.map((item) => {
                  const pending = pendingById[item.id] ?? item.approved_qty;
                  const received = Number(partial[item.id] ?? 0);
                  const remaining = Math.max(pending - (received > 0 ? received : 0), 0);
                  return (
                    <div key={item.id} className="rounded-md border border-border p-3">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Pendiente: {formatQty(pending)} {item.unit ?? ""}
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Cantidad que llegó</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={partial[item.id] ?? ""}
                            onChange={(event) =>
                              setPartial((previous) => ({
                                ...previous,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Queda pendiente</Label>
                          <Input value={formatQty(remaining)} readOnly disabled />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="confirm_received_at">Fecha de recepción</Label>
                <Input
                  id="confirm_received_at"
                  type="date"
                  value={receivedAt}
                  onChange={(event) => setReceivedAt(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Remito o comprobante (opcional)</Label>
                <AttachmentUpload
                  folder={`requests/${requestId}`}
                  label={photoPath ? "Reemplazar remito" : "Adjuntar remito"}
                  onUploaded={setPhotoPath}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="confirm_notes">Observaciones (opcional)</Label>
                <Textarea
                  id="confirm_notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMode("ask")} disabled={saving}>
                Volver
              </Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                Confirmar recepción
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------ Recepción ------------------------------ */

interface ReceiptLine {
  item: RequestItemRow;
  accepted: string;
  wrong: string;
  damaged: string;
  missing: string;
  notes: string;
}

export const ReceiptDialog = ({
  open,
  onOpenChange,
  requestId,
  items,
  pendingById,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  requestId: string;
  items: RequestItemRow[];
  pendingById: Record<string, number>;
}) => {
  const queryClient = useQueryClient();
  const [receivedAt, setReceivedAt] = useState(todayInTimeZone());
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  // Se inicializa una sola vez por apertura: si el pedido se refresca mientras
  // el formulario está abierto, no se pierden las cantidades ya cargadas.
  const initialized = useRef(false);

  const eligible = useMemo(
    () => items.filter((item) => item.approved_qty > 0 && (pendingById[item.id] ?? item.approved_qty) > 0),
    [items, pendingById],
  );

  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    initialized.current = true;
    setLines(
      eligible.map((item) => ({
        item,
        accepted: "",
        wrong: "",
        damaged: "",
        missing: "",
        notes: "",
      })),
    );
    setReceivedAt(todayInTimeZone());
    setReceivedBy("");
    setNotes("");
    setPhotoPath(null);
    setIdempotencyKey(createIdempotencyKey());
  }, [open, eligible]);

  const updateLine = (index: number, patch: Partial<ReceiptLine>) =>
    setLines((previous) =>
      previous.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );

  const handleSubmit = async () => {
    if (saving) return;
    const payloadLines = lines
      .map((line) => ({
        request_item_id: line.item.id,
        qty_accepted: Number(line.accepted || 0),
        qty_wrong: Number(line.wrong || 0),
        qty_damaged: Number(line.damaged || 0),
        qty_missing: Number(line.missing || 0),
        notes: line.notes.trim() || null,
      }))
      .filter(
        (line) =>
          line.qty_accepted > 0 || line.qty_wrong > 0 || line.qty_damaged > 0 || line.qty_missing > 0,
      );

    if (payloadLines.length === 0) {
      toast({
        title: "Sin cantidades",
        description: "Cargá al menos una cantidad recibida, incorrecta, dañada o faltante.",
        variant: "destructive",
      });
      return;
    }

    const overLimit = lines.find(
      (line) =>
        Number(line.accepted || 0) > (pendingById[line.item.id] ?? line.item.approved_qty),
    );
    if (overLimit) {
      toast({
        title: "Cantidad aceptada mayor al saldo",
        description: `${overLimit.item.name} supera el saldo pendiente. Un administrador debe revisarlo.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const fullyReceived = lines.every(
        (line) =>
          Number(line.accepted || 0) >= (pendingById[line.item.id] ?? line.item.approved_qty),
      );
      await registerReceipt(
        {
          request_id: requestId,
          received_at: receivedAt,
          received_by_name: receivedBy.trim() || null,
          notes: notes.trim() || null,
          photo_path: photoPath,
          items: payloadLines,
        },
        idempotencyKey,
      );
      syncInBackground(requestId, fullyReceived ? "completed" : "partially_received");
      await invalidate(queryClient, requestId);
      toast({
        title: "Recepción registrada",
        description: "Solo las cantidades aceptadas descuentan el saldo pendiente.",
      });
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Registrar recepción</DialogTitle>
          <DialogDescription>
            Cantidad recibida = aceptadas + incorrectas + dañadas. Los faltantes se registran aparte
            y no forman parte de lo recibido.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="received_at">Fecha de entrega</Label>
            <Input
              id="received_at"
              type="date"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="received_by">Persona que recibió</Label>
            <Input
              id="received_by"
              value={receivedBy}
              onChange={(event) => setReceivedBy(event.target.value)}
              placeholder="Nombre y apellido"
            />
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => {
            const received =
              Number(line.accepted || 0) + Number(line.wrong || 0) + Number(line.damaged || 0);
            const pending = pendingById[line.item.id] ?? line.item.approved_qty;
            const remaining = Math.max(pending - Number(line.accepted || 0), 0);
            return (
              <div key={line.item.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{line.item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Aprobado {formatQty(line.item.approved_qty)} · Saldo {formatQty(pending)}
                  </p>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Aceptadas</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.accepted}
                      onChange={(event) => updateLine(index, { accepted: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Incorrectas</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.wrong}
                      onChange={(event) => updateLine(index, { wrong: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dañadas</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.damaged}
                      onChange={(event) => updateLine(index, { damaged: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Faltantes</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={line.missing}
                      onChange={(event) => updateLine(index, { missing: event.target.value })}
                    />
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  Recibidas físicamente: {formatQty(received)} · Saldo luego de aceptar:{" "}
                  {formatQty(remaining)}
                  {Number(line.damaged || 0) > 0 || Number(line.wrong || 0) > 0 ? (
                    <span className="ml-1 text-warning-soft-foreground">
                      Las unidades con problemas no se contabilizan como entregadas.
                    </span>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="receipt_notes">Observaciones</Label>
          <Textarea
            id="receipt_notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="space-y-2">
          <Label>Foto del remito o la entrega (opcional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <AttachmentUpload
              folder={`requests/${requestId}`}
              label={photoPath ? "Reemplazar foto" : "Adjuntar foto"}
              onUploaded={setPhotoPath}
            />
            {photoPath ? <span className="text-xs text-muted-foreground">Adjunto cargado</span> : null}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Registrar recepción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------ Revisión de artículo ------------------------------ */

export const ReviewItemDialog = ({
  open,
  onOpenChange,
  item,
  requestId,
  userId,
  mode,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  item: RequestItemRow | null;
  requestId: string;
  userId: string;
  mode: "approve" | "reject" | "info";
}) => {
  const queryClient = useQueryClient();
  const [approvedQty, setApprovedQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && item) {
      setApprovedQty(String(item.approved_qty > 0 ? item.approved_qty : item.requested_qty));
      setReason(item.reason ?? "");
    }
  }, [open, item]);

  if (!item) return null;

  const handleSubmit = async () => {
    if (saving) return;
    if (mode !== "approve" && !reason.trim()) {
      toast({
        title: "El motivo es obligatorio",
        description: "Indicá el motivo para rechazar o pedir más información.",
        variant: "destructive",
      });
      return;
    }
    if (mode === "approve" && !(Number(approvedQty) > 0)) {
      toast({
        title: "Cantidad inválida",
        description: "La cantidad aprobada debe ser mayor a cero.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (mode === "approve") {
        await approveItem(item.id, Number(approvedQty), userId, reason.trim() || null);
      } else if (mode === "reject") {
        await rejectItem(item.id, userId, reason.trim());
      } else {
        await markItemNeedsInfo(item.id, userId, reason.trim());
      }
      const reviewed = await refreshRequestAfterReview(requestId);
      syncInBackground(requestId, reviewed?.status ?? "pending_review");
      await invalidate(queryClient, requestId);
      toast({
        title:
          mode === "approve"
            ? "Artículo aprobado"
            : mode === "reject"
              ? "Artículo rechazado"
              : "Información solicitada",
      });
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const titles = {
    approve: "Aprobar artículo",
    reject: "Rechazar artículo",
    info: "Pedir más información",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>
            {item.name} · solicitado {formatQty(item.requested_qty)} {item.unit ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "approve" ? (
            <div className="space-y-1.5">
              <Label htmlFor="approved_qty">Cantidad aprobada</Label>
              <Input
                id="approved_qty"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={approvedQty}
                onChange={(event) => setApprovedQty(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                La cantidad solicitada se conserva por separado para comparar.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="review_reason">
              {mode === "approve" ? "Observación (opcional)" : "Motivo"}
            </Label>
            <Textarea
              id="review_reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                mode === "approve"
                  ? "Ej.: se aprueba con cantidad ajustada"
                  : "Explicá el motivo para que el encargado lo entienda"
              }
            />
          </div>

          {mode === "info" ? (
            <div className="flex items-start gap-2 rounded-md bg-info-soft p-3 text-xs text-info-soft-foreground">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
              El encargado recibirá una notificación dentro de la aplicación.
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            variant={mode === "reject" ? "destructive" : "default"}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------ Cierre de saldo ------------------------------ */

export const CloseBalanceDialog = ({
  open,
  onOpenChange,
  requestId,
  pendingBalance,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  requestId: string;
  pendingBalance: number;
}) => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({
        title: "Motivo obligatorio",
        description: "Indicá por qué se cierra el saldo pendiente.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await closeRequestBalance(requestId, reason.trim());
      await invalidate(queryClient, requestId);
      toast({ title: "Saldo cerrado", description: "La solicitud quedó completada." });
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar saldo pendiente</DialogTitle>
          <DialogDescription>
            Quedan {formatQty(pendingBalance)} unidades aprobadas sin recibir. Al cerrar el saldo la
            solicitud queda completada y el motivo queda registrado en el historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="close_reason">Motivo del cierre</Label>
          <Textarea
            id="close_reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej.: el proveedor discontinuó el producto y se reemplazó por otro artículo"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Cerrar saldo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* --------------------------- Resolver cambio propuesto --------------------------- */

export const ResolveChangeDialog = ({
  open,
  onOpenChange,
  changeId,
  requestId,
  itemName,
  field,
  oldValue,
  newValue,
  reason,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  changeId: string | null;
  requestId: string;
  itemName: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
}) => {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  const handle = async (action: "accept" | "reject") => {
    if (!changeId) return;
    if (action === "reject" && !note.trim()) {
      toast({
        title: "Motivo obligatorio",
        description: "Indicá por qué se rechaza la propuesta.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (action === "accept") {
        await applyChangeRequest(changeId, note.trim() || null);
      } else {
        await rejectChangeRequest(changeId, note.trim());
      }
      await invalidate(queryClient, requestId);
      toast({
        title: action === "accept" ? "Cambio aplicado" : "Cambio rechazado",
        description:
          action === "accept"
            ? "Revisá si necesitás ajustar la cantidad aprobada del artículo."
            : undefined,
      });
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolver solicitud de cambio</DialogTitle>
          <DialogDescription>{itemName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Campo: </span>
            {field}
          </p>
          <p>
            <span className="text-muted-foreground">Actual: </span>
            {oldValue || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Propuesto: </span>
            {newValue || "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Motivo: </span>
            {reason || "—"}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="resolution_note">Nota de resolución (obligatoria para rechazar)</Label>
          <Textarea
            id="resolution_note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => void handle("reject")} disabled={saving}>
            Rechazar
          </Button>
          <Button variant="success" onClick={() => void handle("accept")} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Aceptar y aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ------------------------------ Pedir información ------------------------------ */

export const RequestInfoDialog = ({
  open,
  onOpenChange,
  requestId,
  userId,
  items,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  requestId: string;
  userId: string;
  items: RequestItemRow[];
}) => {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setMessage("");
  }, [open]);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: "Escribí la consulta",
        description: "La pregunta queda en el historial de la solicitud.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await addComment({
        request_id: requestId,
        author_id: userId,
        body: message.trim(),
        kind: "info_request",
      });
      for (const item of items.filter((entry) => entry.item_status === "pending")) {
        await markItemNeedsInfo(item.id, userId, message.trim());
      }
      await refreshRequestAfterReview(requestId);
      await invalidate(queryClient, requestId);
      toast({ title: "Consulta enviada", description: "El encargado recibió una notificación." });
      onOpenChange(false);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedir información</DialogTitle>
          <DialogDescription>
            Se registra en la conversación y los artículos pendientes quedan marcados como “falta
            información”.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="info_message">Consulta</Label>
          <Textarea
            id="info_message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ej.: ¿qué medida exacta de caja necesitás?"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar consulta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
