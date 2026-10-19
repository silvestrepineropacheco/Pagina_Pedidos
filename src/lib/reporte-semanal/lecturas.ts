import { formatoEntero, formatoKg, formatoPct, formatoPesos } from "./formato.ts";
import type { Comparacion, ReporteSemanal } from "./tipos.ts";

/**
 * Textos que explican el reporte en palabras simples. No calculan nada nuevo:
 * solo cuentan con frases los números que ya trae el reporte.
 */
export interface Lecturas {
  resumen: string[];
  contexto: string;
  /** Cuánto de la diferencia entre semanas explican los clientes de la tabla. */
  cambio: string;
  recurrentes: string;
  excepcionales: string | null;
  categorias: string;
  origen: string;
  clientes: string;
}

const sinSigno = (valor: number) => formatoPct(Math.abs(valor));

/** "subió 12,0%", "bajó 17,2%", "se mantuvo igual" o "no hay con qué comparar". */
const movimiento = (dato: Comparacion): string => {
  if (dato.variacionPct === null) return dato.b === 0 ? "no tuvo movimiento" : "no tiene con qué compararse";
  if (dato.variacionPct === 0) return "se mantuvo igual";
  return `${dato.variacionPct > 0 ? "subió" : "bajó"} ${sinSigno(dato.variacionPct)}`;
};

const plural = (cantidad: number, uno: string, varios: string) =>
  `${formatoEntero(cantidad)} ${cantidad === 1 ? uno : varios}`;

const enLista = (nombres: string[]): string => {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
};

