import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, PackageCheck, Save } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { AttachmentLink, AttachmentUpload } from "@/components/attachments";
import { ErrorState, LoadingState } from "@/components/feedback";
import { ToneBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { usePurchaseBundle } from "@/hooks/use-purchases";
import { useItemsByIds } from "@/hooks/use-items-by-ids";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { useRequests } from "@/hooks/use-requests";
import { updatePurchase } from "@/lib/api";
import { CHANNELS, labelOf } from "@/lib/constants";
import { formatCurrency, formatDate, formatQty, isOverdue } from "@/lib/format";
import type { PurchaseItemRow } from "@/lib/types";

const PurchaseDetailPage = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { personName } = usePeopleMaps();
  const { data: requests } = useRequests({ limit: 500 });
  const { data, isLoading, error, refetch } = usePurchaseBundle(id);
  const itemIds = (data?.items ?? []).map((line) => line.request_item_id);
  const { data: requestItems } = useItemsByIds(itemIds);

  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"purchasing" | "purchased">("purchased");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEstimatedDelivery(data.purchase.estimated_delivery_date ?? "");
    setTracking(data.purchase.tracking ?? "");
    setNotes(data.purchase.notes ?? "");
    setStatus(data.purchase.status);
  }, [data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["purchase", id] });
    await queryClient.invalidateQueries({ queryKey: ["purchases"] });
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updatePurchase(id, {
        estimated_delivery_date: estimatedDelivery || null,
        tracking: tracking.trim() || null,
        notes: notes.trim() || null,
        status,
        updated_at: new Date().toISOString(),
      });
      await refresh();
      toast({ title: "Compra actualizada" });
    } catch (saveError) {
      toast({
        title: "No se pudo actualizar la compra",
        description: saveError instanceof Error ? saveError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInvoice = async (path: string) => {
    if (!id) return;
    try {
      await updatePurchase(id, { invoice_path: path });
      await refresh();
      toast({ title: "Comprobante adjuntado" });
    } catch (invoiceError) {
      toast({
        title: "No se pudo adjuntar el comprobante",
        description: invoiceError instanceof Error ? invoiceError.message : undefined,
        variant: "destructive",
      });
    }
  };

  if (isLoading) return <LoadingState label="Cargando la compra..." />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "No se pudo cargar la compra."}
        onRetry={() => void refetch()}
      />
    );
  }

  const { purchase, items } = data;

  const groupByRequest = (lines: PurchaseItemRow[]) => {
    const map = new Map<string, PurchaseItemRow[]>();
    for (const line of lines) {
      const item = (requestItems ?? []).find((entry) => entry.id === line.request_item_id);
      const key = item?.request_id ?? "sin-solicitud";
      map.set(key, [...(map.get(key) ?? []), line]);
    }
    return map;
  };

  const groups = groupByRequest(items ?? []);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/compras">
          <ArrowLeft className="h-4 w-4" />
          Volver a compras
        </Link>
      </Button>

      <PageHeader
        title={purchase.folio ?? "Compra"}
        description={`${labelOf(CHANNELS, purchase.channel)} · ${purchase.vendor_name ?? "Sin proveedor"} · ${formatDate(purchase.purchase_date)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ToneBadge tone={status === "purchasing" ? "info" : "success"}>
              {status === "purchasing" ? "En compra" : "Comprado"}
            </ToneBadge>
            {purchase.estimated_delivery_date ? (
              <ToneBadge tone={isOverdue(purchase.estimated_delivery_date) ? "danger" : "neutral"}>
                Entrega estimada {formatDate(purchase.estimated_delivery_date)}
              </ToneBadge>
            ) : null}
          </div>
        }
      />

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Resumen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Comprador</p>
            <p className="text-sm">{personName(purchase.created_by) ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Número de orden</p>
            <p className="text-sm">{purchase.order_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Envío</p>
            <p className="text-sm">{formatCurrency(purchase.shipping_cost, purchase.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-sm font-semibold">{formatCurrency(purchase.total, purchase.currency)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Comprobante</p>
            {purchase.invoice_path ? (
              <AttachmentLink path={purchase.invoice_path} label="Ver comprobante" />
            ) : (
              <AttachmentUpload folder={`purchases/${purchase.id}`} label="Adjuntar" onUploaded={handleInvoice} />
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Observaciones</p>
            <p className="text-sm">{purchase.notes ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Artículos y solicitudes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...groups.entries()].map(([requestId, lines]) => {
            const firstItem = (requestItems ?? []).find((entry) => entry.id === lines[0]?.request_item_id);
            return (
              <div key={requestId} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Solicitud{" "}
                    {requests?.find((request) => request.id === requestId)?.folio ?? "asociada"}
                  </p>
                  {requestId !== "sin-solicitud" ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/pedidos/${requestId}`}>
                        <PackageCheck className="h-4 w-4" />
                        Abrir solicitud para registrar recepción
                      </Link>
                    </Button>
                  ) : null}
                </div>
                <div className="overflow-hidden rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Artículo</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Precio unitario</TableHead>
                        <TableHead>Enlace</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => {
                        const item = (requestItems ?? []).find((entry) => entry.id === line.request_item_id);
                        return (
                          <TableRow key={line.id}>
                            <TableCell>{item?.name ?? "Artículo"}</TableCell>
                            <TableCell>
                              {formatQty(line.qty)} {item?.unit ?? ""}
                            </TableCell>
                            <TableCell>
                              {line.unit_price != null ? formatCurrency(line.unit_price, line.currency) : "—"}
                            </TableCell>
                            <TableCell>
                              {line.product_url ? (
                                <a
                                  href={line.product_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                  Abrir producto comprado
                                </a>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Seguimiento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="status">Estado de la compra</Label>
            <Input
              id="status"
              value={status === "purchasing" ? "En compra" : "Comprado / pendiente de recepción"}
              readOnly
              disabled
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant={status === "purchasing" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatus("purchasing")}
              >
                En compra
              </Button>
              <Button
                variant={status === "purchased" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatus("purchased")}
              >
                Comprado
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estimated">Fecha estimada de entrega</Label>
            <Input
              id="estimated"
              type="date"
              value={estimatedDelivery}
              onChange={(event) => setEstimatedDelivery(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tracking">Seguimiento del envío</Label>
            <Input
              id="tracking"
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="purchase_notes">Observaciones</Label>
            <Textarea
              id="purchase_notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PurchaseDetailPage;
