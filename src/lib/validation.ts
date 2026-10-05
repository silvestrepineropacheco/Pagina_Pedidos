export const isValidHttpUrl = (value?: string | null): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const URL_ERROR = "El enlace debe empezar con http:// o https://";

export const isPositiveNumber = (value: unknown): boolean => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

export const isEmpty = (value?: string | null): boolean => !value || value.trim().length === 0;

export const requiredError = (label: string) => `${label} es obligatorio`;
