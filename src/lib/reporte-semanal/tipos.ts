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
  /** Fecha del pedido (columna "Fecha pedido"), si se pudo leer. */
  fecha: Date | null;
  total: number;
  /** Valor unitario sin IVA, tal como está en la planilla. */
  valorUnitario: number;
  /** Lo que dice la columna "Cantidad kg", sin interpretar. */
  cantidad: number;
  /** Productos vendidos por unidad (latas): su cantidad no son kilos. */
  porUnidad: boolean;
  /** Kilos: la cantidad de los productos que se venden por peso. */
  kg: number;
  /** Unidades: la cantidad de los productos que se venden por unidad. */
  unidades: number;
}

/** Un renglón que conviene revisar en la planilla antes de confiar en el número. */
export interface CasoParaRevisar {
  fila: number;
  nroPedido: string;
  semana: number | null;
  producto: string;
  motivo: string;
}

export interface LecturaPedidos {
  lineas: LineaPedido[];
  descartadas: {
    sinNroPedido: number;
    canceladas: number;
  };
  /** Renglones con datos dudosos. Se cuentan igual: no se corrige nada por suposición. */
  revisar: CasoParaRevisar[];
}

/** Número de semana con su año y sus fechas (lunes a domingo). */
export interface SemanaInfo {
  semana: number;
  anio: number;
  /** Lunes, en formato AAAA-MM-DD. */
  desde: string;
  /** Domingo, en formato AAAA-MM-DD. */
  hasta: string;
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
  /** Renglones dudosos detectados al leer la planilla (`LecturaPedidos.revisar`). */
  casosParaRevisar?: CasoParaRevisar[];
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
  semanas: { a: number; b: number; detalleA: SemanaInfo; detalleB: SemanaInfo };
  avisos: string[];
  indicadores: {
    totalFacturado: Comparacion;
    /** Solo productos vendidos por peso. */
    kg: Comparacion;
    /** Productos vendidos por unidad (latas). */
    unidades: Comparacion;
    pedidos: Comparacion;
    clientes: Comparacion;
    ticketPromedio: Comparacion;
    /** Venta de productos por peso dividida por sus kilos (sin latas). */
    precioPromedioKg: Comparacion;
  };
  /** Renglones de las semanas A y B que conviene revisar en la planilla. */
  casosParaRevisar: CasoParaRevisar[];
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
    /** Los clientes que más explican la diferencia de venta entre las dos semanas. */
    queExplicanElCambio: { cliente: string; a: number; b: number; diferencia: number }[];
    primeraCompraDelAnio: { a: string[]; b: string[] };
  };
}
