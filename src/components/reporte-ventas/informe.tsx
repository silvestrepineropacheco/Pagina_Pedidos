import { ArrowDownRight, ArrowUpRight, Info, Minus, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatoEntero,
  formatoKg,
  formatoPct,
  formatoPesos,
  formatoPesosCorto,
  formatoVariacion,
  lecturasDelReporte,
} from "@/lib/reporte-semanal";
import type { ClienteEnSemana, Comparacion, ReporteSemanal } from "@/lib/reporte-semanal";
import {
  BarrasComparadas,
  BarrasSimples,
  COLOR_CONTEXTO,
  COLOR_SEMANA_A,
  COLOR_SEMANA_B,
  GraficoSemanas,
  Leyenda,
} from "./graficos";

/** Subió, bajó o se mantuvo: siempre con ícono y texto, nunca solo con color. */
const Variacion = ({ valor }: { valor: number | null }) => {
  if (valor === null) return <span className="text-sm text-muted-foreground">Sin comparación</span>;
  const Icono = valor > 0 ? ArrowUpRight : valor < 0 ? ArrowDownRight : Minus;
  const tono = valor > 0 ? "text-success" : valor < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
      <Icono className={`h-4 w-4 ${tono}`} aria-hidden />
      {formatoVariacion(valor)}
    </span>
  );
};

const Indicador = ({
  nombre,
  explicacion,
  dato,
  formato,
  semanaA,
}: {
  nombre: string;
  explicacion: string;
  dato: Comparacion;
  formato: (valor: number) => string;
  semanaA: number;
}) => (
  <div className="break-inside-avoid rounded-lg border border-border bg-card p-4">
    <p className="text-sm text-muted-foreground">{nombre}</p>
    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{formato(dato.b)}</p>
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Variacion valor={dato.variacionPct} />
      <span className="text-sm text-muted-foreground">
        Semana {semanaA}: {formato(dato.a)}
      </span>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">{explicacion}</p>
  </div>
);

const Seccion = ({
  titulo,
  queMuestra,
  children,
}: {
  titulo: string;
  queMuestra: string;
  children: React.ReactNode;
}) => (
  <Card className="break-inside-avoid shadow-card">
    <CardHeader className="pb-3">
      <CardTitle className="text-base">{titulo}</CardTitle>
      <p className="text-sm text-muted-foreground">{queMuestra}</p>
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);

/** La explicación en palabras de lo que muestra el gráfico o la tabla. */
const Lectura = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-sm text-foreground">
    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    <p>{children}</p>
  </div>
);

const NombreCliente = ({ cliente }: { cliente: ClienteEnSemana }) => (
  <span className="inline-flex items-center gap-1">
    {cliente.cliente}
    {cliente.primeraCompraDelAnio ? (
      <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-label="Primera compra del año" />
    ) : null}
  </span>
);

