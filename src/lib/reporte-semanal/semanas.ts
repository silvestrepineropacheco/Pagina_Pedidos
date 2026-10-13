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
