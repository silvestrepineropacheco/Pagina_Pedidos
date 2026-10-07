import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categoryLabel } from "@/lib/constants";
import { formatCurrency, formatDate, formatQty } from "@/lib/format";
import type { EnrichedOrder } from "@/hooks/use-orders-enriched";

interface ReceivedOrdersTableProps {
  orders: EnrichedOrder[];
  personName: (id?: string | null) => string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}

const DataRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-right text-sm">{value}</span>
  </div>
);

export const ReceivedOrdersTable = ({
  orders,
  personName,
  emptyTitle = "Todavía no hay pedidos recibidos",
  emptyDescription = "Cuando confirmes la recepción de un pedido, aparece acá con su historial completo.",
}: ReceivedOrdersTableProps) => {
  if (orders.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card shadow-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Fecha pedido</TableHead>
              <TableHead>Fecha compra</TableHead>
              <TableHead>Fecha recepción</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Artículos</TableHead>
              <TableHead className="text-right">Solicitado</TableHead>
              <TableHead className="text-right">Comprado</TableHead>
              <TableHead className="text-right">Recibido</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.request.id}>
                <TableCell className="font-medium">{order.request.folio ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(order.request.submitted_at ?? order.request.created_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(order.purchaseDate)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(order.receiptDate)}</TableCell>
                <TableCell className="text-sm">{categoryLabel(order.request.category)}</TableCell>
                <TableCell className="text-sm">
                  {personName(order.request.requester_id) ?? "—"}
                </TableCell>
                <TableCell className="max-w-[240px] text-sm">
                  {order.items.map((item) => item.name).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right">{formatQty(order.requestedQty)}</TableCell>
                <TableCell className="text-right">{formatQty(order.purchasedQty)}</TableCell>
                <TableCell className="text-right">{formatQty(order.receivedQty)}</TableCell>
                <TableCell className="text-sm">{order.vendors || "—"}</TableCell>
                <TableCell className="text-right">
                  {order.total > 0 ? formatCurrency(order.total) : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={order.request.status} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/pedidos/${order.request.id}`}>Ver historial</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {orders.map((order) => (
          <Link
            key={order.request.id}
            to={`/pedidos/${order.request.id}`}
            className="block space-y-2 rounded-lg border border-border bg-card p-3 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{order.request.folio ?? "Sin número"}</p>
                <p className="text-xs text-muted-foreground">
                  {categoryLabel(order.request.category)} ·{" "}
                  {personName(order.request.requester_id) ?? "Sin solicitante"}
                </p>
              </div>
              <StatusBadge status={order.request.status} />
            </div>
            <DataRow
              label="Fecha pedido"
              value={formatDate(order.request.submitted_at ?? order.request.created_at)}
            />
            <DataRow label="Fecha compra" value={formatDate(order.purchaseDate)} />
            <DataRow label="Fecha recepción" value={formatDate(order.receiptDate)} />
            <DataRow
              label="Artículos"
              value={order.items.map((item) => item.name).join(", ") || "—"}
            />
            <DataRow label="Solicitado" value={formatQty(order.requestedQty)} />
            <DataRow label="Comprado" value={formatQty(order.purchasedQty)} />
            <DataRow label="Recibido" value={formatQty(order.receivedQty)} />
            <DataRow label="Proveedor" value={order.vendors || "—"} />
            <DataRow
              label="Total"
              value={order.total > 0 ? formatCurrency(order.total) : "—"}
            />
          </Link>
        ))}
      </div>
    </>
  );
};
