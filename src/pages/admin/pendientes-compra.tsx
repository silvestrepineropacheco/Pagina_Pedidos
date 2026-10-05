import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layers, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePendingPurchaseSummary } from "@/hooks/use-requests";
import { formatQty } from "@/lib/format";
import type { PendingPurchaseRow } from "@/lib/types";

interface Group {
  key: string;
  name: string;
  variant: string | null;
  unit: string | null;
  presentation: string | null;
  isConfirmed: boolean;
  total: number;
  rows: PendingPurchaseRow[];
}

const PurchasePendingPage = () => {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = usePendingPurchaseSummary();
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const row of data ?? []) {
      const existing = map.get(row.group_key);
      if (existing) {
        existing.total += Number(row.pending_qty);
        existing.rows.push(row);
      } else {
        map.set(row.group_key, {
          key: row.group_key,
          name: row.name,
          variant: row.variant,
          unit: row.unit,
          presentation: row.presentation,
          // Solo se agrupan productos del catalogo con identidad confirmada.
          isConfirmed: Boolean(row.catalog_item_id),
          total: Number(row.pending_qty),
          rows: [row],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = groups.filter((group) =>
    search.trim() ? group.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  const totalPending = groups.reduce((total, group) => total + group.total, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compras pendientes"
        description="Cantidades aprobadas que todavía no se compraron. Se agrupan solo productos idénticos."
        actions={
          <Button
            onClick={() =>
              navigate(
                `/admin/compras/nueva?items=${filtered.flatMap((group) => group.rows.map((row) => row.request_item_id)).join(",")}`,
              )
            }
            disabled={filtered.length === 0}
          >
            <ShoppingCart className="h-4 w-4" />
            Registrar compra
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar producto"
          className="sm:max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {groups.length} productos · {formatQty(totalPending)} unidades pendientes
        </p>
      </div>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No hay compras pendientes"
          description="Cuando se aprueben artículos van a aparecer acá para comprar."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => (
            <Card key={group.key} className="shadow-card">
              <CardHeader className="space-y-1 pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{group.name}</CardTitle>
                  <span className="text-sm font-semibold">
                    {formatQty(group.total)} {group.unit ?? ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[group.variant, group.presentation].filter(Boolean).join(" · ") || "Sin variante"}
                  {group.isConfirmed ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-success-soft-foreground">
                      <Layers className="h-3.5 w-3.5" /> Producto del catálogo: agrupado
                    </span>
                  ) : (
                    <span className="ml-2 text-warning-soft-foreground">
                      Texto libre sin equivalencia confirmada: no se agrupa con otros
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.rows.map((row) => (
                  <div
                    key={row.request_item_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{row.sector_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.folio} · aprobado {formatQty(row.approved_qty)} · ya comprado{" "}
                        {formatQty(row.purchased_qty)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {formatQty(row.pending_qty)} {row.unit ?? ""}
                      </span>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/pedidos/${row.request_id}`}>Ver pedido</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PurchasePendingPage;
