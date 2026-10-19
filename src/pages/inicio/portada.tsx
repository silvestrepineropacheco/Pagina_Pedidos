import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Loader2, Minus, ShoppingCart, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/auth-context";
import { can } from "@/lib/permissions";
import {
  calcularReporteSemanal,
  formatoEntero,
  formatoPesos,
  formatoVariacion,
  semanasPorDefecto,
} from "@/lib/reporte-semanal";
import { leerPlanillaDePedidos } from "@/lib/ventas-planilla";
import { useAdminQueues } from "@/pages/admin/use-admin-queues";

const Dato = ({ valor, nombre }: { valor: string; nombre: string }) => (
  <div className="rounded-md bg-muted/60 p-3">
    <p className="text-xl font-semibold tracking-tight text-foreground">{valor}</p>
    <p className="text-xs text-muted-foreground">{nombre}</p>
  </div>
);

const Area = ({
  titulo,
  descripcion,
  icono,
  children,
  destino,
  textoBoton,
}: {
  titulo: string;
  descripcion: string;
  icono: React.ReactNode;
  children: React.ReactNode;
  destino: string;
  textoBoton: string;
}) => (
  <Card className="flex flex-col shadow-card">
    <CardHeader className="pb-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          {icono}
        </div>
        <div className="min-w-0">
          <CardTitle className="text-lg">{titulo}</CardTitle>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
      </div>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col justify-between gap-4">
      <div className="space-y-3">{children}</div>
      <Button asChild className="w-full sm:w-auto sm:self-start">
        <Link to={destino}>
          {textoBoton}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </CardContent>
  </Card>
);

const ResumenCompras = () => {
  const colas = useAdminQueues();
  if (colas.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando pendientes...
      </p>
    );
  }
  if (colas.error) return <p className="text-sm text-muted-foreground">No se pudieron cargar los pendientes.</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Dato valor={formatoEntero(colas.newRequests.length)} nombre="Solicitudes nuevas para revisar" />
      <Dato valor={formatoEntero(colas.urgent.length)} nombre="Solicitudes urgentes abiertas" />
      <Dato valor={formatoEntero(colas.approvedPendingPurchase.length)} nombre="Aprobados pendientes de compra" />
      <Dato valor={formatoEntero(colas.pendingReceipt.length)} nombre="Compras pendientes de recepción" />
    </div>
  );
};

const ResumenVentas = () => {
  const semanas = useMemo(() => semanasPorDefecto(), []);
  const { data, isLoading, error } = useQuery({
    queryKey: ["planilla-de-pedidos"],
    queryFn: () => leerPlanillaDePedidos(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo la planilla de pedidos...
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        No se pudo leer la planilla de pedidos. Entrá al reporte para configurarla o ver el detalle.
      </p>
    );
  }

  const reporte = calcularReporteSemanal(data.lineas, { semanaA: semanas.a, semanaB: semanas.b, casosParaRevisar: data.revisar });
  const total = reporte.indicadores.totalFacturado;
  const Icono = total.variacionPct === null || total.variacionPct === 0 ? Minus : total.variacionPct > 0 ? ArrowUpRight : ArrowDownRight;
  const tono =
    total.variacionPct === null || total.variacionPct === 0
      ? "text-muted-foreground"
      : total.variacionPct > 0
        ? "text-success"
        : "text-destructive";

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">Venta de la semana {semanas.b}, sin IVA</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{formatoPesos(total.b)}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Icono className={`h-4 w-4 ${tono}`} aria-hidden />
            {total.variacionPct === null ? "Sin comparación" : formatoVariacion(total.variacionPct)}
          </span>
          contra la semana {semanas.a} ({formatoPesos(total.a)})
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Dato valor={formatoEntero(reporte.indicadores.pedidos.b)} nombre="Pedidos de la semana" />
        <Dato valor={formatoEntero(reporte.indicadores.clientes.b)} nombre="Clientes que compraron" />
      </div>
    </>
  );
};

/** Portada para Propietario y administradores: un acceso a cada área de la app. */
const PortadaPage = () => {
  const { profile, role } = useAuth();
  const verVentas = can.isOwner(role);

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-primary p-5 text-primary-foreground shadow-card">
        <p className="text-sm text-primary-foreground/80">Manila Patagonia</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          Hola{profile?.full_name ? `, ${profile.full_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-primary-foreground/80">Elegí con qué querés trabajar.</p>
      </div>

      <div className={`grid gap-4 ${verVentas ? "lg:grid-cols-2" : ""}`}>
        <Area
          titulo="Pedidos y Compras"
          descripcion="Solicitudes internas de insumos, indumentaria y maquinaria."
          icono={<ShoppingCart className="h-5 w-5" />}
          destino="/admin"
          textoBoton="Ir al panel de gestión"
        >
          <ResumenCompras />
        </Area>

        {verVentas ? (
          <Area
            titulo="Ventas"
            descripcion="Reporte semanal de los pedidos de clientes."
            icono={<TrendingUp className="h-5 w-5" />}
            destino="/admin/reportes-ventas"
            textoBoton="Ver el reporte de ventas"
          >
            <ResumenVentas />
          </Area>
        ) : null}
      </div>
    </div>
  );
};

export default PortadaPage;
