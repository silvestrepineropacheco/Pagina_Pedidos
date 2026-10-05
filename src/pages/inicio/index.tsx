import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, ClipboardList, PackageCheck, Plus, Timer, Truck } from "lucide-react";
import { RequestList } from "@/components/requests/request-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/auth-context";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { useRequests } from "@/hooks/use-requests";
import { LoadingState } from "@/components/feedback";

const STATUS_GROUPS = {
  pendientes: ["draft", "pending_review", "needs_info"],
  enGestion: ["evaluating", "approved_pending_purchase", "purchasing"],
  porRecibir: ["purchased_pending_receipt", "partially_received"],
};

const CountCard = ({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "info" | "warning" | "success";
}) => {
  const toneClass = {
    info: "bg-info-soft text-info-soft-foreground",
    warning: "bg-warning-soft text-warning-soft-foreground",
    success: "bg-success-soft text-success-soft-foreground",
  }[tone];

  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const HomePage = () => {
  const { profile } = useAuth();
  const { personName } = usePeopleMaps();
  const { data: requests, isLoading } = useRequests({ limit: 200 });
  const list = requests ?? [];

  const countBy = (statuses: string[]) =>
    list.filter((request) => statuses.includes(request.status)).length;

  const recent = list.slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-primary p-5 text-primary-foreground shadow-card">
        <p className="text-sm text-primary-foreground/80">Pedidos y compras</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          {profile?.full_name ?? "Encargado"}
        </h1>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Cargá tus solicitudes y seguí el estado de cada pedido.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="xl" variant="success" asChild>
            <Link to="/nuevo">
              <Plus className="h-5 w-5" />
              Nuevo pedido
            </Link>
          </Button>
          <Button size="xl" variant="secondary" asChild>
            <Link to="/pedidos">
              <ClipboardList className="h-5 w-5" />
              Ver pedidos
            </Link>
          </Button>
          <Button size="xl" variant="heroGhost" asChild>
            <Link to="/ayuda">
              <BookOpen className="h-5 w-5" />
              ¿Cómo funciona?
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CountCard
          label="Pendientes de revisión"
          value={countBy(STATUS_GROUPS.pendientes)}
          icon={<Timer className="h-5 w-5" />}
          tone="warning"
        />
        <CountCard
          label="En gestión"
          value={countBy(STATUS_GROUPS.enGestion)}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="info"
        />
        <CountCard
          label="Pendientes de recepción"
          value={countBy(STATUS_GROUPS.porRecibir)}
          icon={<PackageCheck className="h-5 w-5" />}
          tone="success"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Últimos pedidos</h2>
          <Link
            to="/pedidos"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todos <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {isLoading ? (
          <LoadingState />
        ) : (
          <RequestList
            requests={recent}
            personName={personName}
            emptyTitle="Todavía no hay pedidos"
            emptyDescription="Cuando cargues el primer pedido lo vas a ver acá."
          />
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md bg-info-soft p-3 text-xs text-info-soft-foreground">
        <Truck className="mt-0.5 h-4 w-4 shrink-0" />
        El stock que informás al pedir es una referencia del momento, no un inventario automático.
      </div>
    </div>
  );
};

export default HomePage;