const ListaClientes = ({ titulo, clientes }: { titulo: string; clientes: ClienteEnSemana[] }) => (
  <div>
    <p className="text-sm font-medium text-foreground">{titulo}</p>
    {clientes.length === 0 ? (
      <p className="mt-1 text-sm text-muted-foreground">Ninguno.</p>
    ) : (
      <ul className="mt-1 space-y-1 text-sm">
        {clientes.map((cliente) => (
          <li key={cliente.cliente} className="flex items-baseline justify-between gap-3">
            <NombreCliente cliente={cliente} />
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatoPesos(cliente.total)}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const InformeVentas = ({ reporte, generado }: { reporte: ReporteSemanal; generado: Date }) => {
  const { a, b } = reporte.semanas;
  const lecturas = lecturasDelReporte(reporte);
  const { indicadores, recurrentesVsOcasionales } = reporte;
  const leyendaSemanas = [
    { color: COLOR_SEMANA_A, texto: `Semana ${a}` },
    { color: COLOR_SEMANA_B, texto: `Semana ${b}` },
  ];
  const hayPromedio = reporte.contexto.semanasDelPromedio.length > 0;
  const hayPrimerasCompras =
    reporte.clientes.primeraCompraDelAnio.a.length > 0 || reporte.clientes.primeraCompraDelAnio.b.length > 0;

  return (
    <article className="space-y-4 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <header className="rounded-lg bg-primary p-5 text-primary-foreground">
        <p className="text-sm text-primary-foreground/80">Manila Patagonia · Uso interno</p>
        <h2 className="mt-1 text-xl font-semibold leading-tight sm:text-2xl">
          Análisis de Ventas — Semana de despacho {a} vs {b}
        </h2>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Generado el {generado.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}.
          Todos los importes son sin IVA.
        </p>
      </header>

      <Seccion
        titulo="En pocas palabras"
        queMuestra={`Lo más importante de la semana ${b}, comparada con la semana ${a}.`}
      >
        <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
          {lecturas.resumen.map((frase) => (
            <li key={frase}>{frase}</li>
          ))}
          <li>{lecturas.contexto}</li>
        </ul>
        {lecturas.excepcionales ? <Lectura>{lecturas.excepcionales}</Lectura> : null}
      </Seccion>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador
          nombre="Venta total"
          explicacion="La suma de todos los pedidos de la semana, sin IVA."
          dato={indicadores.totalFacturado}
          formato={formatoPesos}
          semanaA={a}
        />
        <Indicador
          nombre="Kilos vendidos"
          explicacion="La suma de la columna de cantidad. Las latas se anotan por unidad, no por kilo."
          dato={indicadores.kg}
          formato={formatoKg}
          semanaA={a}
        />
        <Indicador
          nombre="Pedidos"
          explicacion="Cantidad de pedidos distintos. Un pedido con varios productos cuenta una sola vez."
          dato={indicadores.pedidos}
          formato={formatoEntero}
          semanaA={a}
        />
        <Indicador
          nombre="Clientes"
          explicacion="Cuántos clientes distintos compraron en la semana."
          dato={indicadores.clientes}
          formato={formatoEntero}
          semanaA={a}
        />
        <Indicador
          nombre="Pedido promedio"
          explicacion="Venta total dividida por la cantidad de pedidos: cuánto vale un pedido típico."
          dato={indicadores.ticketPromedio}
          formato={formatoPesos}
          semanaA={a}
        />
        <Indicador
          nombre="Precio promedio por kilo"
          explicacion="Venta total dividida por los kilos. Cambia según qué productos se vendieron más."
          dato={indicadores.precioPromedioKg}
          formato={formatoPesos}
          semanaA={a}
        />
      </section>

      <Seccion
        titulo="Cómo viene la venta en las últimas semanas"
        queMuestra="Cada columna es la venta total de una semana. Sirve para ver si la semana fue alta o baja comparada con lo habitual."
      >
        <Leyenda
          items={[
            ...leyendaSemanas,
            { color: COLOR_CONTEXTO, texto: "Semanas anteriores" },
            ...(hayPromedio
              ? [
                  {
                    color: "hsl(var(--foreground) / 0.5)",
                    linea: true,
                    texto: `Promedio de las ${reporte.contexto.semanasDelPromedio.length} semanas anteriores: ${formatoPesosCorto(reporte.contexto.promedioSemanasAnteriores)}`,
                  },
                ]
              : []),
          ]}
        />
        <GraficoSemanas
          columnas={reporte.contexto.ultimasSemanas.map((semana) => ({
            ...semana,
            papel: semana.semana === b ? "b" : semana.semana === a ? "a" : "contexto",
          }))}
          promedio={hayPromedio ? reporte.contexto.promedioSemanasAnteriores : null}
        />
        <Lectura>{lecturas.contexto}</Lectura>
      </Seccion>

      <Seccion
        titulo="Clientes de siempre y clientes ocasionales"
        queMuestra={`"De siempre" (recurrentes) son los que compraron en las dos semanas. "Ocasionales" son los que compraron en una sola de las dos.`}
      >
        <Leyenda items={leyendaSemanas} />
        <BarrasComparadas
          semanaA={a}
          semanaB={b}
          filas={[
            {
              etiqueta: "Recurrentes",
              detalle: `${formatoEntero(recurrentesVsOcasionales.recurrentes.clientes.length)} clientes`,
              a: recurrentesVsOcasionales.recurrentes.a,
              b: recurrentesVsOcasionales.recurrentes.b,
            },
            {
              etiqueta: "Ocasionales",
              detalle: `${formatoEntero(recurrentesVsOcasionales.ocasionales.clientesA.length)} y ${formatoEntero(recurrentesVsOcasionales.ocasionales.clientesB.length)} clientes`,
              a: recurrentesVsOcasionales.ocasionales.a,
              b: recurrentesVsOcasionales.ocasionales.b,
            },
          ]}
        />
        <Lectura>{lecturas.recurrentes}</Lectura>
        {reporte.clientes.recurrentes.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente recurrente</TableHead>
                <TableHead className="text-right">Semana {a}</TableHead>
                <TableHead className="text-right">Semana {b}</TableHead>
                <TableHead className="text-right">Cambio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reporte.clientes.recurrentes.map((cliente) => (
                <TableRow key={cliente.cliente}>
                  <TableCell>{cliente.cliente}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatoPesos(cliente.a)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatoPesos(cliente.b)}</TableCell>
                  <TableCell className="text-right">
                    <Variacion valor={cliente.variacionPct} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Seccion>

      <Seccion
        titulo="Qué se vendió"
        queMuestra="La venta agrupada por tipo de producto. Las barras de cada tipo comparan una semana con la otra."
      >
        <Leyenda items={leyendaSemanas} />
        <BarrasComparadas
          semanaA={a}
          semanaB={b}
          filas={reporte.categorias.filas.map((fila) => ({
            etiqueta: fila.categoria,
            detalle: fila.variacionPct === null ? "No se vendió la semana anterior" : formatoVariacion(fila.variacionPct),
            a: fila.a,
            b: fila.b,
          }))}
        />
        <Lectura>{lecturas.categorias}</Lectura>
      </Seccion>

      <Seccion
        titulo="De dónde salió la mercadería"
        queMuestra="Qué parte de la venta salió de producción de la semana y qué parte de mercadería que ya estaba en stock."
      >
        <Leyenda items={leyendaSemanas} />
        <BarrasComparadas
          semanaA={a}
          semanaB={b}
          formato={(valor) => formatoPct(valor)}
          formatoCompleto={(valor) => `${formatoPct(valor)} de la venta`}
          filas={reporte.origen.map((fila) => ({
            etiqueta: fila.origen,
            detalle: `${formatoPesos(fila.a.total)} y ${formatoPesos(fila.b.total)}`,
            a: fila.a.pct,
            b: fila.b.pct,
          }))}
        />
        <Lectura>{lecturas.origen}</Lectura>
      </Seccion>

      <Seccion
        titulo="Quiénes compraron"
        queMuestra="Los cinco clientes que más compraron cada semana, y quiénes entraron o no repitieron de una semana a la otra."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Los que más compraron en la semana {a}</p>
            <BarrasSimples
              color={COLOR_SEMANA_A}
              filas={reporte.clientes.topA.map((cliente) => ({
                etiqueta: cliente.cliente,
                valor: cliente.total,
                detalle: formatoKg(cliente.kg),
              }))}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Los que más compraron en la semana {b}</p>
            <BarrasSimples
              color={COLOR_SEMANA_B}
              filas={reporte.clientes.topB.map((cliente) => ({
                etiqueta: cliente.cliente,
                valor: cliente.total,
                detalle: formatoKg(cliente.kg),
              }))}
            />
          </div>
        </div>
        <Lectura>{lecturas.clientes}</Lectura>
        <div className="grid gap-6 md:grid-cols-2">
          <ListaClientes
            titulo={`Compraron en la ${b} y no en la ${a}`}
            clientes={reporte.clientes.soloEnB}
          />
          <ListaClientes
            titulo={`Compraron en la ${a} y no repitieron en la ${b}`}
            clientes={reporte.clientes.soloEnA}
          />
        </div>
        {hayPrimerasCompras ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
            Primera compra del año.
          </p>
        ) : null}
      </Seccion>

      <Seccion titulo="Cómo se calculan estos números" queMuestra="Para quien quiera saber de dónde sale cada dato.">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Los datos salen de la hoja PEDIDOS de la planilla, leída en el momento de generar el reporte.</li>
          <li>Cada pedido se cuenta en su semana de despacho, que va de lunes a domingo.</li>
          <li>No se cuentan los pedidos cancelados, ni por el cliente ni por Manila.</li>
          <li>Los importes son sin IVA y salen de la columna "TOTAL Pedido".</li>
          <li>
            Un pedido se marca como excepcional cuando supera el {formatoPct(reporte.pedidosExcepcionales.umbralPct)} de
            la venta de su semana.
          </li>
          <li>El cambio en porcentaje compara siempre la semana {b} contra la semana {a}.</li>
        </ul>
        <p className="text-xs text-muted-foreground">Fuente: registro de pedidos 2026 (hoja PEDIDOS).</p>
      </Seccion>
    </article>
  );
};
