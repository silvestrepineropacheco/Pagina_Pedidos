const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Pesos sin decimales, en formato argentino: $28.650.861 */
export const formatoPesos = (valor: number): string => {
  const redondeado = Math.round(valor);
  return `${redondeado < 0 ? "-" : ""}$${entero.format(Math.abs(redondeado))}`;
};

/** Kilos sin decimales: 1.441 kg */
export const formatoKg = (valor: number): string => `${entero.format(Math.round(valor))} kg`;

/** Cantidades enteras: 1.441 */
export const formatoEntero = (valor: number): string => entero.format(Math.round(valor));

/** Porcentaje con un decimal: 42,1% */
export const formatoPct = (valor: number | null): string =>
  valor === null ? "—" : `${unDecimal.format(valor)}%`;

/** Variación con signo: +58,0% o -17,2%. Sin dato si no hay contra qué comparar. */
export const formatoVariacion = (valor: number | null): string =>
  valor === null ? "—" : `${valor > 0 ? "+" : ""}${unDecimal.format(valor)}%`;
