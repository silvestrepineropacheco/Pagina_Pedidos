import { useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  calcularReporteSemanal,
  formatoEntero,
  formatoKg,
  formatoPct,
  formatoPesos,
  formatoVariacion,
  semanasPorDefecto,
} from "@/lib/reporte-semanal";
import type { Comparacion, LecturaPedidos } from "@/lib/reporte-semanal";
import { ErrorDePlanilla, leerPlanillaDePedidos } from "@/lib/ventas-planilla";

const semanaValida = (valor: string): number | null => {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero >= 1 && numero <= 53 ? numero : null;
};

const FilaIndicador = ({
  nombre,
  dato,
  formato,
}: {
  nombre: string;
  dato: Comparacion;
  formato: (valor: number) => string;
}) => (
  <TableRow>
    <TableCell>{nombre}</TableCell>
    <TableCell className="text-right">{formato(dato.a)}</TableCell>
    <TableCell className="text-right">{formato(dato.b)}</TableCell>
    <TableCell className="text-right">{formatoVariacion(dato.variacionPct)}</TableCell>
  </TableRow>
);

const SalesReportsPage = () => {
  const porDefecto = useMemo(() => semanasPorDefecto(), []);
  const [enlace, setEnlace] = useState("");
  const [semanaA, setSemanaA] = useState(String(porDefecto.a));
  const [semanaB, setSemanaB] = useState(String(porDefecto.b));
  const [lectura, setLectura] = useState<LecturaPedidos | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pedirEnlace, setPedirEnlace] = useState(false);

  const leer = async () => {
    setLeyendo(true);
    setError(null);
    try {
      setLectura(await leerPlanillaDePedidos(enlace));
      setPedirEnlace(false);
    } catch (fallo) {
      setLectura(null);
      setPedirEnlace(fallo instanceof ErrorDePlanilla && fallo.faltaConfigurar);
      setError(fallo instanceof Error ? fallo.message : "No se pudo leer la planilla de pedidos.");
    } finally {
      setLeyendo(false);
    }
  };

  const a = semanaValida(semanaA);
  const b = semanaValida(semanaB);
  const reporte = useMemo(
    () => (lectura && a && b ? calcularReporteSemanal(lectura.lineas, { semanaA: a, semanaB: b }) : null),
    [lectura, a, b],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes de ventas"
        description="Lee la hoja PEDIDOS de la planilla de Google Sheets y compara dos semanas de despacho."
      />

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Planilla de pedidos</CardTitle>
          <CardDescription>
            Solo lectura: la app nunca modifica la planilla. El enlace se pega una sola vez y queda guardado;
            dejalo vacío para usar la planilla ya configurada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="enlace-planilla">Enlace de la planilla de Google Sheets</Label>
            <Input
              id="enlace-planilla"
              value={enlace}
              onChange={(evento) => setEnlace(evento.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            {pedirEnlace ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay una planilla configurada: pegá el enlace y volvé a leer.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="semana-a">Semana anterior (A)</Label>
              <Input
                id="semana-a"
                type="number"
                min={1}
                max={53}
                className="w-28"
                value={semanaA}
                onChange={(evento) => setSemanaA(evento.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semana-b">Semana a informar (B)</Label>
              <Input
                id="semana-b"
                type="number"
                min={1}
                max={53}
                className="w-28"
                value={semanaB}
                onChange={(evento) => setSemanaB(evento.target.value)}
              />
            </div>
            <Button onClick={() => void leer()} disabled={leyendo}>
              {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {lectura ? "Volver a leer la planilla" : "Leer la planilla"}
            </Button>
          </div>
          {lectura ? (
            <p className="text-sm text-muted-foreground">
              Se leyeron {formatoEntero(lectura.lineas.length)} renglones válidos. Se dejaron afuera{" "}
              {formatoEntero(lectura.descartadas.canceladas)} cancelados y{" "}
              {formatoEntero(lectura.descartadas.sinNroPedido)} sin número de pedido.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? <ErrorState message={error} onRetry={() => void leer()} /> : null}

      {lectura && !reporte ? (
        <ErrorState message="Elegí dos semanas entre 1 y 53 para calcular el reporte." />
      ) : null}

      {reporte ? (
        <>
          {reporte.avisos.length > 0 || reporte.categorias.productosEnOtros.length > 0 ? (
            <Card className="border-warning/30 bg-warning-soft">
              <CardContent className="space-y-1 p-4 text-sm text-warning-soft-foreground">
                {reporte.avisos.map((aviso) => (
                  <p key={aviso} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {aviso}
                  </p>
                ))}
                {reporte.categorias.productosEnOtros.length > 0 ? (
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Productos sin categoría (van a "Otros"): {reporte.categorias.productosEnOtros.join(", ")}.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">
                  Indicadores — semana {reporte.semanas.a} contra {reporte.semanas.b}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indicador</TableHead>
                      <TableHead className="text-right">Semana {reporte.semanas.a}</TableHead>
                      <TableHead className="text-right">Semana {reporte.semanas.b}</TableHead>
                      <TableHead className="text-right">Variación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <FilaIndicador
                      nombre="Total facturado s/IVA"
                      dato={reporte.indicadores.totalFacturado}
                      formato={formatoPesos}
                    />
                    <FilaIndicador nombre="Kilos" dato={reporte.indicadores.kg} formato={formatoKg} />
                    <FilaIndicador nombre="Pedidos" dato={reporte.indicadores.pedidos} formato={formatoEntero} />
                    <FilaIndicador
                      nombre="Clientes distintos"
                      dato={reporte.indicadores.clientes}
                      formato={formatoEntero}
                    />
                    <FilaIndicador
                      nombre="Ticket promedio"
                      dato={reporte.indicadores.ticketPromedio}
                      formato={formatoPesos}
                    />
                    <FilaIndicador
                      nombre="Precio promedio por kg"
                      dato={reporte.indicadores.precioPromedioKg}
                      formato={formatoPesos}
                    />
                    <FilaIndicador
                      nombre={`Recurrentes (${reporte.recurrentesVsOcasionales.recurrentes.clientes.length} clientes)`}
                      dato={reporte.recurrentesVsOcasionales.recurrentes}
                      formato={formatoPesos}
                    />
                    <FilaIndicador
                      nombre={`Ocasionales (${reporte.recurrentesVsOcasionales.ocasionales.clientesA.length} y ${reporte.recurrentesVsOcasionales.ocasionales.clientesB.length} clientes)`}
                      dato={reporte.recurrentesVsOcasionales.ocasionales}
                      formato={formatoPesos}
                    />
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">Origen y cliente principal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origen</TableHead>
                      <TableHead className="text-right">Semana {reporte.semanas.a}</TableHead>
                      <TableHead className="text-right">Semana {reporte.semanas.b}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporte.origen.map((fila) => (
                      <TableRow key={fila.origen}>
                        <TableCell>{fila.origen}</TableCell>
                        <TableCell className="text-right">{formatoPct(fila.a.pct)}</TableCell>
                        <TableCell className="text-right">{formatoPct(fila.b.pct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Semana</TableHead>
                      <TableHead>Cliente principal</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(
                      [
                        [reporte.semanas.a, reporte.clientes.topA[0]],
                        [reporte.semanas.b, reporte.clientes.topB[0]],
                      ] as const
                    ).map(([semana, cliente]) => (
                      <TableRow key={semana}>
                        <TableCell>{semana}</TableCell>
                        <TableCell>{cliente?.cliente ?? "—"}</TableCell>
                        <TableCell className="text-right">{cliente ? formatoPesos(cliente.total) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default SalesReportsPage;
