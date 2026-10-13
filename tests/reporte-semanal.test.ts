import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  aNumero,
  calcularReporteSemanal,
  categoriaDe,
  formatoKg,
  formatoPesos,
  formatoPesosCorto,
  formatoVariacion,
  lecturasDelReporte,
  leerPedidos,
  normalizarTexto,
  semanaIso,
  semanasPorDefecto,
} from "../src/lib/reporte-semanal/index.ts";
import { leerHojaXlsx } from "./ayuda/leer-xlsx.ts";

// Copia de la planilla real. Está en .gitignore: no se sube al repositorio.
const PLANILLA = path.join(import.meta.dirname, "..", "datos-prueba", "PEDIDOS_2026.xlsx");

if (!existsSync(PLANILLA)) {
  throw new Error(`Falta la planilla de prueba en ${PLANILLA}. Copiala ahí para correr los tests.`);
}

const { lineas } = leerPedidos(leerHojaXlsx(PLANILLA, "PEDIDOS"));
const reporte = calcularReporteSemanal(lineas, { semanaA: 37, semanaB: 38 });

const entero = (valor: number) => Math.round(valor);
const claves = (nombres: string[]) => nombres.map(normalizarTexto).sort();

describe("lectura de la hoja PEDIDOS", () => {
  it("ignora filas sin número de pedido y pedidos cancelados", () => {
    assert.ok(lineas.length > 0);
    assert.ok(lineas.every((linea) => linea.nroPedido !== ""));
    assert.ok(lineas.every((linea) => !normalizarTexto(linea.estado).startsWith("cancelado")));
  });

  it("cuenta los pedidos con estado vacío", () => {
    assert.ok(lineas.some((linea) => linea.estado === ""));
  });

  it("agrupa clientes sin distinguir mayúsculas, tildes ni espacios", () => {
    assert.equal(normalizarTexto("Artesanos del MAr"), normalizarTexto("  Artesanos  del Mar "));
    assert.equal(normalizarTexto("Durañona"), normalizarTexto("DURANONA"));
  });
});

describe("semanas", () => {
  it("un lunes de la semana 42 compara 41 contra 40", () => {
    const lunes = new Date(2026, 9, 12);
    assert.equal(semanaIso(lunes), 42);
    assert.deepEqual(semanasPorDefecto(lunes), { a: 40, b: 41 });
  });

  it("usa las semanas por defecto cuando no se eligen a mano", () => {
    const porDefecto = calcularReporteSemanal(lineas, { hoy: new Date(2026, 9, 12) });
    assert.deepEqual(porDefecto.semanas, { a: 40, b: 41 });
  });

  it("avisa si la semana siguiente a B no tiene pedidos", () => {
    assert.equal(reporte.avisos.some((aviso) => aviso.includes("no esté cerrada")), false);
    const abierta = calcularReporteSemanal(lineas, { semanaA: 40, semanaB: 41 });
    assert.equal(abierta.avisos.some((aviso) => aviso.includes("no esté cerrada")), true);
  });
});

