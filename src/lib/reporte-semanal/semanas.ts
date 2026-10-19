/** Semana ISO (de lunes a domingo) de una fecha. */
export const semanaIso = (fecha: Date): number => {
  const dia = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  // El jueves de la misma semana define a qué año pertenece la semana ISO.
  dia.setUTCDate(dia.getUTCDate() + 4 - (dia.getUTCDay() || 7));
  const inicioDelAnio = Date.UTC(dia.getUTCFullYear(), 0, 1);
  return Math.ceil(((dia.getTime() - inicioDelAnio) / 86400000 + 1) / 7);
};

/**
 * Semanas que compara el reporte si no se eligen a mano: la última semana
 * terminada (B) contra la anterior (A). Un lunes de la semana 42 da 41 contra 40.
 *
 * La planilla es de un solo año, así que las semanas no cruzan de un año a otro.
 */
export const semanasPorDefecto = (hoy: Date = new Date()): { a: number; b: number } => {
  const b = semanaIso(hoy) - 1;
  return { a: b - 1, b };
};

const DIA_MS = 86400000;

const aTextoFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);

/** Lunes de la semana ISO `semana` del año ISO `anio` (en UTC). */
export const lunesDeSemana = (anio: number, semana: number): Date => {
  const cuatroDeEnero = new Date(Date.UTC(anio, 0, 4));
  const lunesSemana1 = cuatroDeEnero.getTime() - ((cuatroDeEnero.getUTCDay() || 7) - 1) * DIA_MS;
  return new Date(lunesSemana1 + (semana - 1) * 7 * DIA_MS);
};

/** Año ISO al que pertenece una fecha (puede ser el siguiente o el anterior a fin de año). */
export const anioIso = (fecha: Date): number => {
  const dia = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  dia.setUTCDate(dia.getUTCDate() + 4 - (dia.getUTCDay() || 7));
  return dia.getUTCFullYear();
};

/** Semana con su año y fechas de lunes a domingo. */
export const infoDeSemana = (anio: number, semana: number) => {
  const lunes = lunesDeSemana(anio, semana);
  return {
    semana,
    anio,
    desde: aTextoFecha(lunes),
    hasta: aTextoFecha(new Date(lunes.getTime() + 6 * DIA_MS)),
  };
};

/**
 * Año de una semana de despacho. La columna de la semana no trae año, así que
 * se toma de las fechas de pedido de esa semana: el pedido más reciente es el
 * más cercano al despacho. Si la semana de despacho es mucho menor que la del
 * pedido, el despacho cae en el año siguiente (pedidos de fin de diciembre).
 */
export const anioDeSemana = (semana: number, fechasDePedido: Date[], porDefecto: number): number => {
  if (fechasDePedido.length === 0) return porDefecto;
  const ultima = fechasDePedido.reduce((mayor, fecha) => (fecha > mayor ? fecha : mayor));
  const anio = anioIso(ultima);
  return semanaIso(ultima) - semana > 26 ? anio + 1 : anio;
};

/**
 * Convierte la fecha de la planilla en un Date. Acepta el número de serie de
 * Excel/Google Sheets (días desde el 30/12/1899) y textos DD/MM/AAAA.
 */
export const fechaDeCelda = (valor: unknown): Date | null => {
  if (typeof valor === "number" && Number.isFinite(valor) && valor > 20000) {
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * DIA_MS);
    return new Date(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  }
  if (typeof valor === "string") {
    const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(valor.trim());
    if (partes) return new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]));
  }
  return null;
};
