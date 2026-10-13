import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * Lector mínimo de archivos .xlsx, solo para los tests: devuelve una hoja como
 * matriz de celdas (posición 0 = columna A). Un .xlsx es un zip con XML adentro,
 * así que no hace falta instalar ninguna librería.
 */

type Celda = string | number | null;

const FIRMA_FIN_DIRECTORIO = 0x06054b50;
const FIRMA_ENTRADA = 0x02014b50;

const descomprimirZip = (archivo: Buffer): Map<string, Buffer> => {
  let fin = archivo.length - 22;
  while (fin >= 0 && archivo.readUInt32LE(fin) !== FIRMA_FIN_DIRECTORIO) fin -= 1;
  if (fin < 0) throw new Error("El archivo no es un .xlsx válido.");

  const cantidad = archivo.readUInt16LE(fin + 10);
  let posicion = archivo.readUInt32LE(fin + 16);
  const contenidos = new Map<string, Buffer>();

  for (let indice = 0; indice < cantidad; indice += 1) {
    if (archivo.readUInt32LE(posicion) !== FIRMA_ENTRADA) throw new Error("Zip dañado.");
    const metodo = archivo.readUInt16LE(posicion + 10);
    const tamanioComprimido = archivo.readUInt32LE(posicion + 20);
    const largoNombre = archivo.readUInt16LE(posicion + 28);
    const largoExtra = archivo.readUInt16LE(posicion + 30);
    const largoComentario = archivo.readUInt16LE(posicion + 32);
    const inicioLocal = archivo.readUInt32LE(posicion + 42);
    const nombre = archivo.toString("utf8", posicion + 46, posicion + 46 + largoNombre);

    const inicioDatos =
      inicioLocal + 30 + archivo.readUInt16LE(inicioLocal + 26) + archivo.readUInt16LE(inicioLocal + 28);
    const datos = archivo.subarray(inicioDatos, inicioDatos + tamanioComprimido);
    contenidos.set(nombre, metodo === 0 ? datos : inflateRawSync(datos));

    posicion += 46 + largoNombre + largoExtra + largoComentario;
  }
  return contenidos;
};

const decodificar = (texto: string): string =>
  texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&amp;/g, "&");

const textoDe = (xml: string): string =>
  [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((parte) => decodificar(parte[1])).join("");

const numeroDeColumna = (letras: string): number => {
  let numero = 0;
  for (const letra of letras) numero = numero * 26 + (letra.charCodeAt(0) - 64);
  return numero - 1;
};

export const leerHojaXlsx = (ruta: string, nombreHoja: string): Celda[][] => {
  const zip = descomprimirZip(readFileSync(ruta));
  const xml = (nombre: string) => {
    const contenido = zip.get(nombre);
    if (!contenido) throw new Error(`Falta ${nombre} dentro del .xlsx.`);
    return contenido.toString("utf8");
  };

  const hoja = [...xml("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)]
    .map((etiqueta) => etiqueta[0])
    .find((etiqueta) => decodificar(/\bname="([^"]*)"/.exec(etiqueta)?.[1] ?? "") === nombreHoja);
  if (!hoja) throw new Error(`El archivo no tiene una hoja llamada "${nombreHoja}".`);
  const idRelacion = /\br:id="([^"]*)"/.exec(hoja)?.[1];
  const relacion = [...xml("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)]
    .map((etiqueta) => etiqueta[0])
    .find((etiqueta) => /\bId="([^"]*)"/.exec(etiqueta)?.[1] === idRelacion);
  const destino = /\bTarget="([^"]*)"/.exec(relacion ?? "")?.[1] ?? "";
  const rutaHoja = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;

  const textos = zip.has("xl/sharedStrings.xml")
    ? [...xml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((item) => textoDe(item[1]))
    : [];

  const matriz: Celda[][] = [];
  for (const fila of xml(rutaHoja).matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas: Celda[] = [];
    for (const celda of fila[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = celda[1];
      const interior = celda[2] ?? "";
      const columna = numeroDeColumna(/\br="([A-Z]+)\d+"/.exec(atributos)?.[1] ?? "A");
      const tipo = /\bt="([^"]*)"/.exec(atributos)?.[1];
      const valor = /<v>([\s\S]*?)<\/v>/.exec(interior)?.[1];

      let resultado: Celda = null;
      if (tipo === "inlineStr") resultado = textoDe(interior);
      else if (valor === undefined) resultado = null;
      else if (tipo === "s") resultado = textos[Number(valor)] ?? "";
      else if (tipo === "str") resultado = decodificar(valor);
      else resultado = Number(valor);

      while (celdas.length < columna) celdas.push(null);
      celdas[columna] = resultado;
    }
    matriz[Number(fila[1]) - 1] = celdas;
  }
  for (let indice = 0; indice < matriz.length; indice += 1) matriz[indice] ??= [];
  return matriz;
};
