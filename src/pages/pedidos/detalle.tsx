import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Loader2,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Copy,
  MessageSquarePlus,
  PackageCheck,
  Pencil,
  RefreshCw,
  Repeat,
  Send,
  ShoppingCart,
} from "lucide-react";
import { ItemStatusBadge, PriorityBadge, StatusBadge, ToneBadge } from "@/components/badges";
import { AttachmentList, AttachmentLink } from "@/components/attachments";
import { readSavedAttachments } from "@/lib/sizes";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { SizeBreakdown } from "@/components/requests/size-breakdown";
import { ProductLinkButton } from "@/components/product-link";
import {
  ChangeRequestDialog,
  ConfirmReceiptDialog,
  CloseBalanceDialog,
  ReceiptDialog,
  RequestInfoDialog,
  ResolveChangeDialog,
  ReviewItemDialog,
} from "@/components/requests/request-dialogs";
import { AdminPicker } from "@/components/requests/admin-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/auth-context";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { useRequestBundle } from "@/hooks/use-requests";
import {
  addComment,
  confirmReceipt,
  reassignRequest,
  fetchIntegrationLog,
  createDraftRequest,
  insertRequestItems,
  sendRequestEmails,
  submitRequest,
} from "@/lib/api";
import { CHANNELS, EMAIL_STATUS, MACHINERY_TYPES, categoryLabel, labelOf } from "@/lib/constants";
import { daysSince, formatDate, formatDateTime, formatQty } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { eventFromStatus, syncInBackground, syncOrderToGoogle } from "@/lib/integrations";
import { createIdempotencyKey } from "@/lib/idempotency";
import { readSavedSizes } from "@/lib/sizes";
import { can } from "@/lib/permissions";
import { proximaAccion, quienActua } from "@/lib/proxima-accion";
import type { RequestItemRow } from "@/lib/types";

// En estos estados el pedido ya terminó: no se reasigna.
const CLOSED_STATUSES = ["completed", "rejected", "cancelled"];
// Antes de estos estados todavía no hay nada autorizado para comprar.
const PRE_PURCHASE_STATUSES = ["draft", "pending_review", "evaluating", "needs_info", "rejected", "cancelled"];

const RequestDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = can.isAdmin(role);
  const { personName } = usePeopleMaps();

  const { data: bundle, isLoading, error, refetch } = useRequestBundle(id, { emails: isAdmin });

  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [reassignReason, setReassignReason] = useState("");
  // Responsable elegido al enviar un borrador desde esta pantalla.
  const [submitTo, setSubmitTo] = useState<string>("");
  const [reviewItem, setReviewItem] = useState<RequestItemRow | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject" | "info">("approve");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [changeItem, setChangeItem] = useState<RequestItemRow | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [changeToResolve, setChangeToResolve] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const request = bundle?.request;
  const items = useMemo(() => bundle?.items ?? [], [bundle]);

  const aggregates = useMemo(() => {
    const itemList = bundle?.items ?? [];
    const purchasedById: Record<string, number> = {};
    for (const line of bundle?.purchaseItems ?? []) {
      purchasedById[line.request_item_id] = (purchasedById[line.request_item_id] ?? 0) + Number(line.qty);
    }
    const acceptedById: Record<string, number> = {};
    const incidentById: Record<string, number> = {};
    for (const line of bundle?.receiptItems ?? []) {
      acceptedById[line.request_item_id] =
        (acceptedById[line.request_item_id] ?? 0) + Number(line.qty_accepted);
      incidentById[line.request_item_id] =
        (incidentById[line.request_item_id] ?? 0) +
        Number(line.qty_damaged) +
        Number(line.qty_wrong);
    }
    const pendingById: Record<string, number> = {};
    for (const item of itemList) {
      pendingById[item.id] = Math.max(
        Number(item.approved_qty) - (acceptedById[item.id] ?? 0),
        0,
      );
    }
    const approvedTotal = itemList.reduce(
      (total, item) => (item.item_status === "rejected" || item.item_status === "cancelled" ? total : total + Number(item.approved_qty)),
      0,
    );
    const pendingTotal = Object.values(pendingById).reduce((total, value) => total + value, 0);
    // Lo que se puede recibir es lo comprado que todavía no llegó; lo que falta
    // comprar sigue pendiente de compra (así no se pierde ningún saldo).
    const receivableById: Record<string, number> = {};
    let toBuyTotal = 0;
    for (const item of itemList) {
      if (item.item_status === "rejected" || item.item_status === "cancelled") continue;
      const approved = Number(item.approved_qty);
      const purchased = purchasedById[item.id] ?? 0;
      receivableById[item.id] = Math.max(Math.min(approved, purchased) - (acceptedById[item.id] ?? 0), 0);
      toBuyTotal += Math.max(approved - purchased, 0);
    }
    const receivableTotal = Object.values(receivableById).reduce((total, value) => total + value, 0);
    const acceptedTotal = Object.values(acceptedById).reduce((total, value) => total + value, 0);
    return {
      purchasedById,
      acceptedById,
      incidentById,
      pendingById,
      receivableById,
      approvedTotal,
      pendingTotal,
      acceptedTotal,
      receivableTotal,
      toBuyTotal,
    };
  }, [bundle]);

  const pendingChange = (bundle?.changes ?? []).find((change) => change.status === "pending");

  const integrationLog = useQuery({
    queryKey: ["integration-log", id],
    enabled: Boolean(id) && isAdmin,
    queryFn: () => fetchIntegrationLog(id as string),
  });

  const handleSyncNow = async () => {
    if (!id || !request) return;
    const event = eventFromStatus(request.status);
    if (!event) {
      toast({
        title: "Sin sincronización para este estado",
        description: "Los borradores no se envían a Gmail, Drive ni Sheets.",
      });
      return;
    }
    setSyncing(true);
    try {
      const result = await syncOrderToGoogle(id, event);
      await integrationLog.refetch();
      const channels = result.channels ?? {};
      const summary = Object.entries(channels)
        .map(([channel, value]) => `${channel}: ${value.status}`)
        .join(" · ");
      toast({
        title: result.ok ? `Sincronizado (${event})` : "No se pudo sincronizar",
        description:
          summary ||
          result.error ||
          "Revisá el detalle de integraciones en esta misma pantalla.",
        variant: result.ok && summary.includes("failed") ? "destructive" : undefined,
      });
    } finally {
      setSyncing(false);
    }
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["request-bundle", id] });
    await queryClient.invalidateQueries({ queryKey: ["requests"] });
  };

  const handleReassign = async () => {
    if (!id || busy) return;
    if (!reassignTo || !reassignReason.trim()) {
      toast({
        title: "Faltan datos",
        description: "Elegí a quién le pasás el pedido y escribí el motivo.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await reassignRequest(id, reassignTo, reassignReason.trim());
      await refresh();
      toast({
        title: "Pedido reasignado",
        description: `Ahora lo gestiona ${personName(reassignTo) ?? "otro administrador"}. Se avisó al solicitante.`,
      });
      setReassignOpen(false);
      setReassignTo("");
      setReassignReason("");
    } catch (reassignError) {
      toast({
        title: "No se pudo reasignar",
        description: friendlyError(reassignError, "No pudimos reasignar el pedido. Intentá nuevamente."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  // "Llegó completo": un clic. Recibe todo lo comprado que faltaba recibir.
  const handleArrivedComplete = async () => {
    if (!id || busy) return;
    setBusy(true);
    try {
      await confirmReceipt({
        requestId: id,
        mode: "complete",
        receivedAt: null,
        idempotencyKey: createIdempotencyKey(),
      });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({
        title: "Recepción confirmada",
        description: "Quedó registrado quién la confirmó y cuándo. Si falta comprar algo, sigue pendiente de compra.",
      });
    } catch (receiptError) {
      toast({
        title: "No se pudo confirmar la recepción",
        description: friendlyError(receiptError, "Intentá nuevamente o registrá la recepción con detalle."),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitDraft = async () => {
    if (!id) return;
    if (!request?.assigned_admin_id && !submitTo) {
      toast({
        title: "Falta el responsable",
        description: "Elegí a qué administrador le enviás el pedido.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const submitted = await submitRequest(id, submitTo || null);
      syncInBackground(submitted.id, submitted.status);
      try {
        await sendRequestEmails(id);
      } catch {
        toast({
          title: "Solicitud enviada",
          description: "Los avisos por correo no pudieron procesarse; se pueden reintentar.",
        });
      }
      await refresh();
      toast({ title: "Solicitud enviada" });
    } catch (submitError) {
      toast({
        title: "No se pudo enviar",
        description: friendlyError(
          submitError,
          "No pudimos enviar el pedido. Intentá nuevamente o contactá a un administrador.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRetryEmails = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const result = await sendRequestEmails(id);
      await refresh();
      if (result.status === "pending_config") {
        toast({
          title: "Pendiente de configuración",
          description: "Falta configurar el servicio de correo para poder enviar los avisos.",
        });
      } else if (result.status === "nothing_to_send") {
        toast({ title: "No hay avisos pendientes de envío" });
      } else {
        toast({
          title: "Avisos procesados",
          description: `Enviados: ${result.sent ?? 0} · Fallidos: ${result.failed ?? 0}`,
        });
      }
    } catch (emailError) {
      toast({
        title: "No se pudieron procesar los avisos",
        description: emailError instanceof Error ? emailError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRepeat = async () => {
    if (!request || !user) return;
    setBusy(true);
    try {
      const created = await createDraftRequest({
        idempotency_key: createIdempotencyKey(),
        requester_id: user.id,
        category: request.category,
        needed_by: request.needed_by,
        priority: "normal",
        urgency_reason: null,
        notes: request.notes,
        machinery_type: request.machinery_type,
        equipment_name: request.equipment_name,
        problem: request.problem,
        expected_benefit: request.expected_benefit,
        no_purchase_consequence: request.no_purchase_consequence,
        current_equipment: request.current_equipment,
        technical_specs: request.technical_specs,
        estimated_price: request.estimated_price,
      });
      await insertRequestItems(
        items.map((item, index) => ({
          request_id: created.id,
          line_no: index + 1,
          catalog_item_id: item.catalog_item_id,
          name: item.name,
          description: item.description,
          specifications: item.specifications ?? {},
          unit: item.unit,
          package_content: item.package_content,
          reported_stock: item.reported_stock,
          requested_qty: item.requested_qty,
          unit_price_estimate: item.unit_price_estimate,
          suggested_url: item.suggested_url,
          notes: item.notes,
        })),
      );
      toast({
        title: "Borrador creado",
        description: "Revisá cantidades y fechas antes de enviarlo. No se envía solo.",
      });
      navigate(`/nuevo/${request.category}?borrador=${created.id}`);
    } catch (repeatError) {
      toast({
        title: "No se pudo repetir el pedido",
        description: repeatError instanceof Error ? repeatError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleComment = async () => {
    if (!id || !user || !comment.trim()) return;
    setCommenting(true);
    try {
      await addComment({ request_id: id, author_id: user.id, body: comment.trim() });
      setComment("");
      await refresh();
    } catch (commentError) {
      toast({
        title: "No se pudo publicar el comentario",
        description: commentError instanceof Error ? commentError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCommenting(false);
    }
  };

  if (isLoading) return <LoadingState label="Cargando la solicitud..." />;
  if (error || !request || !bundle) {
    return (
      <ErrorState
        message={
          error instanceof Error
            ? `${error.message}. Puede que la solicitud no exista o que no tengas acceso.`
            : "No se pudo cargar la solicitud."
        }
        onRetry={() => void refetch()}
      />
    );
  }

  const isMine = request.requester_id === user?.id;
  const canEditDraft = isMine && (request.status === "draft" || request.status === "needs_info");
  const attachments = items.map((item) => item.photo_path).filter(Boolean) as string[];
  const machinery = request.category === "maquinaria";

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to={can.viewOrders(role) ? "/admin/pedidos" : "/pedidos"}>
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {request.folio ?? "Borrador sin número"}
                </h1>
                <StatusBadge status={request.status} />
                <PriorityBadge priority={request.priority} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {categoryLabel(request.category)} · {personName(request.requester_id) ?? "Sin solicitante"}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">Fecha necesaria</p>
              <p className="font-medium">{formatDate(request.needed_by)}</p>
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Creada</p>
              <p>{formatDateTime(request.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Enviada</p>
              <p>{request.submitted_at ? formatDateTime(request.submitted_at) : "Sin enviar"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Asignado a</p>
              <p className="font-medium">{personName(request.assigned_admin_id) ?? "Sin asignar"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Días desde el envío</p>
              <p>{daysSince(request.submitted_at) ?? "—"}</p>
            </div>
          </div>

          {request.submitted_at ? (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md p-3 text-sm ${
                proximaAccion(request.status).terminado ? "bg-muted" : "bg-info-soft text-info-soft-foreground"
              }`}
            >
              <span>
                {proximaAccion(request.status).terminado ? "Estado final: " : "Próxima acción: "}
                <strong>{proximaAccion(request.status).texto}</strong>
                {quienActua(request, personName) ? (
                  <>
                    {" "}
                    · a cargo de <strong>{quienActua(request, personName)}</strong>
                  </>
                ) : null}
              </span>
              {aggregates.toBuyTotal > 0 && aggregates.receivableTotal > 0 ? (
                <span className="text-xs">Hay artículos para recibir y otros que todavía falta comprar.</span>
              ) : null}
            </div>
          ) : null}

          {request.priority === "urgente" && request.urgency_reason ? (
            <div className="rounded-md bg-destructive-soft p-3 text-sm text-destructive-soft-foreground">
              Urgencia: {request.urgency_reason}
            </div>
          ) : null}

          {request.notes ? (
            <div>
              <p className="text-sm text-muted-foreground">Observaciones generales</p>
              <p className="text-sm">{request.notes}</p>
            </div>
          ) : null}

          {request.closed_reason ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              Saldo cerrado por {personName(request.closed_by) ?? "administrador"}:{" "}
              {request.closed_reason}
            </div>
          ) : null}

          {canEditDraft && !request.assigned_admin_id ? (
            <div className="max-w-sm">
              <AdminPicker
                id="enviar-borrador-a"
                label="¿A qué administrador se lo enviás?"
                help="Es obligatorio: esa persona queda como responsable y recibe el aviso."
                value={submitTo}
                onChange={setSubmitTo}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && request.submitted_at ? (
              <>
                {request.assigned_admin_id === user?.id ? (
                  <ToneBadge tone="success">Lo estoy gestionando</ToneBadge>
                ) : null}
                {request.assigned_admin_id && !CLOSED_STATUSES.includes(request.status) ? (
                  <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)} disabled={busy}>
                    <Repeat className="h-4 w-4" />
                    Reasignar pedido
                  </Button>
                ) : null}
              </>
            ) : null}

            {canEditDraft ? (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/nuevo/${request.category}?borrador=${request.id}`}>
                  <Pencil className="h-4 w-4" />
                  Editar borrador
                </Link>
              </Button>
            ) : null}

            {canEditDraft ? (
              <Button
                size="sm"
                onClick={() => void handleSubmitDraft()}
                disabled={busy || (!request.assigned_admin_id && !submitTo)}
              >
                <Send className="h-4 w-4" />
                Enviar solicitud
              </Button>
            ) : null}

            {!machinery ? (
              <Button size="sm" variant="outline" onClick={() => void handleRepeat()} disabled={busy}>
                <Copy className="h-4 w-4" />
                Repetir pedido
              </Button>
            ) : null}

            {request.submitted_at && aggregates.receivableTotal > 0 ? (
              <>
                <Button size="sm" onClick={() => void handleArrivedComplete()} disabled={busy}>
                  <PackageCheck className="h-4 w-4" />
                  Llegó completo
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDetailedOpen(true)} disabled={busy}>
                  Llegó incompleto o con problemas
                </Button>
              </>
            ) : null}

            {isAdmin && aggregates.pendingTotal > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setCloseOpen(true)}>
                <CheckCircle2 className="h-4 w-4" />
                Cerrar saldo
              </Button>
            ) : null}

            {isAdmin && request.status !== "draft" ? (
              <Button size="sm" variant="outline" onClick={() => setInfoOpen(true)}>
                <MessageSquarePlus className="h-4 w-4" />
                Pedir información
              </Button>
            ) : null}

            {can.registerPurchase(role) && aggregates.toBuyTotal > 0 && !request.closed_at &&
            !PRE_PURCHASE_STATUSES.includes(request.status) ? (
              <Button size="sm" asChild>
                <Link to={`/admin/compras/nueva?pedido=${request.id}`}>
                  <ShoppingCart className="h-4 w-4" />
                  Registrar compra
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {request.status === "purchased_pending_receipt" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <span>
            La compra ya está registrada. Cuando llegue la mercadería, confirmá la recepción: no hace
            falta volver a cargar proveedor, precios, enlaces ni artículos.
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void handleArrivedComplete()} disabled={busy}>
              Llegó completo
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-card"
              onClick={() => setDetailedOpen(true)}
              disabled={busy}
            >
              Llegó incompleto o con problemas
            </Button>
          </div>
        </div>
      ) : null}

      {pendingChange ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Hay una solicitud de cambio pendiente de revisión sobre{" "}
            <strong>{items.find((item) => item.id === pendingChange.request_item_id)?.name}</strong>.
          </span>
          {isAdmin ? (
            <Button size="sm" variant="outline" className="bg-card" onClick={() => setChangeToResolve(pendingChange.id)}>
              Resolver
            </Button>
          ) : null}
        </div>
      ) : null}

      {machinery ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Detalle de la maquinaria o mejora</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Título" value={request.equipment_name} />
            <Field label="Tipo" value={labelOf(MACHINERY_TYPES, request.machinery_type)} />
            <Field label="Problema o necesidad" value={request.problem} />
            <Field label="Beneficio esperado" value={request.expected_benefit} />
            <Field label="Equipo actual y estado" value={request.current_equipment} />
            <Field label="Especificaciones necesarias" value={request.technical_specs} />
            <Field
              label="Precio estimado"
              value={request.estimated_price != null ? `$ ${request.estimated_price}` : "Sin informar"}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Artículos</CardTitle>
          <span className="text-xs text-muted-foreground">
            Aprobado {formatQty(aggregates.approvedTotal)} · Pendiente {formatQty(aggregates.pendingTotal)}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <EmptyState title="La solicitud no tiene artículos" />
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.name}</p>
                    {item.description ? (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                    {(() => {
                      const specs = item.specifications ?? {};
                      const motivo =
                        typeof specs.motivo === "string" ? specs.motivo.trim() : "";
                      const destinatario =
                        typeof specs.destinatario === "string" ? specs.destinatario.trim() : "";
                      if (!motivo && !destinatario) return null;
                      return (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            motivo ? `Motivo: ${motivo}` : null,
                            destinatario ? `Destino: ${destinatario}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      );
                    })()}
                  </div>
                  <ItemStatusBadge status={item.item_status} />
                </div>

                <SizeBreakdown
                  entries={readSavedSizes(item.specifications)}
                  label={
                    request.category === "insumos"
                      ? "Cantidades por medida o presentación"
                      : "Cantidades por talle o medida"
                  }
                />

                <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <div>
                    <p className="text-xs text-muted-foreground">Solicitado</p>
                    <p>
                      {formatQty(item.requested_qty)} {item.unit ?? ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Aprobado</p>
                    <p>{formatQty(item.approved_qty)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Comprado</p>
                    <p>{formatQty(aggregates.purchasedById[item.id] ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Recibido</p>
                    <p>{formatQty(aggregates.acceptedById[item.id] ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                    <p className="font-medium">{formatQty(aggregates.pendingById[item.id] ?? 0)}</p>
                  </div>
                </div>

                {item.package_content ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Presentación: {item.package_content}
                  </p>
                ) : null}
                {item.reported_stock != null ? (
                  <p className="text-xs text-muted-foreground">
                    Stock informado en la solicitud: {formatQty(item.reported_stock)}
                  </p>
                ) : null}
                {item.reason ? (
                  <p className="mt-1 text-xs text-destructive-soft-foreground">Motivo: {item.reason}</p>
                ) : null}
                {(aggregates.incidentById[item.id] ?? 0) > 0 ? (
                  <p className="mt-1 text-xs text-warning-soft-foreground">
                    Unidades con problemas registradas: {formatQty(aggregates.incidentById[item.id])} (no
                    cuentan como entregadas)
                  </p>
                ) : null}
                {readSavedAttachments(item.specifications).length > 0 ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Adjuntos ({readSavedAttachments(item.specifications).length})
                    </p>
                    <AttachmentList paths={readSavedAttachments(item.specifications)} />
                  </div>
                ) : null}
                {item.change_pending ? (
                  <p className="mt-1 text-xs text-warning-soft-foreground">
                    Tiene un cambio pendiente de revisión.
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.suggested_url ? (
                    <ProductLinkButton
                      url={item.suggested_url}
                      label={isAdmin ? "Abrir producto sugerido" : "Ver enlace del producto"}
                    />
                  ) : null}
                  {isAdmin && item.purchase_url ? (
                    <ProductLinkButton url={item.purchase_url} label="Abrir enlace de la compra" />
                  ) : null}
                  {item.photo_path ? <AttachmentLink path={item.photo_path} label="Ver foto" /> : null}
                  {isAdmin &&
                  request.submitted_at &&
                  (item.item_status === "pending" || item.item_status === "needs_info") ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReviewItem(item);
                          setReviewMode("approve");
                          setReviewOpen(true);
                        }}
                      >
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReviewItem(item);
                          setReviewMode("reject");
                          setReviewOpen(true);
                        }}
                      >
                        Rechazar
                      </Button>
                    </>
                  ) : null}
                  {item.item_status === "approved" || item.item_status === "rejected" ? (
                    <span className="text-xs text-muted-foreground">
                      {item.item_status === "approved"
                        ? `Aprobado · cantidad ${formatQty(item.approved_qty)}`
                        : "Rechazado"}
                      {item.approved_at ? ` · ${formatDateTime(item.approved_at)}` : ""}
                      {item.approved_by
                        ? ` · ${personName(item.approved_by) ?? "administrador"}`
                        : ""}
                      {" · decisión registrada"}
                    </span>
                  ) : null}
                  {request.submitted_at && (item.approved_qty > 0 || (aggregates.purchasedById[item.id] ?? 0) > 0) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setChangeItem(item);
                        setChangeOpen(true);
                      }}
                    >
                      Solicitar cambio
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}

          {attachments.length > 0 ? (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Adjuntos de la solicitud</p>
                <AttachmentList paths={attachments} />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {bundle.purchases.length > 0 ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Compras registradas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bundle.purchases.map((purchase) => (
              <div key={purchase.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{purchase.folio}</p>
                    <p className="text-xs text-muted-foreground">
                      {labelOf(CHANNELS, purchase.channel)} · {purchase.vendor_name ?? "Sin proveedor"} ·{" "}
                      {formatDate(purchase.purchase_date)}
                    </p>
                  </div>
                  <Link
                    to={`/admin/compras/${purchase.id}`}
                    className="text-sm text-primary underline-offset-2 hover:underline"
                  >
                    Ver compra
                  </Link>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {bundle.purchaseItems
                    .filter((line) => line.purchase_id === purchase.id)
                    .map((line) => {
                      const item = items.find((entry) => entry.id === line.request_item_id);
                      return (
                        <li key={line.id} className="flex justify-between gap-2">
                          <span className="truncate">{item?.name ?? "Artículo"}</span>
                          <span className="text-muted-foreground">{formatQty(line.qty)}</span>
                        </li>
                      );
                    })}
                </ul>
                {isAdmin && purchase.invoice_path ? (
                  <div className="mt-2">
                    <AttachmentLink path={purchase.invoice_path} label="Ver comprobante" />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {bundle.receipts.length > 0 ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Recepciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bundle.receipts.map((receipt) => (
              <div key={receipt.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{receipt.folio}</p>
                    <p className="text-xs text-muted-foreground">
                      Llegó el {formatDate(receipt.received_at)} · Confirmó{" "}
                      <span className="font-medium text-foreground">
                        {receipt.received_by_name ?? personName(receipt.created_by) ?? "—"}
                      </span>{" "}
                      el {formatDateTime(receipt.created_at)}
                    </p>
                  </div>
                  {receipt.photo_path ? (
                    <AttachmentLink path={receipt.photo_path} label="Ver foto" />
                  ) : null}
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {bundle.receiptItems
                    .filter((line) => line.receipt_id === receipt.id)
                    .map((line) => {
                      const item = items.find((entry) => entry.id === line.request_item_id);
                      return (
                        <li key={line.id} className="flex flex-wrap justify-between gap-2">
                          <span className="truncate">{item?.name ?? "Artículo"}</span>
                          <span className="text-muted-foreground">
                            aceptadas {formatQty(line.qty_accepted)}
                            {Number(line.qty_wrong) > 0 ? ` · incorrectas ${formatQty(line.qty_wrong)}` : ""}
                            {Number(line.qty_damaged) > 0 ? ` · dañadas ${formatQty(line.qty_damaged)}` : ""}
                            {Number(line.qty_missing) > 0 ? ` · faltantes ${formatQty(line.qty_missing)}` : ""}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card className="shadow-card">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              Integraciones: Gmail, Drive y Sheets
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => void handleSyncNow()} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar ahora
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Aviso por correo a los administradores, registro en la planilla y archivo de
              comprobantes y adjuntos en Drive. Un reintento no duplica avisos ni filas.
            </p>
            {(integrationLog.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay sincronizaciones para este pedido.
              </p>
            ) : (
              (integrationLog.data ?? []).map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-xs"
                >
                  <span className="font-medium">
                    {row.channel === "gmail"
                      ? "Gmail"
                      : row.channel === "drive"
                        ? "Google Drive"
                        : "Google Sheets"}{" "}
                    · {row.event}
                  </span>
                  <ToneBadge
                    tone={
                      row.status === "ok" ? "success" : row.status === "skipped" ? "neutral" : "danger"
                    }
                  >
                    {row.status === "ok" ? "Listo" : row.status === "skipped" ? "Ya estaba" : "Falló"}
                  </ToneBadge>
                  {row.detail ? (
                    <span className="w-full text-muted-foreground">{row.detail}</span>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card className="shadow-card">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Avisos por correo</CardTitle>
            <Button size="sm" variant="outline" onClick={() => void handleRetryEmails()} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Reintentar envío
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {bundle.emails.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay avisos generados. Se crean al enviar la solicitud.
              </p>
            ) : (
              bundle.emails.map((email) => (
                <div
                  key={email.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <span className="truncate">{email.recipient_email}</span>
                  <ToneBadge tone={EMAIL_STATUS[email.status]?.tone ?? "neutral"}>
                    {EMAIL_STATUS[email.status]?.label ?? email.status}
                  </ToneBadge>
                </div>
              ))
            )}
            {bundle.emails.some((email) => email.status === "pending_config") ? (
              <p className="text-xs text-warning-soft-foreground">
                Los avisos con estado “Pendiente de configuración” se reintentan automáticamente en el
                próximo intento, una vez cargadas las credenciales del servicio de correo.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Comentarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(bundle.comments ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay comentarios.</p>
          ) : (
            bundle.comments.map((entry) => (
              <div
                key={entry.id}
                className={
                  entry.kind === "info_request"
                    ? "rounded-md bg-info-soft p-3 text-sm text-info-soft-foreground"
                    : "rounded-md border border-border p-3 text-sm"
                }
              >
                <p className="font-medium">
                  {personName(entry.author_id) ?? "Usuario"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </span>
                  {entry.kind === "info_request" ? (
                    <span className="ml-2 text-xs font-normal">· pedido de información</span>
                  ) : null}
                </p>
                <p className="mt-1 whitespace-pre-line">{entry.body}</p>
              </div>
            ))
          )}

          <Separator />
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Escribí un comentario o una respuesta"
            />
            <div className="flex justify-end">
              <Button onClick={() => void handleComment()} disabled={commenting || !comment.trim()}>
                <Send className="h-4 w-4" />
                Publicar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Historial de cambios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(bundle.events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
          ) : (
            bundle.events.map((event) => (
              <div key={event.id} className="flex gap-3 text-sm">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">{event.message ?? event.event_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(event.created_at)} · {personName(event.actor_id) ?? "Sistema"}
                  </p>
                </div>
              </div>
            ))
          )}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            El historial no se puede borrar desde la aplicación.
          </p>
        </CardContent>
      </Card>

      <ChangeRequestDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        requestId={request.id}
        item={changeItem}
        userId={user?.id ?? ""}
      />

      <ConfirmReceiptDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        requestId={request.id}
        items={items}
        pendingById={aggregates.receivableById}
        onDetailed={() => setDetailedOpen(true)}
      />

      <ReceiptDialog
        open={detailedOpen}
        onOpenChange={setDetailedOpen}
        requestId={request.id}
        items={items}
        pendingById={aggregates.receivableById}
      />

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reasignar pedido {request.folio ?? ""}</DialogTitle>
            <DialogDescription>
              Hoy lo gestiona {personName(request.assigned_admin_id) ?? "otro administrador"}. El cambio queda en el
              historial y se avisa al nuevo responsable y al solicitante.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <AdminPicker
              id="reasignar-a"
              label="Pasárselo a"
              value={reassignTo}
              onChange={setReassignTo}
              excludeId={request.assigned_admin_id}
            />
            <div className="space-y-1.5">
              <Label htmlFor="motivo-reasignacion">Motivo (obligatorio)</Label>
              <Textarea
                id="motivo-reasignacion"
                value={reassignReason}
                onChange={(event) => setReassignReason(event.target.value)}
                placeholder="Por ejemplo: estoy de licencia esta semana"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReassignOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void handleReassign()} disabled={busy || !reassignTo || !reassignReason.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
              Reasignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReviewItemDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        item={reviewItem}
        requestId={request.id}
        userId={user?.id ?? ""}
        mode={reviewMode}
      />

      <CloseBalanceDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        requestId={request.id}
        pendingBalance={aggregates.pendingTotal}
      />

      <RequestInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        requestId={request.id}
        userId={user?.id ?? ""}
        items={items}
      />

      <ResolveChangeDialog
        open={Boolean(changeToResolve)}
        onOpenChange={(value) => setChangeToResolve(value ? changeToResolve : null)}
        changeId={changeToResolve}
        requestId={request.id}
        itemName={items.find((item) => item.id === pendingChange?.request_item_id)?.name ?? ""}
        field={pendingChange?.field ?? ""}
        oldValue={pendingChange?.old_value ?? null}
        newValue={pendingChange?.new_value ?? null}
        reason={pendingChange?.reason ?? null}
      />
    </div>
  );
};

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm">{value || "—"}</p>
  </div>
);

export default RequestDetailPage;
