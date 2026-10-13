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

const hastaUnDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** Pesos abreviados para gráficos y textos: $28,7 M · $950 mil · $800 */
export const formatoPesosCorto = (valor: number): string => {
  const absoluto = Math.abs(valor);
  const signo = valor < 0 ? "-" : "";
  if (absoluto >= 1_000_000) return `${signo}$${hastaUnDecimal.format(absoluto / 1_000_000)} M`;
  if (absoluto >= 1_000) return `${signo}$${entero.format(Math.round(absoluto / 1_000))} mil`;
  return `${signo}$${entero.format(Math.round(absoluto))}`;
};
