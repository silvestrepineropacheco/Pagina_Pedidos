export const isValidHttpUrl = (value?: string | null): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Normaliza un enlace escrito a mano. El enlace es SIEMPRE opcional: esto solo
 * completa el "https://" cuando la persona escribió el dominio pelado.
 * Devuelve null cuando está vacío o cuando no se puede usar como enlace.
 */
const DOMAIN_PATTERN = /^[\w-]+(\.[\w-]+)+([/?#].*)?$/i;

export const normalizeUrl = (value?: string | null): string | null => {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return isValidHttpUrl(raw) ? raw : null;
  if (DOMAIN_PATTERN.test(raw)) {
    const candidate = `https://${raw}`;
    return isValidHttpUrl(candidate) ? candidate : null;
  }
  return null;
};

/** Aviso (no bloqueante) para mostrar debajo del campo de enlace. */
export const URL_WARNING = "El enlace no parece válido: se va a guardar sin enlace.";

export const urlHint = (value?: string | null): { text: string; tone: "info" | "warning" } | null => {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const normalized = normalizeUrl(raw);
  if (!normalized) return { text: URL_WARNING, tone: "warning" };
  return normalized === raw ? null : { text: `Se guardará como ${normalized}`, tone: "info" };
};

export const isPositiveNumber = (value: unknown): boolean => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

export const isEmpty = (value?: string | null): boolean => !value || value.trim().length === 0;

export const requiredError = (label: string) => `${label} es obligatorio`;
