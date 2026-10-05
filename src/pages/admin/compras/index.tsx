import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { ToneBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { usePurchases } from "@/hooks/use-purchases";
import { CHANNELS, labelOf } from "@/lib/constants";
import { formatCurrency, formatDate, isOverdue } from "@/lib/format";

const PurchasesPage = () => {
  const { personName } = usePeopleMaps();
  const { data, isLoading, error, refetch } = usePurchases();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compras registradas"
        description="Cada compra puede incluir artículos de varias solicitudes y sectores."
        actions={
          <Button asChild>
            <Link to="/admin/compras/nueva">
              <Plus className="h-4 w-4" />
              Registrar compra
            </Link>
          </Button>
        }
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="Todavía no hay compras registradas"
          description="Cuando registres una compra la vas a ver acá con su comprobante y seguimiento."
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Entrega estimada</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">{purchase.folio}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(purchase.purchase_date)}</TableCell>
                    <TableCell>{labelOf(CHANNELS, purchase.channel)}</TableCell>
                    <TableCell>{purchase.vendor_name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatCurrency(purchase.total, purchase.currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {purchase.estimated_delivery_date ? (
                        <span className={isOverdue(purchase.estimated_delivery_date) ? "text-destructive-soft-foreground" : ""}>
                          {formatDate(purchase.estimated_delivery_date)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{personName(purchase.created_by) ?? "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/admin/compras/${purchase.id}`}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {(data ?? []).map((purchase) => (
              <Link
                key={purchase.id}
                to={`/admin/compras/${purchase.id}`}
                className="block rounded-lg border border-border bg-card p-3 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{purchase.folio}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(purchase.purchase_date)} · {purchase.vendor_name ?? "Sin proveedor"}
                    </p>
                  </div>
                  <span className="text-sm font-medium">
                    {formatCurrency(purchase.total, purchase.currency)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ToneBadge tone="info">{labelOf(CHANNELS, purchase.channel)}</ToneBadge>
                  {purchase.estimated_delivery_date ? (
                    <ToneBadge tone={isOverdue(purchase.estimated_delivery_date) ? "danger" : "neutral"}>
                      Entrega {formatDate(purchase.estimated_delivery_date)}
                    </ToneBadge>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PurchasesPage;
