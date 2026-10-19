export { calcularReporteSemanal, categoriaDe, UMBRAL_EXCEPCIONAL_PCT } from "./calcular.ts";
export { CATEGORIA_RESTO, REGLAS_CATEGORIA } from "./categorias.config.ts";
export { aNumero, leerPedidos, limpiarEspacios, normalizarTexto } from "./leer-pedidos.ts";
export { semanaIso, semanasPorDefecto } from "./semanas.ts";
export type { ReglaCategoria } from "./categorias.config.ts";
export type * from "./tipos.ts";
export {
  formatoEntero,
  formatoKg,
  formatoPct,
  formatoPesos,
  formatoPesosCorto,
  formatoVariacion,
} from "./formato.ts";
export { lecturasDelReporte } from "./lecturas.ts";
export type { Lecturas } from "./lecturas.ts";
export { seVendePorUnidad } from "./leer-pedidos.ts";
export { anioDeSemana, fechaDeCelda, infoDeSemana } from "./semanas.ts";
export { VENTA_POR_UNIDAD } from "./categorias.config.ts";
