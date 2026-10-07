/**
 * Traduce errores técnicos (en inglés y de base de datos) a mensajes claros en
 * español para mostrar al usuario. El detalle técnico se conserva en la consola
 * para poder diagnosticar sin exponerlo en pantalla.
 */
const RULES: [RegExp, string][] = [
  [
    /row-level security|permission denied|42501/i,
    "No tenés permiso para hacer esta operación. Si el problema continúa, contactá a un administrador.",
  ],
  [
    /duplicate key|unique constraint|23505|ya esta asignada/i,
    "Ese registro ya existe, no se duplicó nada.",
  ],
  [
    /not-null|null value in column|23502/i,
    "Falta completar un dato obligatorio del pedido.",
  ],
  [
    /check constraint|23514/i,
    "Algún dato tiene un formato que no se puede guardar. Revisá las cantidades y las fechas.",
  ],
  [
    /foreign key|23503/i,
    "Falta un dato relacionado (por ejemplo, el producto del catálogo). Probá elegirlo de nuevo.",
  ],
  [
    /failed to fetch|networkerror|network error|ERR_NETWORK/i,
    "No pudimos comunicarnos con el servidor. Revisá tu conexión e intentá de nuevo.",
  ],
  [
    /jwt|token|refresh|sesión|session/i,
    "Tu sesión venció. Volvé a ingresar para continuar.",
  ],
  [
    /JSON object requested|multiple \(or no\) rows/i,
    "No encontramos el registro. Puede haber sido cambiado por otra persona: recargá la pantalla.",
  ],
];

const TECHNICAL_PREFIX = "[detalle técnico]";

export const friendlyError = (error: unknown, fallback: string): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? "");

  // El detalle queda en la consola para diagnóstico.
  console.error(TECHNICAL_PREFIX, raw);

  for (const [pattern, message] of RULES) {
    if (pattern.test(raw)) return message;
  }
  return fallback;
};

/** Mensaje único para el guardado de pedidos: tranquiliza y no pierde los datos. */
export const SAVE_ERROR_MESSAGE =
  "No pudimos guardar el pedido. Tus datos siguen en el formulario. Intentá nuevamente o contactá a un administrador.";
