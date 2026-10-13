/** Valor de una celda tal como llega de la planilla (Excel o Google Sheets). */
export type Celda = string | number | boolean | null | undefined;

/** Un renglón válido de la hoja PEDIDOS (un producto dentro de un pedido). */
export interface LineaPedido {
  /** Número de fila en la planilla (1 = primera fila), para poder rastrearla. */
  fila: number;
  nroPedido: string;
  /** Nombre tal como está escrito, sin espacios de más. */
  cliente: string;
  /** Nombre normalizado: es la clave para agrupar. */
  clienteClave: string;
  semana: number | null;
  producto: string;
  origen: string;
  estado: string;
  total: number;
  kg: number;
}

export interface LecturaPedidos {
  lineas: LineaPedido[];
  descartadas: {
    sinNroPedido: number;
    canceladas: number;
  };
}

export interface OpcionesReporte {
  /** Semana anterior (A). Si falta, se toma B - 1. */
  semanaA?: number;
  /** Semana a informar (B). Si falta, la última semana terminada según `hoy`. */
  semanaB?: number;
  /** Fecha de referencia para elegir las semanas por defecto. */
  hoy?: Date;
  /** Un pedido es excepcional si supera este % del total de su semana. */
  umbralExcepcionalPct?: number;
}

export interface Comparacion {
  a: number;
  b: number;
  /** Variación de B contra A en %. `null` si A es 0. */
  variacionPct: number | null;
}

export interface PedidoExcepcional {
  nroPedido: string;
  cliente: string;
  total: number;
  pctDeLaSemana: number;
}

export interface ClienteEnSemana {
  cliente: string;
  kg: number;
  total: number;
  primeraCompraDelAnio: boolean;
}

export interface ReporteSemanal {
  semanas: { a: number; b: number };
  avisos: string[];
  indicadores: {
    totalFacturado: Comparacion;
    kg: Comparacion;
    pedidos: Comparacion;
    clientes: Comparacion;
    ticketPromedio: Comparacion;
    precioPromedioKg: Comparacion;
  };
  contexto: {
    ultimasSemanas: { semana: number; total: number }[];
    semanasDelPromedio: number[];
    promedioSemanasAnteriores: number;
    diferenciaContraPromedio: { monto: number; pct: number | null };
  };
  recurrentesVsOcasionales: {
    recurrentes: Comparacion & { clientes: string[] };
    ocasionales: Comparacion & { clientesA: string[]; clientesB: string[] };
  };
  pedidosExcepcionales: {
    umbralPct: number;
    a: PedidoExcepcional[];
    b: PedidoExcepcional[];
  };
  categorias: {
    filas: (Comparacion & { categoria: string })[];
    productosEnOtros: string[];
  };
  origen: {
    origen: string;
    a: { total: number; pct: number };
    b: { total: number; pct: number };
  }[];
  clientes: {
    topA: ClienteEnSemana[];
    topB: ClienteEnSemana[];
    recurrentes: (Comparacion & { cliente: string })[];
    soloEnB: ClienteEnSemana[];
    soloEnA: ClienteEnSemana[];
    primeraCompraDelAnio: { a: string[]; b: string[] };
  };
}
