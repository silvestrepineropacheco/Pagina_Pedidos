import { CATEGORIA_RESTO, REGLAS_CATEGORIA } from "./categorias.config.ts";
import type { ReglaCategoria } from "./categorias.config.ts";
import { semanasPorDefecto } from "./semanas.ts";
import type {
  ClienteEnSemana,
  Comparacion,
  LineaPedido,
  OpcionesReporte,
  PedidoExcepcional,
  ReporteSemanal,
} from "./tipos.ts";

export const UMBRAL_EXCEPCIONAL_PCT = 40;
const SEMANAS_DE_CONTEXTO = 10;
const SEMANAS_DEL_PROMEDIO = 6;
const TOP_CLIENTES = 5;

const redondear = (valor: number, decimales = 2): number => {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
};

const porcentaje = (parte: number, total: number): number =>
  total === 0 ? 0 : redondear((parte / total) * 100, 1);

const dividir = (numerador: number, denominador: number): number =>
  denominador === 0 ? 0 : numerador / denominador;

const comparar = (a: number, b: number): Comparacion => ({
  a: redondear(a),
  b: redondear(b),
  variacionPct: a === 0 ? null : redondear(((b - a) / a) * 100, 1),
});

const sumar = <T>(elementos: T[], valor: (elemento: T) => number): number =>
  elementos.reduce((acumulado, elemento) => acumulado + valor(elemento), 0);

/** Categoría de un producto según las reglas configurables (gana la primera que coincide). */
export const categoriaDe = (
  producto: string,
  reglas: ReglaCategoria[] = REGLAS_CATEGORIA,
): string => {
  const nombre = producto.toLowerCase();
  for (const regla of reglas) {
    const empieza = (regla.empiezaCon ?? []).some((texto) => nombre.startsWith(texto.toLowerCase()));
    const contiene = (regla.contiene ?? []).some((texto) => nombre.includes(texto.toLowerCase()));
    if (empieza || contiene) return regla.categoria;
  }
  return CATEGORIA_RESTO;
};

/** Para cada cliente, la forma del nombre que más se repite en la planilla. */
const nombresDeClientes = (lineas: LineaPedido[]): Map<string, string> => {
  const formas = new Map<string, Map<string, number>>();
  for (const linea of lineas) {
    const porForma = formas.get(linea.clienteClave) ?? new Map<string, number>();
    porForma.set(linea.cliente, (porForma.get(linea.cliente) ?? 0) + 1);
    formas.set(linea.clienteClave, porForma);
  }
  const nombres = new Map<string, string>();
  for (const [clave, porForma] of formas) {
    let elegido = "";
    let veces = 0;
    // Con `>` un empate lo gana la forma que apareció primero.
    for (const [forma, cantidad] of porForma) {
      if (cantidad > veces) {
        elegido = forma;
        veces = cantidad;
      }
    }
    nombres.set(clave, elegido);
  }
  return nombres;
};

interface TotalCliente {
  clave: string;
  kg: number;
  total: number;
}

const totalesPorCliente = (lineas: LineaPedido[]): Map<string, TotalCliente> => {
  const totales = new Map<string, TotalCliente>();
  for (const linea of lineas) {
    const actual = totales.get(linea.clienteClave) ?? { clave: linea.clienteClave, kg: 0, total: 0 };
    actual.kg += linea.kg;
    actual.total += linea.total;
    totales.set(linea.clienteClave, actual);
  }
  return totales;
};

const sumarPor = (lineas: LineaPedido[], clave: (linea: LineaPedido) => string): Map<string, number> => {
  const totales = new Map<string, number>();
  for (const linea of lineas) {
    const grupo = clave(linea);
    totales.set(grupo, (totales.get(grupo) ?? 0) + linea.total);
  }
  return totales;
};

/**
 * Calcula el reporte semanal comparando la semana B contra la semana A.
 * Recibe las líneas ya leídas con `leerPedidos` (sin pedidos cancelados).
 */
