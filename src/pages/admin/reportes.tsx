import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAllRequestItems } from "@/lib/api";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { useRequests } from "@/hooks/use-requests";
import { usePurchases } from "@/hooks/use-purchases";
import { REQUEST_STATUS } from "@/lib/constants";
import { daysSince, formatCurrency, formatQty } from "@/lib/format";

const ReportsPage = () => {
  const { sectorName } = usePeopleMaps();
  const { data: requests, isLoading, error, refetch } = useRequests({ limit: 1000 });
  const { data: items } = useQuery({ queryKey: ["all-items"], queryFn: fetchAllRequestItems });
  const { data: purchases } = usePurchases();

  const bySector = useMemo(() => {
    const map = new Map<string, { name: string; count: number; approved: number; amount: number }>();
    for (const request of requests ?? []) {
      const key = request.sector_id;
      const current = map.get(key) ?? {
        name: sectorName(key) ?? "Sin sector",
        count: 0,
        approved: 0,
        amount: 0,
      };
      current.count += 1;
      map.set(key, current);
    }
    for (const item of items ?? []) {
      const request = (requests ?? []).find((entry) => entry.id === item.request_id);
      if (!request) continue;
      const current = map.get(request.sector_id);
      if (!current) continue;
      if (item.item_status !== "rejected" && item.item_status !== "cancelled") {
        current.approved += Number(item.approved_qty);
        current.amount += Number(item.approved_qty) * Number(item.unit_price_estimate ?? 0);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [requests, items, sectorName]);

  const byStatus = useMemo(() => {
    const map = new Map<string, { label: string; count: number; totalDays: number; aged: number }>();
    for (const request of requests ?? []) {
      const current = map.get(request.status) ?? {
        label: REQUEST_STATUS[request.status]?.label ?? request.status,
        count: 0,
        totalDays: 0,
        aged: 0,
      };
      current.count += 1;
      const days = daysSince(request.submitted_at ?? request.created_at) ?? 0;
      current.totalDays += days;
      current.aged = Math.round(current.totalDays / current.count);
      map.set(request.status, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [requests]);

  const byPeriod = useMemo(() => {
    const map = new Map<string, { month: string; count: number; total: number }>();
    for (const purchase of purchases ?? []) {
      const month = (purchase.purchase_date ?? "").slice(0, 10);
      const key = month ? month.slice(0, 7) : "sin-fecha";
      const current = map.get(key) ?? { month: key, count: 0, total: 0 };
      current.count += 1;
      current.total += Number(purchase.total ?? 0);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [purchases]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; unit: string | null; total: number; count: number }>();
    for (const item of items ?? []) {
      const key = item.catalog_item_id ?? `libre:${item.name}`;
      const current = map.get(key) ?? { name: item.name, unit: item.unit, total: 0, count: 0 };
      current.total += Number(item.requested_qty);
      current.count += 1;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 15);
  }, [items]);

  if (isLoading) return <LoadingState label="Calculando reportes..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes"
        description="Historial y números de la operación. Los datos respetan los permisos de cada cuenta."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Pedidos por sector</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Cantidad aprobada</TableHead>
                  <TableHead className="text-right">Estimado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySector.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{formatQty(row.approved)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Pedidos por estado y antigüedad</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Antigüedad promedio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byStatus.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{row.aged} días</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Gasto por período (compras)</CardTitle>
          </CardHeader>
          <CardContent>
            {byPeriod.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay compras registradas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPeriod.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Productos más pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Veces pedido</TableHead>
                  <TableHead className="text-right">Cantidad total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">
                      {formatQty(row.total)} {row.unit ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ReportsPage;