describe("reporte semana 37 contra 38", () => {
  const { indicadores } = reporte;

  it("indicadores", () => {
    assert.equal(entero(indicadores.totalFacturado.a), 28_650_861);
    assert.equal(entero(indicadores.totalFacturado.b), 23_718_238);
    assert.equal(entero(indicadores.kg.a), 1_441);
    assert.equal(entero(indicadores.kg.b), 1_164);
    assert.deepEqual([indicadores.pedidos.a, indicadores.pedidos.b], [21, 11]);
    assert.deepEqual([indicadores.clientes.a, indicadores.clientes.b], [20, 11]);
  });

  it("ticket y precio promedio salen del total, los pedidos y los kg", () => {
    assert.equal(entero(indicadores.ticketPromedio.a), entero(28_650_861.46 / 21));
    assert.equal(entero(indicadores.precioPromedioKg.b), entero(23_718_238.3 / 1_164));
  });

  it("origen", () => {
    const pct = (nombre: string) => {
      const fila = reporte.origen.find((origen) => normalizarTexto(origen.origen) === normalizarTexto(nombre));
      return [fila?.a.pct, fila?.b.pct];
    };
    assert.deepEqual(pct("Producción"), [42.1, 57.3]);
    assert.deepEqual(pct("Stock Manila FrioD"), [41.6, 40.3]);
    assert.deepEqual(pct("Stock Manila Bari"), [16.4, 2.4]);
  });

  it("recurrentes y ocasionales", () => {
    const { recurrentes, ocasionales } = reporte.recurrentesVsOcasionales;
    assert.deepEqual(
      claves(recurrentes.clientes),
      claves(["Artesanos del Mar", "Beli Granato", "RES", "Sepulveda", "Tomaauita"]),
    );
    assert.deepEqual([entero(recurrentes.a), entero(recurrentes.b)], [9_855_253, 21_139_438]);
    assert.deepEqual([entero(ocasionales.a), entero(ocasionales.b)], [18_795_608, 2_578_800]);
    assert.deepEqual([ocasionales.clientesA.length, ocasionales.clientesB.length], [15, 6]);
  });

  it("top de clientes", () => {
    const [primeroA] = reporte.clientes.topA;
    const [primeroB] = reporte.clientes.topB;
    assert.equal(normalizarTexto(primeroA.cliente), normalizarTexto("Drigne SRL"));
    assert.equal(entero(primeroA.total), 7_600_000);
    assert.equal(normalizarTexto(primeroB.cliente), normalizarTexto("Artesanos del Mar"));
    assert.equal(entero(primeroB.total), 7_332_500);
    assert.equal(reporte.clientes.topA.length, 5);
    assert.equal(reporte.clientes.soloEnA.length, 15);
    assert.equal(reporte.clientes.soloEnB.length, 6);
    assert.equal(reporte.clientes.recurrentes.length, 5);
  });

  it("contexto: promedio de las semanas 32 a 37", () => {
    assert.deepEqual(reporte.contexto.semanasDelPromedio, [32, 33, 34, 35, 36, 37]);
    assert.equal(entero(reporte.contexto.promedioSemanasAnteriores), 43_453_909);
    assert.equal(reporte.contexto.ultimasSemanas.length, 10);
    assert.equal(reporte.contexto.ultimasSemanas.at(-1)?.semana, 38);
  });

  it("no hay pedidos excepcionales en 37 ni en 38", () => {
    assert.deepEqual(reporte.pedidosExcepcionales.a, []);
    assert.deepEqual(reporte.pedidosExcepcionales.b, []);
  });

  it("las categorías suman el total de cada semana", () => {
    const suma = (semana: "a" | "b") =>
      reporte.categorias.filas.reduce((total, fila) => total + fila[semana], 0);
    assert.equal(entero(suma("a")), 28_650_861);
    assert.equal(entero(suma("b")), 23_718_238);
  });

  it("el resultado se puede guardar como JSON", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(reporte)), reporte);
  });
});

describe("pedidos excepcionales", () => {
  it("en la semana 41 el pedido 01-430 es el 78% de la semana", () => {
    const semana41 = calcularReporteSemanal(lineas, { semanaA: 40, semanaB: 41 });
    const [pedido] = semana41.pedidosExcepcionales.b;
    assert.equal(semana41.pedidosExcepcionales.b.length, 1);
    assert.equal(pedido.nroPedido, "01-430");
    assert.equal(entero(pedido.pctDeLaSemana), 78);
  });

  it("el umbral es un parámetro", () => {
    const exigente = calcularReporteSemanal(lineas, { semanaA: 40, semanaB: 41, umbralExcepcionalPct: 80 });
    assert.deepEqual(exigente.pedidosExcepcionales.b, []);
    const flexible = calcularReporteSemanal(lineas, { semanaA: 37, semanaB: 38, umbralExcepcionalPct: 25 });
    assert.ok(flexible.pedidosExcepcionales.a.length > 0);
  });
});

describe("categorías de producto", () => {
  it("aplica la primera regla que coincide, sin distinguir mayúsculas", () => {
    assert.equal(categoriaDe("Lata Paté de Salmon Ahumado"), "Latas");
    assert.equal(categoriaDe("AHUMADA GRANDE"), "Ahumado");
    assert.equal(categoriaDe("Filet Fresco PBO Trim D +600"), "Filet Trim D");
    assert.equal(categoriaDe("FTD PBO 600/800"), "Filet Trim D");
    assert.equal(categoriaDe("Trucha Desespinada Congelada 250-300"), "Trucha Desespinada");
    assert.equal(categoriaDe("BF Fresca"), "BF (bife de trucha)");
    assert.equal(categoriaDe("hon"), "Trucha entera (HON)");
    assert.equal(categoriaDe("Trucha eviscerada fresca"), "Trucha entera (HON)");
    assert.equal(categoriaDe("FTC IVP 200/300"), "Filet Trim C");
    assert.equal(categoriaDe("Trucha Filet Fresca - PBO - Trim C (600-UP)"), "Filet Trim C");
    assert.equal(categoriaDe("Filet fresco PBI"), "Filet fresco PBI/PBO");
    assert.equal(categoriaDe("Algo que no existe"), "Otros");
  });
});

