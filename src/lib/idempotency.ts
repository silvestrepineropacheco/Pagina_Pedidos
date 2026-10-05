/**
 * Clave de idempotencia por intento de operacion.
 *
 * Se genera una sola vez al abrir el formulario y se reutiliza en cada
 * reintento del mismo envio: si la operacion ya se registro, la base devuelve
 * el registro existente en lugar de crear otro (pedidos, compras, recepciones).
 */
export const createIdempotencyKey = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};
