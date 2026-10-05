import { DEFAULT_CURRENCY, TIMEZONE } from "./constants";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIMEZONE,
});

/** Fecha (DD/MM/AAAA) a partir de un date o timestamp ISO. */
export const formatDate = (value?: string | null): string => {
  if (!value) return "—";
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return "—";
  }
};

/** Fecha y hora (DD/MM/AAAA HH:mm) en horario de Buenos Aires. */
export const formatDateTime = (value?: string | null): string => {
  if (!value) return "—";
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch {
    return "—";
  }
};

/** Fecha de hoy (YYYY-MM-DD) en horario de Buenos Aires. */
export const todayInTimeZone = (): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
};

export const formatCurrency = (value?: number | null, currency = DEFAULT_CURRENCY): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency || DEFAULT_CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
};

export const formatQty = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(value));
};

export const formatQtyWithUnit = (value?: number | null, unit?: string | null): string => {
  const qty = formatQty(value);
  return unit ? `${qty} ${unit}` : qty;
};

export const daysSince = (value?: string | null): number | null => {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
};

export const isOverdue = (value?: string | null): boolean => {
  if (!value) return false;
  return value < todayInTimeZone();
};

export const initials = (name?: string | null): string => {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
};
