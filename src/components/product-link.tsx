import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Boton "Abrir producto sugerido". Solo se renderiza para administradores.
 * El enlace del encargado y el enlace de la compra son campos distintos.
 */
export const ProductLinkButton = ({
  url,
  label = "Abrir producto sugerido",
}: {
  url?: string | null;
  label?: string;
}) => {
  if (!url) return null;
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
};

export const ProductLinkText = ({ url }: { url?: string | null }) => {
  if (!url) return <span className="text-xs text-muted-foreground">Sin enlace</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary underline-offset-2 hover:underline"
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      <span className="truncate">{url}</span>
    </a>
  );
};
