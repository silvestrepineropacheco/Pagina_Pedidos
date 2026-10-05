import { formatQty } from "@/lib/format";
import type { SavedSize } from "@/lib/sizes";

/** Detalle de cantidades por talle o medida de un artículo. */
export const SizeBreakdown = ({ entries }: { entries: SavedSize[] }) => {
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + entry.cantidad, 0);
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-2">
      <p className="text-xs font-medium text-muted-foreground">
        Cantidades por talle o medida (total {formatQty(total)})
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {entries.map((entry) => (
          <span key={`${entry.talle}-${entry.cantidad}`} className="text-xs text-foreground">
            {entry.talle}: <strong>{formatQty(entry.cantidad)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
};