describe("planilla con los valores formateados como texto (Google Sheets)", () => {
  it("lee importes y cantidades en formato argentino", () => {
    assert.equal(aNumero("$ 1.234.567,50"), 1234567.5);
    assert.equal(aNumero("1.441"), 1441);
    assert.equal(aNumero("28.650.861"), 28650861);
    assert.equal(aNumero("94,21"), 94.21);
    assert.equal(aNumero("63.5"), 63.5);
    assert.equal(aNumero(""), 0);
  });

  it("da los mismos números que con el Excel", () => {
    const formato = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });
    const comoTexto = leerHojaXlsx(PLANILLA, "PEDIDOS").map((fila) =>
      fila.map((celda) => (typeof celda === "number" ? formato.format(celda) : (celda ?? ""))),
    );
    const desdeTexto = calcularReporteSemanal(leerPedidos(comoTexto).lineas, { semanaA: 37, semanaB: 38 });
    assert.deepEqual(desdeTexto, reporte);
  });

  it("avisa con un error claro si se renombra una columna", () => {
    const matriz = leerHojaXlsx(PLANILLA, "PEDIDOS").map((fila) =>
      fila.map((celda) => (celda === "TOTAL Pedido" ? "Importe" : celda)),
    );
    assert.throws(() => leerPedidos(matriz), /faltan estas columnas: total pedido/);
  });

  it("sigue funcionando si se mueve una columna", () => {
    const matriz = leerHojaXlsx(PLANILLA, "PEDIDOS").map((fila) => {
      const copia = Array.from({ length: 23 }, (_, indice) => fila[indice] ?? null);
      [copia[3], copia[5]] = [copia[5], copia[3]];
      return copia;
    });
    const movida = calcularReporteSemanal(leerPedidos(matriz).lineas, { semanaA: 37, semanaB: 38 });
    assert.deepEqual(movida, reporte);
  });
});

describe("formato argentino", () => {
  it("pesos, kilos y porcentajes", () => {
    assert.equal(formatoPesos(28650861.46), "$28.650.861");
    assert.equal(formatoKg(1441), "1.441 kg");
    assert.equal(formatoVariacion(-17.2), "-17,2%");
    assert.equal(formatoVariacion(58), "+58,0%");
    assert.equal(formatoVariacion(null), "—");
  });
});

describe("explicaciones en palabras", () => {
  const lecturas = lecturasDelReporte(reporte);

  it("el resumen cuenta la venta y la variación con los números del reporte", () => {
    assert.match(lecturas.resumen[0], /\$23\.718\.238/);
    assert.match(lecturas.resumen[0], /bajó 17,2%/);
    assert.match(lecturas.resumen[0], /\$28\.650\.861/);
    assert.match(lecturas.contexto, /\$43\.453\.909/);
    assert.match(lecturas.contexto, /por debajo/);
  });

  it("explica que la caída vino de los ocasionales y que no repetir no es perderse", () => {
    assert.match(lecturas.recurrentes, /5 clientes compraron en las dos semanas/);
    assert.match(lecturas.recurrentes, /caída de la semana se explica sobre todo por los clientes ocasionales/);
    assert.match(lecturas.clientes, /no significa que se hayan perdido/);
  });

  it("solo menciona pedidos excepcionales cuando los hay", () => {
    assert.equal(lecturas.excepcionales, null);
    const semana41 = lecturasDelReporte(calcularReporteSemanal(lineas, { semanaA: 40, semanaB: 41 }));
    assert.match(semana41.excepcionales ?? "", /01-430/);
  });

  it("abrevia los importes para los gráficos", () => {
    assert.equal(formatoPesosCorto(28650861), "$28,7 M");
    assert.equal(formatoPesosCorto(254800), "$255 mil");
    assert.equal(formatoPesosCorto(0), "$0");
  });
});
