import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { usePendingPurchaseSummary } from "@/hooks/use-requests";
import { registerPurchase, updatePurchase } from "@/lib/api";
import { CHANNELS } from "@/lib/constants";
import { formatCurrency, formatQty, todayInTimeZone } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { normalizeUrl } from "@/lib/validation";
import { syncInBackground } from "@/lib/integrations";
import { createIdempotencyKey } from "@/lib/idempotency";
import { uploadAttachment } from "@/lib/storage";

interface Line {
  request_item_id: string;
  name: string;
  unit: string | null;
  pending: number;
  selected: boolean;
  qty: string;
  unitPrice: string;
  productUrl: string;
  folio: string;
  requestId: string;
}

const NewPurchasePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const itemsParam = searchParams.get("items") ?? "";
  const preselectedRequest = searchParams.get("pedido");
  // Memoizado: si se recalcula en cada render, el efecto de abajo se dispara
  // en bucle y la pantalla se cae con "Maximum update depth exceeded".
  const preselectedItems = useMemo(() => itemsParam.split(",").filter(Boolean), [itemsParam]);

  const { data: summary, isLoading, error, refetch } = usePendingPurchaseSummary();
  const [lines, setLines] = useState<Line[]>([]);
  const [channel, setChannel] = useState("proveedor");
  const [vendorName, setVendorName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayInTimeZone());
  const [shippingCost, setShippingCost] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey] = useState(createIdempotencyKey);
  // Solo se inicializa una vez: un refresco de datos no borra lo ya cargado.
  const initializedLines = useRef(false);

  useEffect(() => {
    if (!summary || initializedLines.current) return;
    initializedLines.current = true;
    setLines(
      summary.map((row) => ({
        request_item_id: row.request_item_id,
        name: row.name,
        unit: row.unit,
        pending: Number(row.pending_qty),
        selected:
          preselectedItems.includes(row.request_item_id) ||
          (preselectedRequest ? row.request_id === preselectedRequest : false),
        qty: String(row.pending_qty),
        unitPrice: "",
        productUrl: "",
        folio: row.folio,
        requestId: row.request_id,
      })),
    );
  }, [summary, preselectedItems, preselectedRequest]);

  const selectedLines = lines.filter((line) => line.selected && Number(line.qty) > 0);

  const subtotal = useMemo(
    () =>
      selectedLines.reduce(
        (total, line) => total + Number(line.qty || 0) * Number(line.unitPrice || 0),
        0,
      ),
    [selectedLines],
  );

  const total = subtotal + Number(shippingCost || 0);

  const updateLine = (id: string, patch: Partial<Line>) =>
    setLines((previous) =>
      previous.map((line) => (line.request_item_id === id ? { ...line, ...patch } : line)),
    );

  const handleSubmit = async () => {
    if (saving) return;
    if (selectedLines.length === 0) {
      toast({
        title: "Elegí al menos un artículo",
        description: "Seleccioná los artículos y las cantidades que se compraron.",
        variant: "destructive",
      });
      return;
    }
    const overLimit = selectedLines.find((line) => Number(line.qty) > line.pending);
    if (overLimit) {
      toast({
        title: "Cantidad mayor al saldo aprobado",
        description: `${overLimit.name} tiene ${formatQty(overLimit.pending)} pendientes de compra.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const purchase = await registerPurchase(
        {
          channel,
          vendor_name: vendorName.trim() || null,
          purchase_date: purchaseDate,
          shipping_cost: Number(shippingCost || 0),
          currency: "ARS",
          order_number: orderNumber.trim() || null,
          estimated_delivery_date: estimatedDelivery || null,
          tracking: tracking.trim() || null,
          notes: notes.trim() || null,
          status: "purchased",
          items: selectedLines.map((line) => ({
            request_item_id: line.request_item_id,
            qty: Number(line.qty),
            unit_price: line.unitPrice === "" ? null : Number(line.unitPrice),
            currency: "ARS",
            product_url: normalizeUrl(line.productUrl),
          })),
        },
        idempotencyKey,
      );

      if (invoiceFile) {
        try {
          const path = await uploadAttachment(invoiceFile, `purchases/${purchase.id}`);
          await updatePurchase(purchase.id, { invoice_path: path });
        } catch {
          toast({
            title: "Compra registrada",
            description: "El comprobante no se pudo adjuntar; podés cargarlo desde el detalle.",
          });
        }
      }

      const involvedRequests = [...new Set(selectedLines.map((line) => line.requestId))];
      for (const involved of involvedRequests) {
        syncInBackground(involved, "purchased_pending_receipt");
      }
      toast({
        title: `Compra ${purchase.folio ?? ""} registrada`,
        description:
          "El pedido quedó como “Compra realizada — esperando recepción”. Solo resta confirmar la llegada.",
      });
      // Se va directo al pedido para que la unica accion pendiente sea confirmar la recepcion.
      navigate(
        involvedRequests.length === 1
          ? `/pedidos/${involvedRequests[0]}`
          : `/admin/compras/${purchase.id}`,
      );
    } catch (purchaseError) {
      toast({
        title: "No se pudo registrar la compra",
        description: friendlyError(
          purchaseError,
          "No pudimos registrar la compra. Tus datos siguen en el formulario. Intentá nuevamente o contactá a un administrador.",
        ),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4 pb-24">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/compras">
          <ArrowLeft className="h-4 w-4" />
          Volver a compras
        </Link>
      </Button>

      <PageHeader
        title="Registrar compra"
        description="Podés comprar artículos de distintas solicitudes en una misma compra. Si compraste en dos lugares, registrá dos compras."
      />

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Datos de la compra</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendor">Proveedor o vendedor</Label>
            <Input
              id="vendor"
              value={vendorName}
              onChange={(event) => setVendorName(event.target.value)}
              placeholder="Nombre del proveedor"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase_date">Fecha de compra</Label>
            <Input
              id="purchase_date"
              type="date"
              value={purchaseDate}
              onChange={(event) => setPurchaseDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order_number">Número de orden (opcional)</Label>
            <Input
              id="order_number"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estimated">Fecha estimada de entrega (opcional)</Label>
            <Input
              id="estimated"
              type="date"
              value={estimatedDelivery}
              onChange={(event) => setEstimatedDelivery(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tracking">Seguimiento del envío (opcional)</Label>
            <Input
              id="tracking"
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shipping">Costo de envío (a nivel compra)</Label>
            <Input
              id="shipping"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={shippingCost}
              onChange={(event) => setShippingCost(event.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice">Factura o comprobante (opcional)</Label>
            <Input
              id="invoice"
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Observaciones</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Artículos a comprar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <LoadingState />
          ) : lines.length === 0 ? (
            <EmptyState
              title="No hay artículos aprobados pendientes de compra"
              description="Aprobá artículos en las solicitudes para poder comprarlos."
            />
          ) : (
            lines.map((line) => (
              <div
                key={line.request_item_id}
                className={
                  line.selected
                    ? "rounded-md border border-primary/40 bg-primary/5 p-3"
                    : "rounded-md border border-border p-3"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={line.selected}
                      onChange={(event) => updateLine(line.request_item_id, { selected: event.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{line.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {line.folio} · pendiente de compra {formatQty(line.pending)} {line.unit ?? ""}
                      </span>
                    </span>
                  </label>
                </div>

                {line.selected ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Cantidad</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(event) => updateLine(line.request_item_id, { qty: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Precio unitario</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(event) =>
                          updateLine(line.request_item_id, { unitPrice: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Enlace del producto comprado</Label>
                      <Input
                        value={line.productUrl}
                        onChange={(event) =>
                          updateLine(line.request_item_id, { productUrl: event.target.value })
                        }
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur lg:static lg:rounded-lg lg:border lg:p-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="text-muted-foreground">
              Artículos: {selectedLines.length} · Subtotal {formatCurrency(subtotal)} · Envío{" "}
              {formatCurrency(Number(shippingCost || 0))}
            </p>
            <p className="text-base font-semibold">Total {formatCurrency(total)}</p>
          </div>
          <Button size="lg" onClick={() => void handleSubmit()} disabled={saving || selectedLines.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Registrar compra
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NewPurchasePage;
