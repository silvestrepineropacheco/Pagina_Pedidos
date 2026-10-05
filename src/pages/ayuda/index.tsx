import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardList,
  FolderTree,
  HelpCircle,
  PackageCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  UserCog,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/auth-context";
import { REQUEST_STATUS } from "@/lib/constants";
import { can, roleLabel } from "@/lib/permissions";
import type { RequestStatus } from "@/lib/types";

const StepList = ({ steps }: { steps: React.ReactNode[] }) => (
  <ol className="space-y-3">
    {steps.map((step, index) => (
      <li key={index} className="flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 text-sm text-foreground">{step}</span>
      </li>
    ))}
  </ol>
);

const Bullets = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="space-y-2">
    {items.map((item, index) => (
      <li key={index} className="flex gap-2 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span className="min-w-0 flex-1">{item}</span>
      </li>
    ))}
  </ul>
);

const HelpPage = () => {
  const { role } = useAuth();
  const isRequester = role === "encargado";
  const isAdmin = can.isAdmin(role);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cómo funciona Manila"
        description="Guía rápida de la aplicación y paso a paso para cargar un pedido."
      />

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Qué hace la aplicación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Centraliza los pedidos de <strong>insumos</strong>, <strong>indumentaria y equipamiento</strong> y{" "}
            <strong>maquinaria o mejoras</strong> de cada sector. Cada encargado carga lo que necesita y
            los administradores revisan, aprueban, compran y registran la recepción.
          </p>
          <p className="text-muted-foreground">
            La compra se hace <strong>fuera</strong> de la aplicación (a un proveedor o en Mercado Libre).
            Acá se organiza la solicitud, quién la gestiona y qué se recibió.
          </p>
          <Separator />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="flex items-center gap-2 font-medium">
                <ClipboardList className="h-4 w-4 text-primary" />
                Encargado de sector
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Carga pedidos de su sector, sigue el estado, responde consultas y confirma lo que
                recibe.
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="flex items-center gap-2 font-medium">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Administrador
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ve todos los pedidos, aprueba artículo por artículo, asigna responsables, registra
                compras y recepciones.
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="flex items-center gap-2 font-medium">
                <UserCog className="h-4 w-4 text-primary" />
                Propietario
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Todo lo del administrador y además autoriza usuarios y asigna rol y sector.
              </p>
            </div>
          </div>
          <p className="rounded-md bg-info-soft p-3 text-xs text-info-soft-foreground">
            Tu rol actual: <strong>{roleLabel(role)}</strong>
            {isRequester
              ? " — seguí el paso a paso de abajo para cargar tu primer pedido."
              : isAdmin
                ? " — mirá el paso a paso del panel de administración."
                : " — tu cuenta todavía no tiene permisos asignados."}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Paso a paso para subir un pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <StepList
            steps={[
              <>
                Entrá con tu <strong>correo y contraseña</strong>. Si es tu primera vez, el
                Propietario tiene que autorizarte y asignarte tu sector.
              </>,
              <>
                En el inicio tocá el botón verde <strong>“Nuevo pedido”</strong>.
              </>,
              <>
                Elegí la <strong>categoría</strong>: Insumos de producción, Indumentaria y
                equipamiento de trabajo, o Maquinaria y mejoras. El formulario cambia según lo que
                elijas.
              </>,
              <>
                Completá los datos generales: <strong>fecha para la que lo necesitás</strong>,{" "}
                <strong>prioridad</strong> y observaciones. Si marcás <strong>Urgente</strong>, el
                motivo es obligatorio.
              </>,
              <>
                Cargá los artículos. Podés elegir un producto del catálogo o{" "}
                <strong>“Otro artículo”</strong>. Para cada uno: cantidad, unidad, especificaciones
                (medida, talle, material, modelo), contenido por presentación (por ejemplo “caja de
                100 guantes”), stock disponible hoy (opcional, es solo una referencia), enlace del
                producto sugerido (opcional), foto y observaciones.
                <span className="mt-1 block text-muted-foreground">
                  Con <strong>“Agregar otro artículo”</strong> sumás todos los que necesites en el
                  mismo pedido.
                </span>
              </>,
              <>
                Guardá con <strong>“Guardar borrador”</strong> si querés terminarlo después (no avisa
                a nadie), o tocá <strong>“Revisar y enviar”</strong>, revisá el resumen y confirmá. Al
                enviar, los administradores reciben el aviso y el pedido queda{" "}
                <strong>Pendiente de revisión</strong>.
              </>,
              <>
                Seguí el pedido en <strong>“Pedidos de mi sector”</strong>: ahí ves el estado de cada
                artículo, qué se aprobó, qué se compró, qué se recibió y el saldo pendiente.
              </>,
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/nuevo">
                Empezar un pedido <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/pedidos">Ver pedidos de mi sector</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Después de enviar el pedido</CardTitle>
        </CardHeader>
        <CardContent>
          <Bullets
            items={[
              <>
                Si necesitan más información, te llega una <strong>notificación</strong> y podés
                responder en los comentarios del pedido.
              </>,
              <>
                Cuando se aprueban o rechazan artículos también te avisa: una solicitud puede tener
                unos aprobados y otros rechazados, y el rechazo siempre trae un motivo.
              </>,
              <>
                ¿Necesitás cambiar algo que <strong>ya está aprobado o comprado</strong>? Usá{" "}
                <strong>“Solicitar cambio”</strong> en ese artículo: queda registrado para revisión y
                no se toca lo que ya se compró.
              </>,
              <>
                Cuando llegue la mercadería, tocá <strong>“Registrar recepción”</strong> y cargá las
                cantidades <strong>aceptadas, incorrectas, dañadas y faltantes</strong>. Solo lo
                aceptado descuenta el saldo pendiente.
              </>,
              <>
                Para volver a pedir algo parecido, usá <strong>“Repetir pedido”</strong>: crea un
                borrador nuevo con los artículos anteriores para que revises cantidades y fechas.
                Nunca se envía solo.
              </>,
            ]}
          />
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Paso a paso del panel de administración
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StepList
              steps={[
                <>
                  <strong>“Panel de gestión”</strong> agrupa todo lo que necesita atención:
                  solicitudes nuevas, urgentes, sin responsable, asignadas a mí, aprobadas pendientes
                  de compra, compras pendientes de recepción, entregas vencidas y cambios a revisar.
                </>,
                <>
                  Abrí un pedido y tocá <strong>“Asignarme pedido”</strong> para quedar como
                  responsable. Si otro administrador se adelantó, la aplicación te avisa.
                </>,
                <>
                  Aprobá o rechazá <strong>cada artículo</strong> por separado. Podés aprobar una
                  cantidad distinta a la solicitada (quedan las dos para comparar) y el motivo es
                  obligatorio al rechazar, cancelar o cambiar una cantidad.
                </>,
                <>
                  En <strong>“Compras pendientes”</strong> ves lo aprobado y todavía sin comprar,
                  agrupado por producto idéntico. Desde ahí o desde el pedido, usá{" "}
                  <strong>“Registrar compra”</strong>: canal, proveedor, cantidades, precio unitario,
                  costo de envío a nivel compra, enlace comprado y comprobante. Podés reunir
                  artículos de varias solicitudes y sectores en una misma compra, y registrar compras
                  parciales.
                </>,
                <>
                  Cuando llegue la mercadería, registrá la <strong>recepción</strong> desde el pedido.
                  Si una parte llega dañada, se registra como problema y no cierra el pedido.
                </>,
                <>
                  Si queda un saldo que no se va a recibir, usá <strong>“Cerrar saldo”</strong> con
                  motivo: recién ahí el pedido se marca como completado.
                </>,
                <>
                  El <strong>catálogo</strong> y los <strong>sectores</strong> se mantienen desde el
                  menú; desactivar no borra el historial. Los <strong>reportes</strong> muestran
                  pedidos por sector, por estado y antigüedad, gasto por período y productos más
                  pedidos.
                </>,
              ]}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4" />
            Qué significa cada estado
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto px-6 pb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Qué significa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    ["draft", "Lo estás armando. Todavía no lo ve nadie y podés editarlo."],
                    ["pending_review", "Ya lo enviaste y espera la revisión de un administrador."],
                    ["needs_info", "Un administrador te pidió más información."],
                    ["evaluating", "Se está evaluando, sobre todo en maquinaria o mejoras."],
                    ["approved_pending_purchase", "Se aprobó y falta comprarlo."],
                    ["purchasing", "Hay una compra en curso."],
                    ["purchased_pending_receipt", "Ya se compró y espera la entrega."],
                    ["partially_received", "Llegó una parte; queda saldo pendiente."],
                    ["completed", "Se recibió todo lo aprobado, o un administrador cerró el saldo."],
                    ["rejected", "Se rechazó la solicitud o todos sus artículos."],
                    ["cancelled", "Se canceló."],
                  ] as [RequestStatus, string][]
                ).map(([status, meaning]) => (
                  <TableRow key={status}>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{meaning}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-4 w-4" />
            Aclaraciones útiles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Bullets
            items={[
              <>
                Las fechas se muestran como <strong>DD/MM/AAAA</strong> en horario de Argentina, y los
                montos en <strong>pesos</strong>.
              </>,
              <>
                El <strong>stock que informás</strong> es una foto del momento en que pedís, no un
                inventario automático.
              </>,
              <>
                El <strong>enlace sugerido</strong> lo carga el encargado; el{" "}
                <strong>enlace de la compra</strong> lo carga el administrador cuando efectivamente
                compra. No se exige ninguna URL para enviar el pedido.
              </>,
              <>
                La aplicación <strong>no compra ni paga</strong>: organiza la solicitud y deja el
                registro de todo.
              </>,
              <>
                El <strong>historial</strong> de cada pedido guarda quién hizo cada cosa y cuándo, y
                no se puede borrar desde la aplicación.
              </>,
              <>
                Las notificaciones dentro de la aplicación siempre funcionan. Los{" "}
                <strong>avisos por correo</strong> pueden figurar como “Pendiente de configuración”
                si el servicio de correo todavía no está cargado; en ese caso el pedido se guarda
                igual y el envío se puede reintentar.
              </>,
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5 shadow-card">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">Atajos</p>
              <p className="text-sm text-muted-foreground">
                Los accesos que más vas a usar, siempre en el menú.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isRequester ? (
              <Button asChild>
                <Link to="/nuevo">
                  <Wrench className="h-4 w-4" />
                  Nuevo pedido
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/pedidos">
                <ClipboardList className="h-4 w-4" />
                Pedidos
              </Link>
            </Button>
            {isAdmin ? (
              <Button variant="outline" asChild>
                <Link to="/admin/pendientes-compra">
                  <ShoppingCart className="h-4 w-4" />
                  Compras pendientes
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/notificaciones">
                <Truck className="h-4 w-4" />
                Notificaciones
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <PackageCheck className="h-3.5 w-3.5" />
        Si algo no coincide con lo que ves en pantalla, avisale al administrador para actualizar esta
        guía.
      </p>
    </div>
  );
};

export default HelpPage;
