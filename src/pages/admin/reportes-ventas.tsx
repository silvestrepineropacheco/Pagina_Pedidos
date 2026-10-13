import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/feedback";
import { InformeVentas } from "@/components/reporte-ventas/informe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcularReporteSemanal, formatoEntero, semanasPorDefecto } from "@/lib/reporte-semanal";
import type { LecturaPedidos } from "@/lib/reporte-semanal";
import { ErrorDePlanilla, leerPlanillaDePedidos } from "@/lib/ventas-planilla";

const semanaValida = (valor: string): number | null => {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero >= 1 && numero <= 53 ? numero : null;
};

const SalesReportsPage = () => {
  const porDefecto = useMemo(() => semanasPorDefecto(), []);
  const [enlace, setEnlace] = useState("");
  const [semanaA, setSemanaA] = useState(String(porDefecto.a));
  const [semanaB, setSemanaB] = useState(String(porDefecto.b));
  const [lectura, setLectura] = useState<LecturaPedidos | null>(null);
  const [leidoEl, setLeidoEl] = useState<Date | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pedirEnlace, setPedirEnlace] = useState(false);

  const leer = useCallback(async (enlaceNuevo?: string) => {
    setLeyendo(true);
    setError(null);
    try {
      setLectura(await leerPlanillaDePedidos(enlaceNuevo));
      setLeidoEl(new Date());
      setPedirEnlace(false);
    } catch (fallo) {
      setLectura(null);
      const faltaConfigurar = fallo instanceof ErrorDePlanilla && fallo.faltaConfigurar;
      setPedirEnlace(faltaConfigurar);
      // Sin planilla configurada no es un error: solo hay que pegar el enlace.
      setError(
        faltaConfigurar ? null : fallo instanceof Error ? fallo.message : "No se pudo leer la planilla de pedidos.",
      );
    } finally {
      setLeyendo(false);
    }
  }, []);

  // Al entrar se lee la planilla ya configurada, sin tener que tocar nada.
  useEffect(() => {
    void leer();
  }, [leer]);

  const a = semanaValida(semanaA);
  const b = semanaValida(semanaB);
  const reporte = useMemo(
    () => (lectura && a && b ? calcularReporteSemanal(lectura.lineas, { semanaA: a, semanaB: b }) : null),
    [lectura, a, b],
  );

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          title="Reportes de ventas"
          description="Lee la hoja PEDIDOS de la planilla de Google Sheets y compara dos semanas de despacho."
          actions={
            reporte ? (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Imprimir o guardar PDF
              </Button>
            ) : null
          }
        />
      </div>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="text-base">Planilla y semanas</CardTitle>
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
                Todavía no hay una planilla configurada: pegá el enlace y tocá "Leer la planilla".
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
            <Button onClick={() => void leer(enlace)} disabled={leyendo}>
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

      {error ? (
        <div className="print:hidden">
          <ErrorState message={error} onRetry={() => void leer(enlace)} />
        </div>
      ) : null}

      {lectura && !reporte ? (
        <ErrorState message="Elegí dos semanas entre 1 y 53 para calcular el reporte." />
      ) : null}

      {reporte ? (
        <>
          {reporte.avisos.length > 0 || reporte.categorias.productosEnOtros.length > 0 ? (
            <Card className="border-warning/30 bg-warning-soft print:hidden">
              <CardContent className="space-y-1 p-4 text-sm text-warning-soft-foreground">
                <p className="font-medium">Para revisar antes de compartir (solo lo ve quien genera el reporte)</p>
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

          <InformeVentas reporte={reporte} generado={leidoEl ?? new Date()} />
        </>
      ) : null}
    </div>
  );
};

export default SalesReportsPage;
