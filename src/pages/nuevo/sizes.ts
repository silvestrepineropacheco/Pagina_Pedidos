/**
 * Talles y medidas sugeridas para indumentaria y equipamiento.
 * Se generan a partir del nombre del producto: si la persona elige "Botas",
 * aparecen los talles de calzado listos para cargar cantidades.
 */
const FOOTWEAR = ["34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];
const GLOVES = ["S", "M", "L", "XL"];
const LETTERS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const NUMBERS = ["38", "40", "42", "44", "46", "48", "50", "52", "54"];

export const suggestedSizes = (productName?: string | null): string[] => {
  const name = (productName ?? "").toLowerCase();

  if (/(bota|borcego|calzado|zapato|zapatilla|alpargata)/.test(name)) {
    return FOOTWEAR.map((size) => `Talle ${size}`);
  }
  if (/(guante)/.test(name)) {
    return GLOVES.map((size) => `Talle ${size}`);
  }
  if (/(camisa|uniforme|pantal|buzo|campera|chomba|ropa|ambo|jardinero|delantal)/.test(name)) {
    return LETTERS;
  }
  if (/(casco|arnes|arnés|protector|antiparra|barbijo|mascara|máscara)/.test(name)) {
    return ["Talle único"];
  }
  // Genérico: letras habituales de indumentaria más la opción de talle único.
  return [...LETTERS, "Talle único"];
};

export const ALL_SUGGESTIONS = [...FOOTWEAR.map((s) => `Talle ${s}`), ...NUMBERS.map((s) => `Talle ${s}`), ...LETTERS, "Talle único"];
