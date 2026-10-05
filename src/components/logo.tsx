import { cn } from "@/lib/utils";

const LOGO_SRC = "/logo-manila.png";

/**
 * Logo de Manila Patagonia.
 *
 * La imagen tiene fondo transparente, así que sobre fondos oscuros se puede
 * mostrar en blanco sin perder las transparencias (el filtro solo cambia el
 * color, no la forma ni los bordes suavizados).
 */
export const Logo = ({
  onDark = false,
  className,
}: {
  onDark?: boolean;
  className?: string;
}) => (
  <img
    src={LOGO_SRC}
    alt="Manila Patagonia"
    className={cn("w-auto select-none object-contain", onDark && "brightness-0 invert", className)}
  />
);