export const lecturasDelReporte = (reporte: ReporteSemanal): Lecturas => {
  const { a, b } = reporte.semanas;
  const { indicadores, contexto, recurrentesVsOcasionales, categorias, origen, clientes } = reporte;
  const { recurrentes, ocasionales } = recurrentesVsOcasionales;
  const total = indicadores.totalFacturado;

  // Resumen
  const resumen: string[] = [];
  resumen.push(
    total.variacionPct === null
      ? `En la semana ${b} se vendieron ${formatoPesos(total.b)} sin IVA. La semana ${a} no tiene ventas para comparar.`
      : `En la semana ${b} se vendieron ${formatoPesos(total.b)} sin IVA: la venta ${movimiento(total)} contra la semana ${a} (${formatoPesos(total.a)}).`,
  );
  resumen.push(
    `Fueron ${plural(indicadores.pedidos.b, "pedido", "pedidos")} de ${plural(indicadores.clientes.b, "cliente", "clientes")} y ${formatoKg(indicadores.kg.b)}${indicadores.unidades.b > 0 ? ` más ${plural(indicadores.unidades.b, "lata", "latas")}` : ""}. La semana anterior habían sido ${plural(indicadores.pedidos.a, "pedido", "pedidos")} de ${plural(indicadores.clientes.a, "cliente", "clientes")} y ${formatoKg(indicadores.kg.a)}${indicadores.unidades.a > 0 ? ` más ${plural(indicadores.unidades.a, "lata", "latas")}` : ""}.`,
  );
  if (indicadores.pedidos.a > 0 && indicadores.pedidos.b > 0) {
    resumen.push(
      `Cada pedido fue en promedio de ${formatoPesos(indicadores.ticketPromedio.b)} (antes ${formatoPesos(indicadores.ticketPromedio.a)}), y el kilo se vendió en promedio a ${formatoPesos(indicadores.precioPromedioKg.b)} (antes ${formatoPesos(indicadores.precioPromedioKg.a)}; sin contar latas).`,
    );
  }

  // Contexto
  const diferencia = contexto.diferenciaContraPromedio;
  const lecturaContexto =
    contexto.semanasDelPromedio.length === 0 || diferencia.pct === null
      ? `Todavía no hay semanas anteriores suficientes para comparar la semana ${b} con lo habitual.`
      : `Las ${contexto.semanasDelPromedio.length} semanas anteriores vendieron en promedio ${formatoPesos(contexto.promedioSemanasAnteriores)}. La semana ${b} quedó ${sinSigno(diferencia.pct)} ${diferencia.pct >= 0 ? "por encima" : "por debajo"} de ese nivel habitual.`;

  // Clientes que explican el cambio
  const diferenciaTotal = total.b - total.a;
  const explicada = clientes.queExplicanElCambio.reduce((suma, fila) => suma + fila.diferencia, 0);
  let lecturaCambio = `La venta fue igual en las dos semanas.`;
  if (diferenciaTotal !== 0) {
    const principal = clientes.queExplicanElCambio[0];
    lecturaCambio = `De la semana ${a} a la ${b} la venta ${diferenciaTotal > 0 ? "subió" : "bajó"} ${formatoPesos(Math.abs(diferenciaTotal))}.`;
    if (principal) {
      lecturaCambio += ` El cambio más grande fue ${principal.cliente}: ${principal.diferencia > 0 ? "compró" : "dejó de comprar"} ${formatoPesos(Math.abs(principal.diferencia))} ${principal.diferencia > 0 ? "más" : "respecto de la semana anterior"}.`;
      lecturaCambio += ` Entre los ${plural(clientes.queExplicanElCambio.length, "cliente", "clientes")} de la tabla suman ${explicada >= 0 ? "+" : "-"}${formatoPesos(Math.abs(explicada))}: hay subas y bajas que se compensan entre sí.`;
    }
  }

  // Recurrentes y ocasionales
  const partes: string[] = [];
  if (recurrentes.clientes.length === 0) {
    partes.push(`Ningún cliente compró en las dos semanas.`);
  } else {
    partes.push(
      `${plural(recurrentes.clientes.length, "cliente compró", "clientes compraron")} en las dos semanas. Entre ${recurrentes.clientes.length === 1 ? "él" : "todos"}, su compra ${movimiento(recurrentes)}: de ${formatoPesos(recurrentes.a)} a ${formatoPesos(recurrentes.b)}.`,
    );
  }
  partes.push(
    `Los que compraron en una sola de las dos semanas sumaron ${formatoPesos(ocasionales.a)} en la ${a} (${plural(ocasionales.clientesA.length, "cliente", "clientes")}) y ${formatoPesos(ocasionales.b)} en la ${b} (${plural(ocasionales.clientesB.length, "cliente", "clientes")}).`,
  );
  const cambioRecurrentes = recurrentes.b - recurrentes.a;
  const cambioOcasionales = ocasionales.b - ocasionales.a;
  if (total.b !== total.a && (cambioRecurrentes !== 0 || cambioOcasionales !== 0)) {
    const explicaOcasionales = Math.abs(cambioOcasionales) >= Math.abs(cambioRecurrentes);
    const mismoSentido = (explicaOcasionales ? cambioOcasionales : cambioRecurrentes) * (total.b - total.a) > 0;
    if (mismoSentido) {
      partes.push(
        `La ${total.b > total.a ? "suba" : "caída"} de la semana se explica sobre todo por los clientes ${explicaOcasionales ? "ocasionales" : "recurrentes"}.`,
      );
    }
  }

  // Pedidos excepcionales
  const excepcionalesTexto = (semana: number, lista: ReporteSemanal["pedidosExcepcionales"]["a"]) =>
    lista.map(
      (pedido) =>
        `En la semana ${semana}, el pedido ${pedido.nroPedido} de ${pedido.cliente} (${formatoPesos(pedido.total)}) fue el ${formatoPct(pedido.pctDeLaSemana)} de toda la venta de esa semana.`,
    );
  const listaExcepcionales = [
    ...excepcionalesTexto(a, reporte.pedidosExcepcionales.a),
    ...excepcionalesTexto(b, reporte.pedidosExcepcionales.b),
  ];
  const excepcionales =
    listaExcepcionales.length === 0
      ? null
      : `${listaExcepcionales.join(" ")} Un pedido tan grande puede hacer que una semana parezca mucho mejor o peor que las demás.`;

  // Categorías
  const ordenadas = [...categorias.filas].sort((uno, otro) => otro.b - uno.b);
  const principal = ordenadas[0];
  let lecturaCategorias = `No hubo ventas en la semana ${b}.`;
  if (principal && total.b > 0) {
    lecturaCategorias = `Lo que más se vendió en la semana ${b} fue ${principal.categoria}: ${formatoPesos(principal.b)}, el ${formatoPct((principal.b / total.b) * 100)} del total.`;
    const cambios = categorias.filas
      .map((fila) => ({ ...fila, cambio: fila.b - fila.a }))
      .sort((uno, otro) => otro.cambio - uno.cambio);
    const mayorSuba = cambios[0];
    const mayorBaja = cambios[cambios.length - 1];
    if (mayorSuba && mayorSuba.cambio > 0) {
      lecturaCategorias += ` La que más creció fue ${mayorSuba.categoria} (${formatoPesos(mayorSuba.cambio)} más que la semana ${a}).`;
    }
    if (mayorBaja && mayorBaja.cambio < 0) {
      lecturaCategorias += ` La que más cayó fue ${mayorBaja.categoria} (${formatoPesos(Math.abs(mayorBaja.cambio))} menos).`;
    }
  }

  // Origen
  const origenPrincipal = [...origen].sort((uno, otro) => otro.b.pct - uno.b.pct)[0];
  const lecturaOrigen =
    origenPrincipal && total.b > 0
      ? `En la semana ${b}, el ${formatoPct(origenPrincipal.b.pct)} de lo vendido salió de ${origenPrincipal.origen}${origenPrincipal.a.pct > 0 ? ` (la semana ${a} había sido el ${formatoPct(origenPrincipal.a.pct)})` : ""}.`
      : `No hubo ventas en la semana ${b}.`;

  // Clientes
  const frases: string[] = [];
  const mayor = clientes.topB[0];
  if (mayor && total.b > 0) {
    frases.push(
      `El cliente que más compró en la semana ${b} fue ${mayor.cliente}, con ${formatoPesos(mayor.total)} (${formatoPct((mayor.total / total.b) * 100)} de la semana).`,
    );
  }
  if (clientes.soloEnB.length > 0) {
    frases.push(
      `${plural(clientes.soloEnB.length, "cliente compró", "clientes compraron")} en la ${b} y no en la ${a}: ${enLista(clientes.soloEnB.map((cliente) => cliente.cliente))}.`,
    );
  }
  if (clientes.soloEnA.length > 0) {
    frases.push(
      `${plural(clientes.soloEnA.length, "cliente que había comprado", "clientes que habían comprado")} en la ${a} no ${clientes.soloEnA.length === 1 ? "repitió" : "repitieron"} en la ${b}. Eso no significa que se hayan perdido: muchos clientes compran cada varias semanas.`,
    );
  }
  if (clientes.primeraCompraDelAnio.b.length > 0) {
    frases.push(
      `${clientes.primeraCompraDelAnio.b.length === 1 ? "Es la primera compra del año de" : "Son las primeras compras del año de"} ${enLista(clientes.primeraCompraDelAnio.b)}.`,
    );
  }

  return {
    resumen,
    contexto: lecturaContexto,
    cambio: lecturaCambio,
    recurrentes: partes.join(" "),
    excepcionales,
    categorias: lecturaCategorias,
    origen: lecturaOrigen,
    clientes: frases.join(" "),
  };
};
