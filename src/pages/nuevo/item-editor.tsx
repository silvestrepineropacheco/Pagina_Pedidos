import { ImageIcon, Plus, Trash2, X } from "lucide-react";
import { AttachmentLink, AttachmentUpload } from "@/components/attachments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EQUIPMENT_REASONS, UNITS, catalogItemLabel } from "@/lib/constants";
import { formatQty } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";
import { URL_ERROR, isValidHttpUrl } from "@/lib/validation";
import {
  createSizeRow,
  insumoRowsFromCatalog,
  sizesTotal,
  type DraftItem,
} from "./draft-item";
import { suggestedSizes } from "./sizes";

const OTHER = "otro";
const UNSET = "__unset";

export type ItemVariant = "insumos" | "indumentaria";

interface ItemEditorProps {
  index: number;
  item: DraftItem;
  /** Insumos: medida o presentación. Indumentaria: talle o medida. */
  variant: ItemVariant;
  catalog: CatalogItem[];
  folder: string;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export const ItemEditor = ({
  index,
  item,
  variant,
  catalog,
  folder,
  onChange,
  onRemove,
  canRemove,
}: ItemEditorProps) => {
  const isClothing = variant === "indumentaria";
  const urlInvalid = !isValidHttpUrl(item.suggested_url || null);
  const total = sizesTotal(item.sizes);

  const rowWord = isClothing ? "talle o medida" : "medida o presentación";
  const rowPlaceholder = isClothing ? "Talle o medida" : "Medida o presentación";

  const handlePick = (found: CatalogItem | null) => {
    if (!found) {
      // "Otro artículo": se escribe a mano.
      onChange({
        catalog_item_id: null,
        name: "",
        sizes: isClothing
          ? suggestedSizes("").map((label) => createSizeRow(label, ""))
          : [createSizeRow("", "")],
      });
      return;
    }
    onChange({
      catalog_item_id: found.id,
      name: found.name,
      unit: found.unit ?? "unidades",
      // Cada categoría sugiere solo lo suyo: talles para indumentaria,
      // presentación o medida para insumos.
      sizes: isClothing
        ? suggestedSizes(found.name).map((label) => createSizeRow(label, ""))
        : insumoRowsFromCatalog(found),
    });
  };

  const updateRow = (rowKey: string, patch: { label?: string; qty?: string }) =>
    onChange({
      sizes: item.sizes.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
    });

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground">Artículo {index + 1}</p>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            Quitar
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Producto</Label>
          <Select
            value={item.catalog_item_id ?? OTHER}
            onValueChange={(value) => {
              if (value === OTHER) {
                handlePick(null);
                return;
              }
              const found = catalog.find((entry) => entry.id === value);
              if (found) handlePick(found);
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  isClothing
                    ? "Elegí una prenda o equipo del catálogo"
                    : "Elegí un insumo del catálogo"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OTHER}>Otro artículo (no está en el catálogo)</SelectItem>
              {catalog
                .filter((entry) => entry.active)
                .map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {catalogItemLabel(entry)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {catalog.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Todavía no hay productos de esta categoría en el catálogo. Podés usar “Otro artículo”,
              y un administrador puede cargarlos en <strong>Catálogo</strong>.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`name-${item.key}`}>
            {isClothing ? "Producto o prenda" : "Nombre del artículo"}
          </Label>
          <Input
            id={`name-${item.key}`}
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={
              isClothing ? "Ej.: Botas de goma de seguridad" : "Ej.: Caja de cartón 40x30x30"
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label>Unidad de pedido</Label>
          <Select
            value={item.unit || UNSET}
            onValueChange={(next) => onChange({ unit: next === UNSET ? "" : next })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Elegí una unidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Sin unidad</SelectItem>
              {UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Cantidad por {rowWord}</Label>
            <span className="text-xs text-muted-foreground">
              Total: <strong>{formatQty(total)}</strong> {item.unit}
            </span>
          </div>

          {item.sizes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              Elegí un producto para que aparezcan las opciones, o agregá una a mano.
            </p>
          ) : (
            <div className="space-y-2">
              {item.sizes.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <Input
                    value={row.label}
                    onChange={(event) => updateRow(row.key, { label: event.target.value })}
                    placeholder={rowPlaceholder}
                    className="flex-1"
                    aria-label={rowPlaceholder}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(event) => updateRow(row.key, { qty: event.target.value })}
                    placeholder="Cant."
                    className="w-24"
                    aria-label={`Cantidad para ${row.label || rowWord}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar este ${rowWord}`}
                    onClick={() =>
                      onChange({ sizes: item.sizes.filter((entry) => entry.key !== row.key) })
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ sizes: [...item.sizes, createSizeRow()] })}
            >
              <Plus className="h-4 w-4" />
              {isClothing ? "Agregar otro talle o medida" : "Agregar otra medida o presentación"}
            </Button>
            {isClothing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    sizes: suggestedSizes(item.name).map((label) => createSizeRow(label, "")),
                  })
                }
              >
                Volver a sugerir talles
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Cargá solo lo que necesitás: las filas sin cantidad no se envían.
          </p>
        </div>

        {isClothing ? (
          <>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select
                value={item.motivo || UNSET}
                onValueChange={(value) => onChange({ motivo: value === UNSET ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Sin especificar</SelectItem>
                  {EQUIPMENT_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`target-${item.key}`}>
                Persona destinataria o lugar de uso (opcional)
              </Label>
              <Input
                id={`target-${item.key}`}
                value={item.destinatario}
                onChange={(event) => onChange({ destinatario: event.target.value })}
                placeholder="Opcional"
              />
            </div>
          </>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`url-${item.key}`}>Enlace del producto sugerido (opcional)</Label>
          <Input
            id={`url-${item.key}`}
            value={item.suggested_url}
            onChange={(event) => onChange({ suggested_url: event.target.value })}
            placeholder="https://..."
            aria-invalid={urlInvalid}
          />
          {urlInvalid ? <p className="text-xs text-destructive">{URL_ERROR}</p> : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`notes-${item.key}`}>Observaciones (opcional)</Label>
          {isClothing ? (
            <Textarea
              id={`notes-${item.key}`}
              value={item.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              placeholder="Opcional"
            />
          ) : (
            <Input
              id={`notes-${item.key}`}
              value={item.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              placeholder="Opcional"
            />
          )}
        </div>

        {isClothing ? (
          <div className="space-y-2 sm:col-span-2">
            <Label>Foto o adjunto (opcional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <AttachmentUpload
                folder={folder}
                label={item.photo_path ? "Reemplazar foto" : "Adjuntar foto"}
                onUploaded={(path) => onChange({ photo_path: path })}
                disabled={!folder}
              />
              {item.photo_path ? (
                <>
                  <AttachmentLink path={item.photo_path} label="Ver foto" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ photo_path: null })}
                  >
                    <X className="h-4 w-4" />
                    Quitar
                  </Button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Imágenes o PDF, hasta 10 MB
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
