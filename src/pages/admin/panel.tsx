import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  ClipboardList,
  FileCheck2,
  PackageCheck,
  Plus,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/badges";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/auth-context";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { can } from "@/lib/permissions";
import { formatDate, formatQty } from "@/lib/format";
import { useAdminQueues } from "./use-admin-queues";

const QueueCard = ({
  title,
  value,
  description,
  to,
  icon,
  tone,
}: {
  title: string;
  value: number;
  description: string;
  to: string;
  icon: React.ReactNode;
  tone: "info" | "warning" | "success" | "danger" | "neutral";
}) => {
  const toneClass = {
    info: "bg-info-soft text-info-soft-foreground",
    warning: "bg-warning-soft text-warning-soft-foreground",
    success: "bg-success-soft text-success-soft-foreground",
    danger: "bg-destructive-soft text-destructive-soft-foreground",
    neutral: "bg-muted text-muted-foreground",
  }[tone];

  return (
    <Card className="shadow-card">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
          <span className="text-2xl font-semibold leading-none">{value}</span>
        </div>
        <div className="flex-1">
          <p className="font-medium leading-tight text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" asChild className="w-full">
          <Link to={to}>
            Ver pendientes <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

const AdminPanelPage = () => {
  const { role } = useAuth();
  const { personName } = usePeopleMaps();
  const queues = useAdminQueues();

  if (queues.isLoading) return <LoadingState label="Cargando el panel..." />;
  if (queues.error) return <ErrorState message={queues.error.message} onRetry={queues.refetch} />;

  const pendingQty = queues.pendingSummary.reduce(
    (total, row) => total + Number(row.pending_qty),
    0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Panel de gestión"
        description="Todo lo que necesita atención, ordenado por tipo de pendiente."
        actions={
          <>
            <Button asChild>
              <Link to="/nuevo">
                <Plus className="h-4 w-4" />
                Hacer un pedido
              </Link>
            </Button>
            {can.registerPurchase(role) ? (
              <Button asChild variant="outline">
                <Link to="/admin/compras/nueva">
                  <ShoppingCart className="h-4 w-4" />
                  Registrar compra
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QueueCard
          title="Solicitudes nuevas"
          value={queues.newRequests.length}
          description="Enviadas y pendientes de revisión."
          to="/admin/pedidos?queue=new"
          icon={<BellRing className="h-5 w-5" />}
          tone="info"
        />
        <QueueCard
          title="Solicitudes urgentes"
          value={queues.urgent.length}
          description="Prioridad urgente aún abiertas."
          to="/admin/pedidos?queue=urgent"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="danger"
        />
        <QueueCard
          title="Asignados a mí"
          value={queues.mine.length}
          description="Los que estás gestionando."
          to="/admin/pedidos?queue=mine"
          icon={<ClipboardList className="h-5 w-5" />}
          tone="info"
        />
        <QueueCard
          title="Aprobados pendientes de compra"
          value={queues.approvedPendingPurchase.length}
          description="Listos para comprar."
          to="/admin/pedidos?queue=approved"
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="warning"
        />
        <QueueCard
          title="Compras pendientes de recepción"
          value={queues.pendingReceipt.length}
          description="Compradas y sin recibir."
          to="/admin/pedidos?queue=receipt"
          icon={<PackageCheck className="h-5 w-5" />}
          tone="success"
        />
        <QueueCard
          title="Cambios pendientes de revisión"
          value={queues.pendingChanges.length}
          description="Propuestas sobre artículos aprobados o comprados."
          to="/admin/revision-cambios"
          icon={<FileCheck2 className="h-5 w-5" />}
          tone="warning"
        />
        <QueueCard
          title="Entregas con fecha vencida"
          value={queues.overdueDeliveries.length}
          description="Compras cuya entrega estimada ya pasó."
          to="/admin/compras"
          icon={<Truck className="h-5 w-5" />}
          tone="danger"
        />
        <QueueCard
          title="Artículos pendientes de compra"
          value={queues.pendingSummary.length}
          description={`${formatQty(pendingQty)} unidades aprobadas sin comprar.`}
          to="/admin/pendientes-compra"
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="neutral"
        />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Solicitudes nuevas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {queues.newRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay solicitudes nuevas.</p>
          ) : (
            queues.newRequests.slice(0, 6).map((request) => (
              <Link
                key={request.id}
                to={`/pedidos/${request.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="font-medium">{request.folio}</p>
                  <p className="text-xs text-muted-foreground">
                    {personName(request.requester_id)} · necesaria {formatDate(request.needed_by)}
                  </p>
                </div>
                <StatusBadge status={request.status} />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPanelPage;
