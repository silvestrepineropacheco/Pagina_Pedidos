import type { Celda, LecturaPedidos, LineaPedido } from "./tipos.ts";

/** Quita espacios de los extremos y pasa los espacios repetidos a uno solo. */
export const limpiarEspacios = (valor: Celda): string =>
  valor === null || valor === undefined ? "" : String(valor).replace(/\s+/g, " ").trim();

/** Clave para comparar textos sin distinguir mayúsculas, tildes ni espacios de más. */
export const normalizarTexto = (valor: Celda): string =>
  limpiarEspacios(valor)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * Convierte una celda en número. Acepta números y también textos con formato
 * argentino ("$ 1.234.567,50" o "1.441"), por si la planilla llega con los
 * valores formateados en vez de los números puros.
 */
export const aNumero = (valor: Celda): number => {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (typeof valor !== "string") return 0;
  let texto = valor.replace(/[^\d.,-]/g, "");
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".");
  // Sin coma, un punto seguido de tres cifras es separador de miles ("1.441").
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, "");
  const numero = Number.parseFloat(texto);
  return Number.isFinite(numero) ? numero : 0;
};

const COLUMNAS = {
  nroPedido: "nro pedido",
  cliente: "cliente",
  semana: "semana despacho",
  producto: "producto",
  origen: "origen del producto",
  kg: "cantidad kg",
  total: "total pedido",
  estado: "estado",
} as const;

type Columna = keyof typeof COLUMNAS;

const ESTADOS_EXCLUIDOS = new Set(["cancelado cliente", "cancelado manila"]);
const ORIGEN_VACIO = "Sin dato";
/** Los encabezados están en la fila 4, pero se buscan por si la planilla cambia. */
const FILAS_DONDE_BUSCAR_ENCABEZADOS = 20;

const ubicarEncabezados = (matriz: Celda[][]) => {
  const limite = Math.min(matriz.length, FILAS_DONDE_BUSCAR_ENCABEZADOS);
  for (let indice = 0; indice < limite; indice += 1) {
    const titulos = (matriz[indice] ?? []).map(normalizarTexto);
    if (!titulos.includes(COLUMNAS.nroPedido)) continue;

    const posiciones = {} as Record<Columna, number>;
    const faltantes: string[] = [];
    for (const columna of Object.keys(COLUMNAS) as Columna[]) {
      const posicion = titulos.indexOf(COLUMNAS[columna]);
      if (posicion === -1) faltantes.push(COLUMNAS[columna]);
      posiciones[columna] = posicion;
    }
    if (faltantes.length > 0) {
      throw new Error(`En la hoja PEDIDOS faltan estas columnas: ${faltantes.join(", ")}.`);
    }
    return { filaEncabezados: indice, posiciones };
  }
  throw new Error('No se encontró la fila de encabezados (se busca la columna "Nro pedido").');
};

/**
 * Lee la hoja PEDIDOS a partir de una matriz de celdas (fila por fila, donde
 * la posición 0 de cada fila es la columna A). Sirve igual para un Excel y
 * para lo que devuelve Google Sheets.
 */
export const leerPedidos = (matriz: Celda[][]): LecturaPedidos => {
  const { filaEncabezados, posiciones } = ubicarEncabezados(matriz);
  const lineas: LineaPedido[] = [];
  const descartadas = { sinNroPedido: 0, canceladas: 0 };

  for (let indice = filaEncabezados + 1; indice < matriz.length; indice += 1) {
    const fila = matriz[indice] ?? [];
    const nroPedido = limpiarEspacios(fila[posiciones.nroPedido]);
    if (!nroPedido) {
      if (fila.some((celda) => limpiarEspacios(celda) !== "")) descartadas.sinNroPedido += 1;
      continue;
    }

    const estado = limpiarEspacios(fila[posiciones.estado]);
    if (ESTADOS_EXCLUIDOS.has(normalizarTexto(estado))) {
      descartadas.canceladas += 1;
      continue;
    }

    const semana = Math.trunc(aNumero(fila[posiciones.semana]));
    lineas.push({
      fila: indice + 1,
      nroPedido,
      cliente: limpiarEspacios(fila[posiciones.cliente]),
      clienteClave: normalizarTexto(fila[posiciones.cliente]),
      semana: semana >= 1 && semana <= 53 ? semana : null,
      producto: limpiarEspacios(fila[posiciones.producto]),
      origen: limpiarEspacios(fila[posiciones.origen]) || ORIGEN_VACIO,
      estado,
      total: aNumero(fila[posiciones.total]),
      kg: aNumero(fila[posiciones.kg]),
    });
  }

  return { lineas, descartadas };
};
