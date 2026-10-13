import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatoPesos, formatoPesosCorto } from "@/lib/reporte-semanal";

/**
 * Colores de los gráficos del reporte. En todo el informe el azul es la semana
 * anterior (A) y el naranja la semana informada (B); el gris es contexto.
 */
export const COLOR_SEMANA_A = "#2a78d6";
export const COLOR_SEMANA_B = "#eb6834";
export const COLOR_CONTEXTO = "#c5cad3";

const Muestra = ({ color, linea }: { color: string; linea?: boolean }) => (
  <span
    className={linea ? "inline-block h-px w-4 shrink-0" : "inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"}
    style={{ backgroundColor: color }}
  />
);

export const Leyenda = ({ items }: { items: { color: string; texto: string; linea?: boolean }[] }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
    {items.map((item) => (
      <span key={item.texto} className="inline-flex items-center gap-1.5">
        <Muestra color={item.color} linea={item.linea} />
        {item.texto}
      </span>
    ))}
  </div>
);

/** Redondea hacia arriba a un número "limpio" para el tope del eje. */
const topeLimpio = (valor: number): number => {
  if (valor <= 0) return 1;
  const magnitud = 10 ** Math.floor(Math.log10(valor));
  const candidato = [1, 2, 2.5, 5, 10].find((paso) => paso * magnitud >= valor) ?? 10;
  return candidato * magnitud;
};

export interface ColumnaSemana {
  semana: number;
  total: number;
  papel: "a" | "b" | "contexto";
}

/** Venta total de las últimas semanas, con la línea del promedio habitual. */
export const GraficoSemanas = ({
  columnas,
  promedio,
}: {
  columnas: ColumnaSemana[];
  promedio: number | null;
}) => {
  const tope = topeLimpio(Math.max(...columnas.map((columna) => columna.total), promedio ?? 0));
  const marcas = [0.25, 0.5, 0.75, 1].map((fraccion) => fraccion * tope);
  const color = { a: COLOR_SEMANA_A, b: COLOR_SEMANA_B, contexto: COLOR_CONTEXTO };

  return (
    <div className="flex gap-2 pt-3">
      <div className="relative h-56 w-14 shrink-0 text-right text-[11px] text-muted-foreground">
        {marcas.map((marca) => (
          <span key={marca} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(marca / tope) * 100}%` }}>
            {formatoPesosCorto(marca)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-56 border-b border-border">
          {marcas.map((marca) => (
            <div
              key={marca}
              className="absolute inset-x-0 border-t border-border/70"
              style={{ bottom: `${(marca / tope) * 100}%` }}
            />
          ))}
          {promedio !== null && promedio > 0 ? (
            <div
              className="absolute inset-x-0 border-t border-foreground/50"
              style={{ bottom: `${(promedio / tope) * 100}%` }}
            />
          ) : null}
          <div className="absolute inset-0 flex items-end">
            {columnas.map((columna) => (
              <Tooltip key={columna.semana}>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className="flex h-full flex-1 flex-col items-center justify-end outline-none focus-visible:bg-muted/60 hover:bg-muted/60"
                  >
                    {columna.papel !== "contexto" ? (
                      <span className="mb-1 whitespace-nowrap text-[11px] font-medium text-foreground">
                        {formatoPesosCorto(columna.total)}
                      </span>
                    ) : null}
                    <div
                      className="w-3/5 max-w-6 rounded-t-[4px]"
                      style={{
                        height: `${(columna.total / tope) * 100}%`,
                        minHeight: columna.total > 0 ? 2 : 0,
                        backgroundColor: color[columna.papel],
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Semana {columna.semana}: {formatoPesos(columna.total)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <div className="mt-1 flex text-[11px] text-muted-foreground">
          {columnas.map((columna) => (
            <span
              key={columna.semana}
              className={`flex-1 text-center ${columna.papel === "contexto" ? "" : "font-semibold text-foreground"}`}
            >
              {columna.semana}
            </span>
          ))}
        </div>
        <p className="mt-0.5 text-center text-[11px] text-muted-foreground">Semana de despacho</p>
      </div>
    </div>
  );
};

export interface FilaComparada {
  etiqueta: string;
  a: number;
  b: number;
  detalle?: string;
}

/**
 * Barras horizontales de a pares: para cada fila, la semana A (azul) arriba y
 * la semana B (naranja) abajo, en la misma escala.
 */
export const BarrasComparadas = ({
  filas,
  semanaA,
  semanaB,
  formato = formatoPesosCorto,
  formatoCompleto = formatoPesos,
}: {
  filas: FilaComparada[];
  semanaA: number;
  semanaB: number;
  formato?: (valor: number) => string;
  formatoCompleto?: (valor: number) => string;
}) => {
  const maximo = Math.max(1, ...filas.flatMap((fila) => [fila.a, fila.b]));
  const barra = (valor: number, color: string, semana: number, etiqueta: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} className="flex items-center gap-2 py-px outline-none hover:bg-muted/60 focus-visible:bg-muted/60">
          <div className="min-w-0 flex-1">
            <div
              className="h-3 rounded-r-[4px]"
              style={{ width: `${(valor / maximo) * 100}%`, minWidth: valor > 0 ? 2 : 0, backgroundColor: color }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground">{formato(valor)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {etiqueta} · semana {semana}: {formatoCompleto(valor)}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="space-y-3">
      {filas.map((fila) => (
        <div key={fila.etiqueta} className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-center">
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">{fila.etiqueta}</p>
            {fila.detalle ? <p className="text-xs text-muted-foreground">{fila.detalle}</p> : null}
          </div>
          <div className="border-l border-border">
            {barra(fila.a, COLOR_SEMANA_A, semanaA, fila.etiqueta)}
            {barra(fila.b, COLOR_SEMANA_B, semanaB, fila.etiqueta)}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Barras simples de una sola semana (por ejemplo, los clientes que más compraron). */
export const BarrasSimples = ({
  filas,
  color,
}: {
  filas: { etiqueta: string; valor: number; detalle?: string }[];
  color: string;
}) => {
  const maximo = Math.max(1, ...filas.map((fila) => fila.valor));
  return (
    <div className="space-y-2">
      {filas.map((fila) => (
        <Tooltip key={fila.etiqueta}>
          <TooltipTrigger asChild>
            <div tabIndex={0} className="outline-none hover:bg-muted/60 focus-visible:bg-muted/60">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-foreground">{fila.etiqueta}</span>
                <span className="shrink-0 tabular-nums text-foreground">{formatoPesosCorto(fila.valor)}</span>
              </div>
              <div className="mt-0.5 border-l border-border">
                <div
                  className="h-3 rounded-r-[4px]"
                  style={{ width: `${(fila.valor / maximo) * 100}%`, minWidth: 2, backgroundColor: color }}
                />
              </div>
              {fila.detalle ? <p className="mt-0.5 text-xs text-muted-foreground">{fila.detalle}</p> : null}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {fila.etiqueta}: {formatoPesos(fila.valor)}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};