export const calcularReporteSemanal = (
  lineas: LineaPedido[],
  opciones: OpcionesReporte = {},
): ReporteSemanal => {
  const porDefecto = semanasPorDefecto(opciones.hoy ?? new Date());
  const semanaB = opciones.semanaB ?? porDefecto.b;
  const semanaA = opciones.semanaA ?? semanaB - 1;
  const umbralPct = opciones.umbralExcepcionalPct ?? UMBRAL_EXCEPCIONAL_PCT;

  const nombres = nombresDeClientes(lineas);
  const nombre = (clave: string) => nombres.get(clave) ?? clave;
  const ordenAlfabetico = (uno: string, otro: string) => uno.localeCompare(otro, "es");

  const porSemana = new Map<number, LineaPedido[]>();
  for (const linea of lineas) {
    if (linea.semana === null) continue;
    const grupo = porSemana.get(linea.semana) ?? [];
    grupo.push(linea);
    porSemana.set(linea.semana, grupo);
  }
  const lineasDe = (semana: number) => porSemana.get(semana) ?? [];
  const totalDe = (semana: number) => sumar(lineasDe(semana), (linea) => linea.total);

  const lineasA = lineasDe(semanaA);
  const lineasB = lineasDe(semanaB);
  const totalA = totalDe(semanaA);
  const totalB = totalDe(semanaB);

  // Avisos
  const avisos: string[] = [];
  if (lineasDe(semanaB + 1).length === 0) {
    avisos.push(
      `La semana ${semanaB + 1} todavía no tiene pedidos cargados: puede que la semana ${semanaB} no esté cerrada.`,
    );
  }
  if (lineasA.length === 0) avisos.push(`La semana ${semanaA} no tiene pedidos.`);
  if (lineasB.length === 0) avisos.push(`La semana ${semanaB} no tiene pedidos.`);
  const sinSemana = lineas.filter((linea) => linea.semana === null).length;
  if (sinSemana > 0) {
    avisos.push(`Hay ${sinSemana} renglones con número de pedido pero sin semana de despacho: no se cuentan.`);
  }

  // 1. Indicadores
  const kgA = sumar(lineasA, (linea) => linea.kg);
  const kgB = sumar(lineasB, (linea) => linea.kg);
  const pedidosA = new Set(lineasA.map((linea) => linea.nroPedido)).size;
  const pedidosB = new Set(lineasB.map((linea) => linea.nroPedido)).size;
  const clientesA = totalesPorCliente(lineasA);
  const clientesB = totalesPorCliente(lineasB);

  // 2. Contexto
  const ultimasSemanas: { semana: number; total: number }[] = [];
  for (let semana = Math.max(1, semanaB - SEMANAS_DE_CONTEXTO + 1); semana <= semanaB; semana += 1) {
    ultimasSemanas.push({ semana, total: redondear(totalDe(semana)) });
  }
  const semanasDelPromedio: number[] = [];
  for (let semana = Math.max(1, semanaB - SEMANAS_DEL_PROMEDIO); semana < semanaB; semana += 1) {
    semanasDelPromedio.push(semana);
  }
  const promedio = dividir(sumar(semanasDelPromedio, totalDe), semanasDelPromedio.length);

  // 3. Recurrentes vs ocasionales
  const clavesRecurrentes = [...clientesA.keys()].filter((clave) => clientesB.has(clave));
  const clavesSoloA = [...clientesA.keys()].filter((clave) => !clientesB.has(clave));
  const clavesSoloB = [...clientesB.keys()].filter((clave) => !clientesA.has(clave));
  const totalEn = (totales: Map<string, TotalCliente>, claves: string[]) =>
    sumar(claves, (clave) => totales.get(clave)?.total ?? 0);

  // 4. Pedidos excepcionales
  const excepcionales = (lineasSemana: LineaPedido[], totalSemana: number): PedidoExcepcional[] => {
    const porPedido = new Map<string, { clave: string; total: number }>();
    for (const linea of lineasSemana) {
      const actual = porPedido.get(linea.nroPedido) ?? { clave: linea.clienteClave, total: 0 };
      actual.total += linea.total;
      porPedido.set(linea.nroPedido, actual);
    }
    return [...porPedido.entries()]
      .filter(([, pedido]) => totalSemana > 0 && (pedido.total / totalSemana) * 100 > umbralPct)
      .map(([nroPedido, pedido]) => ({
        nroPedido,
        cliente: nombre(pedido.clave),
        total: redondear(pedido.total),
        pctDeLaSemana: porcentaje(pedido.total, totalSemana),
      }))
      .sort((uno, otro) => otro.total - uno.total);
  };

  // 5. Categorías
  const categoriasA = sumarPor(lineasA, (linea) => categoriaDe(linea.producto));
  const categoriasB = sumarPor(lineasB, (linea) => categoriaDe(linea.producto));
  const ordenCategorias = [...REGLAS_CATEGORIA.map((regla) => regla.categoria), CATEGORIA_RESTO];
  const filasCategorias = [...new Set(ordenCategorias)]
    .filter((categoria) => categoriasA.has(categoria) || categoriasB.has(categoria))
    .map((categoria) => ({
      categoria,
      ...comparar(categoriasA.get(categoria) ?? 0, categoriasB.get(categoria) ?? 0),
    }));
  const productosEnOtros = [
    ...new Set(
      [...lineasA, ...lineasB]
        .filter((linea) => categoriaDe(linea.producto) === CATEGORIA_RESTO)
        .map((linea) => linea.producto),
    ),
  ].sort(ordenAlfabetico);

  // 6. Origen
  const origenA = sumarPor(lineasA, (linea) => linea.origen);
  const origenB = sumarPor(lineasB, (linea) => linea.origen);
  const origen = [...new Set([...origenA.keys(), ...origenB.keys()])]
    .map((nombreOrigen) => ({
      origen: nombreOrigen,
      a: {
        total: redondear(origenA.get(nombreOrigen) ?? 0),
        pct: porcentaje(origenA.get(nombreOrigen) ?? 0, totalA),
      },
      b: {
        total: redondear(origenB.get(nombreOrigen) ?? 0),
        pct: porcentaje(origenB.get(nombreOrigen) ?? 0, totalB),
      },
    }))
    .sort((uno, otro) => otro.b.total - uno.b.total || otro.a.total - uno.a.total);

  // 7. Clientes
  const primeraSemana = new Map<string, number>();
  for (const linea of lineas) {
    if (linea.semana === null) continue;
    const anterior = primeraSemana.get(linea.clienteClave);
    if (anterior === undefined || linea.semana < anterior) primeraSemana.set(linea.clienteClave, linea.semana);
  }
  const fichaCliente = (totales: Map<string, TotalCliente>, semana: number) => (clave: string): ClienteEnSemana => ({
    cliente: nombre(clave),
    kg: redondear(totales.get(clave)?.kg ?? 0),
    total: redondear(totales.get(clave)?.total ?? 0),
    primeraCompraDelAnio: primeraSemana.get(clave) === semana,
  });
  const porTotal = (uno: ClienteEnSemana, otro: ClienteEnSemana) => otro.total - uno.total;
  const fichasA = [...clientesA.keys()].map(fichaCliente(clientesA, semanaA)).sort(porTotal);
  const fichasB = [...clientesB.keys()].map(fichaCliente(clientesB, semanaB)).sort(porTotal);
  const soloNombres = (fichas: ClienteEnSemana[]) =>
    fichas.filter((ficha) => ficha.primeraCompraDelAnio).map((ficha) => ficha.cliente);

  return {
    semanas: { a: semanaA, b: semanaB },
    avisos,
    indicadores: {
      totalFacturado: comparar(totalA, totalB),
      kg: comparar(kgA, kgB),
      pedidos: comparar(pedidosA, pedidosB),
      clientes: comparar(clientesA.size, clientesB.size),
      ticketPromedio: comparar(dividir(totalA, pedidosA), dividir(totalB, pedidosB)),
      precioPromedioKg: comparar(dividir(totalA, kgA), dividir(totalB, kgB)),
    },
    contexto: {
      ultimasSemanas,
      semanasDelPromedio,
      promedioSemanasAnteriores: redondear(promedio),
      diferenciaContraPromedio: {
        monto: redondear(totalB - promedio),
        pct: promedio === 0 ? null : redondear(((totalB - promedio) / promedio) * 100, 1),
      },
    },
    recurrentesVsOcasionales: {
      recurrentes: {
        ...comparar(totalEn(clientesA, clavesRecurrentes), totalEn(clientesB, clavesRecurrentes)),
        clientes: clavesRecurrentes.map(nombre).sort(ordenAlfabetico),
      },
      ocasionales: {
        ...comparar(totalEn(clientesA, clavesSoloA), totalEn(clientesB, clavesSoloB)),
        clientesA: clavesSoloA.map(nombre).sort(ordenAlfabetico),
        clientesB: clavesSoloB.map(nombre).sort(ordenAlfabetico),
      },
    },
    pedidosExcepcionales: {
      umbralPct,
      a: excepcionales(lineasA, totalA),
      b: excepcionales(lineasB, totalB),
    },
    categorias: { filas: filasCategorias, productosEnOtros },
    origen,
    clientes: {
      topA: fichasA.slice(0, TOP_CLIENTES),
      topB: fichasB.slice(0, TOP_CLIENTES),
      recurrentes: clavesRecurrentes
        .map((clave) => ({
          cliente: nombre(clave),
          ...comparar(clientesA.get(clave)?.total ?? 0, clientesB.get(clave)?.total ?? 0),
        }))
        .sort((uno, otro) => otro.b - uno.b),
      soloEnB: clavesSoloB.map(fichaCliente(clientesB, semanaB)).sort(porTotal),
      soloEnA: clavesSoloA.map(fichaCliente(clientesA, semanaA)).sort(porTotal),
      primeraCompraDelAnio: { a: soloNombres(fichasA), b: soloNombres(fichasB) },
    },
  };
};
