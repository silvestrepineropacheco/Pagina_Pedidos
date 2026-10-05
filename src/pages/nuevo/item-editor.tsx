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
  sizesTotal,
  type DraftItem,
} from "./draft-item";
import { suggestedSizes } from "./sizes";

const OTHER = "otro";
const UNSET = "__unset";

interface PickerProps {
  item: DraftItem;
  catalog: CatalogItem[];
  onPick: (found: CatalogItem | null) => void;
  onNameChange: (name: string) => void;
  nameLabel?: string;
  namePlaceholder?: string;
}

const ProductPicker = ({
  item,
  catalog,
  onPick,
  onNameChange,
  nameLabel = "Nombre del artículo",
  namePlaceholder = "Ej.: Guante descartable de nitrilo",
}: PickerProps) => (
  <>
    <div className="space-y-1.5 sm:col-span-2">
      <Label>Producto</Label>
      <Select
        value={item.catalog_item_id ?? OTHER}
        onValueChange={(value) => {
          if (value === OTHER) {
            onPick(null);
            return;
          }
          const found = catalog.find((entry) => entry.id === value);
          if (found) onPick(found);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Elegí un producto del catálogo" />
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
    </div>

    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={`name-${item.key}`}>{nameLabel}</Label>
      <Input
        id={`name-${item.key}`}
        value={item.name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder={namePlaceholder}
      />
    </div>
  </>
);

interface EditorProps {
  index: number;
  item: DraftItem;
  catalog: CatalogItem[];
  folder: string;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

const UnitSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (unit: string) => void;
}) => (
  <div className="space-y-1.5">
    <Label>Unidad de pedido</Label>
    <Select value={value || UNSET} onValueChange={(next) => onChange(next === UNSET ? "" : next)}>
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
);

/* ----------------------------- Insumos de producción ----------------------------- */
/* Lo mínimo necesario: qué producto y cuánto. */

export const SimpleItemEditor = ({
  index,
  item,
  catalog,
  onChange,
  onRemove,
  canRemove,
}: EditorProps) => {
  const urlInvalid = !isValidHttpUrl(item.suggested_url || null);

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
        <ProductPicker
          item={item}
          catalog={catalog}
          onPick={(found) =>
            found
              ? onChange({
                  catalog_item_id: found.id,
                  name: found.name,
                  unit: found.unit ?? "unidades",
                })
              : onChange({ catalog_item_id: null, name: "" })
          }
          onNameChange={(name) => onChange({ name })}
        />

        <div className="space-y-1.5">
          <Label htmlFor={`qty-${item.key}`}>Cantidad</Label>
          <Input
            id={`qty-${item.key}`}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={item.requested_qty}
            onChange={(event) => onChange({ requested_qty: event.target.value })}
          />
        </div>

        <UnitSelect value={item.unit} onChange={(unit) => onChange({ unit })} />

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`notes-${item.key}`}>Observaciones (opcional)</Label>
          <Input
            id={`notes-${item.key}`}
            value={item.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="Opcional"
          />
        </div>

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
      </div>
    </div>
  );
};

/* ------------------------ Indumentaria y equipamiento ------------------------ */
/* Un artículo por producto, con las cantidades repartidas por talle o medida. */

export const SizedItemEditor = ({
  index,
  item,
  catalog,
  folder,
  onChange,
  onRemove,
  canRemove,
}: EditorProps) => {
  const urlInvalid = !isValidHttpUrl(item.suggested_url || null);
  const total = sizesTotal(item.sizes);

  const applySuggestions = (productName: string) =>
    onChange({
      sizes: suggestedSizes(productName).map((label) => createSizeRow(label, "")),
    });

  const updateSize = (rowKey: string, patch: { label?: string; qty?: string }) =>
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
        <ProductPicker
          item={item}
          catalog={catalog}
          nameLabel="Producto o prenda"
          namePlaceholder="Ej.: Botas de goma de seguridad"
          onPick={(found) =>
            found
              ? onChange({
                  catalog_item_id: found.id,
                  name: found.name,
                  unit: found.unit ?? "unidades",
                  sizes: suggestedSizes(found.name).map((label) => createSizeRow(label, "")),
                })
              : onChange({
                  catalog_item_id: null,
                  name: "",
                  sizes: suggestedSizes("").map((label) => createSizeRow(label, "")),
                })
          }
          onNameChange={(name) => onChange({ name })}
        />

        <UnitSelect value={item.unit} onChange={(unit) => onChange({ unit })} />

        <div className="space-y-2 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Cantidad por talle o medida</Label>
            <span className="text-xs text-muted-foreground">
              Total: <strong>{formatQty(total)}</strong> {item.unit}
            </span>
          </div>

          {item.sizes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              Elegí un producto para que aparezcan los talles, o agregá uno manualmente.
            </p>
          ) : (
            <div className="space-y-2">
              {item.sizes.map((row) => (
                <div key={row.key} className="flex items-center gap-2">
                  <Input
                    value={row.label}
                    onChange={(event) => updateSize(row.key, { label: event.target.value })}
                    placeholder="Talle o medida"
                    className="flex-1"
                    aria-label="Talle o medida"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(event) => updateSize(row.key, { qty: event.target.value })}
                    placeholder="Cant."
                    className="w-24"
                    aria-label={`Cantidad para ${row.label || "el talle"}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar este talle"
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
              Agregar otro talle o medida
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applySuggestions(item.name)}
            >
              Volver a sugerir talles
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cargá solo los talles que necesitás: los que queden sin cantidad no se envían.
          </p>
        </div>

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
          <Label htmlFor={`target-${item.key}`}>Persona destinataria o lugar de uso (opcional)</Label>
          <Input
            id={`target-${item.key}`}
            value={item.destinatario}
            onChange={(event) => onChange({ destinatario: event.target.value })}
            placeholder="Opcional"
          />
        </div>

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
          <Textarea
            id={`notes-${item.key}`}
            value={item.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="Opcional"
          />
        </div>

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
      </div>
    </div>
  );
};
