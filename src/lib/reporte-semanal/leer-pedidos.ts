import { VENTA_POR_UNIDAD } from "./categorias.config.ts";
import { fechaDeCelda } from "./semanas.ts";
import type { CasoParaRevisar, Celda, LecturaPedidos, LineaPedido } from "./tipos.ts";

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

/** Columnas que ayudan a controlar los datos pero sin las cuales se puede calcular igual. */
const COLUMNAS_OPCIONALES = {
  fecha: "fecha pedido",
  valor: "valor s/iva",
  cajas: "cantidad cajas",
} as const;

type Columna = keyof typeof COLUMNAS;
type ColumnaOpcional = keyof typeof COLUMNAS_OPCIONALES;

const ESTADOS_EXCLUIDOS = new Set(["cancelado cliente", "cancelado manila"]);
const ORIGEN_VACIO = "Sin dato";
/** Los encabezados están en la fila 4, pero se buscan por si la planilla cambia. */
const FILAS_DONDE_BUSCAR_ENCABEZADOS = 20;
/** Diferencia en pesos que se tolera por redondeo al comparar el total con valor × cantidad. */
const TOLERANCIA_PESOS = 1;

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
    const opcionales = {} as Record<ColumnaOpcional, number>;
    for (const columna of Object.keys(COLUMNAS_OPCIONALES) as ColumnaOpcional[]) {
      opcionales[columna] = titulos.indexOf(COLUMNAS_OPCIONALES[columna]);
    }
    return { filaEncabezados: indice, posiciones, opcionales };
  }
  throw new Error('No se encontró la fila de encabezados (se busca la columna "Nro pedido").');
};

/** Si el producto se vende por unidad (latas) según la configuración. */
export const seVendePorUnidad = (producto: string): boolean => {
  const nombre = producto.toLowerCase();
  return (
    (VENTA_POR_UNIDAD.empiezaCon ?? []).some((texto) => nombre.startsWith(texto.toLowerCase())) ||
    (VENTA_POR_UNIDAD.contiene ?? []).some((texto) => nombre.includes(texto.toLowerCase()))
  );
};

/**
 * Marca los renglones dudosos. No corrige nada: los importes se cuentan tal
 * como están y la persona decide en la planilla.
 */
const buscarCasosParaRevisar = (lineas: LineaPedido[], cajasPorFila: Map<number, number>): CasoParaRevisar[] => {
  const casos: CasoParaRevisar[] = [];
  const caso = (linea: LineaPedido, motivo: string) =>
    casos.push({ fila: linea.fila, nroPedido: linea.nroPedido, semana: linea.semana, producto: linea.producto, motivo });

  const vistos = new Map<string, LineaPedido>();
  for (const linea of lineas) {
    const clave = [linea.nroPedido, normalizarTexto(linea.producto), linea.valorUnitario, linea.cantidad, linea.total].join("|");
    const anterior = vistos.get(clave);
    if (anterior) {
      caso(
        linea,
        `Renglón idéntico al de la fila ${anterior.fila} (mismo pedido, producto, cantidad e importe): puede estar cargado dos veces y sumarse doble.`,
      );
    } else {
      vistos.set(clave, linea);
    }

    if (linea.total > 0 && linea.cantidad <= 0) {
      caso(linea, "Tiene importe pero no tiene cantidad: no se sabe cuántos kilos o unidades se vendieron.");
    } else if (linea.valorUnitario > 0 && linea.cantidad > 0) {
      const cajas = cajasPorFila.get(linea.fila) ?? 0;
      const porCantidad = Math.abs(linea.total - linea.valorUnitario * linea.cantidad) <= TOLERANCIA_PESOS;
      const porCajas = cajas > 0 && Math.abs(linea.total - linea.valorUnitario * cajas) <= TOLERANCIA_PESOS;
      if (!porCantidad && !porCajas) {
        caso(linea, "El total no coincide con valor × cantidad: revisar si el importe es correcto.");
      }
    }
  }
  return casos.sort((uno, otro) => uno.fila - otro.fila);
};

/**
 * Lee la hoja PEDIDOS a partir de una matriz de celdas (fila por fila, donde
 * la posición 0 de cada fila es la columna A). Sirve igual para un Excel y
 * para lo que devuelve Google Sheets.
 */
export const leerPedidos = (matriz: Celda[][]): LecturaPedidos => {
  const { filaEncabezados, posiciones, opcionales } = ubicarEncabezados(matriz);
  const lineas: LineaPedido[] = [];
  const descartadas = { sinNroPedido: 0, canceladas: 0 };
  const cajasPorFila = new Map<number, number>();
  const opcional = (fila: Celda[], columna: ColumnaOpcional) =>
    opcionales[columna] >= 0 ? fila[opcionales[columna]] : undefined;

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
    const producto = limpiarEspacios(fila[posiciones.producto]);
    const cantidad = aNumero(fila[posiciones.kg]);
    const porUnidad = seVendePorUnidad(producto);
    cajasPorFila.set(indice + 1, aNumero(opcional(fila, "cajas")));
    lineas.push({
      fila: indice + 1,
      nroPedido,
      cliente: limpiarEspacios(fila[posiciones.cliente]),
      clienteClave: normalizarTexto(fila[posiciones.cliente]),
      semana: semana >= 1 && semana <= 53 ? semana : null,
      producto,
      origen: limpiarEspacios(fila[posiciones.origen]) || ORIGEN_VACIO,
      estado,
      fecha: fechaDeCelda(opcional(fila, "fecha")),
      total: aNumero(fila[posiciones.total]),
      valorUnitario: aNumero(opcional(fila, "valor")),
      cantidad,
      porUnidad,
      kg: porUnidad ? 0 : cantidad,
      unidades: porUnidad ? cantidad : 0,
    });
  }

  return { lineas, descartadas, revisar: buscarCasosParaRevisar(lineas, cajasPorFila) };
};
