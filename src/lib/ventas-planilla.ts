import { supabase } from "@/integrations/supabase/client";
import { FUNCTION_NAME } from "@/lib/integrations";
import { leerPedidos } from "@/lib/reporte-semanal";
import type { Celda, LecturaPedidos } from "@/lib/reporte-semanal";

interface RespuestaPlanilla {
  ok?: boolean;
  spreadsheet_id?: string;
  values?: Celda[][];
  error?: string;
  needs_config?: boolean;
}

/** Error con un mensaje listo para mostrar en pantalla. */
export class ErrorDePlanilla extends Error {
  faltaConfigurar: boolean;

  constructor(mensaje: string, faltaConfigurar = false) {
    super(mensaje);
    this.name = "ErrorDePlanilla";
    this.faltaConfigurar = faltaConfigurar;
  }
}

const respuestaDeError = async (error: unknown): Promise<RespuestaPlanilla> => {
  const contexto = (error as { context?: Response })?.context;
  if (contexto && typeof contexto.json === "function") {
    try {
      return (await contexto.json()) as RespuestaPlanilla;
    } catch {
      return {};
    }
  }
  return {};
};

/**
 * Lee la versión actual de la hoja PEDIDOS desde Google Sheets (solo lectura).
 * La lectura pasa por el servidor: las credenciales de Google nunca llegan al navegador.
 *
 * Si se pasa un enlace, el servidor lo recuerda y las próximas lecturas no lo necesitan.
 */
export const leerPlanillaDePedidos = async (enlace?: string): Promise<LecturaPedidos> => {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action: "read_sales_orders", spreadsheet: enlace?.trim() || undefined },
    headers: { "Content-Type": "application/json" },
  });

  if (error) {
    const detalle = await respuestaDeError(error);
    console.error("[planilla de pedidos] error técnico:", error, detalle);
    // La versión anterior de la función no conoce esta acción y pide un pedido de compra.
    if (detalle.error === "Falta el pedido.") {
      throw new ErrorDePlanilla(
        "El servidor todavía no tiene la lectura de la planilla: falta actualizar la función en Enter.pro.",
      );
    }
    throw new ErrorDePlanilla(
      detalle.error ?? "No se pudo leer la planilla de pedidos. Intentá de nuevo.",
      Boolean(detalle.needs_config),
    );
  }

  const respuesta = (data ?? {}) as RespuestaPlanilla;
  const valores = respuesta.values ?? [];
  if (valores.length === 0) {
    throw new ErrorDePlanilla("La planilla se pudo abrir pero la hoja PEDIDOS llegó vacía.");
  }

  try {
    return leerPedidos(valores);
  } catch (lectura) {
    // La planilla cambió de forma: se avisa en vez de calcular mal.
    throw new ErrorDePlanilla(
      `La planilla cambió de forma y no se puede calcular el reporte. ${(lectura as Error).message}`,
    );
  }
};
