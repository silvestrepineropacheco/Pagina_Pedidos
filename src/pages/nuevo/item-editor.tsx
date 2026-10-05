import { ImageIcon, Trash2, X } from "lucide-react";
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
import { EQUIPMENT_REASONS, SPEC_FIELDS, UNITS, catalogItemLabel } from "@/lib/constants";
import type { CatalogItem, RequestCategory } from "@/lib/types";
import { URL_ERROR, isValidHttpUrl } from "@/lib/validation";
import { itemFromCatalog, type DraftItem } from "./draft-item";

const OTHER = "otro";
const UNSET = "__unset";

interface ItemEditorProps {
  index: number;
  item: DraftItem;
  category: RequestCategory;
  catalog: CatalogItem[];
  folder: string;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export const ItemEditor = ({
  index,
  item,
  category,
  catalog,
  folder,
  onChange,
  onRemove,
  canRemove,
}: ItemEditorProps) => {
  const urlInvalid = !isValidHttpUrl(item.suggested_url || null);
  const specFields = SPEC_FIELDS[category];

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-foreground">
          {category === "maquinaria" ? "Equipo solicitado" : `Artículo ${index + 1}`}
        </p>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            Quitar
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {category !== "maquinaria" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Producto</Label>
            <Select
              value={item.catalog_item_id ?? OTHER}
              onValueChange={(value) => {
                if (value === OTHER) {
                  onChange({ catalog_item_id: null });
                  return;
                }
                const found = catalog.find((entry) => entry.id === value);
                if (found) {
                  const fromCatalog = itemFromCatalog(found);
                  onChange({
                    catalog_item_id: found.id,
                    name: found.name,
                    description: found.description ?? "",
                    unit: found.unit ?? "unidades",
                    package_content: found.presentation ?? "",
                    specifications: fromCatalog.specifications,
                  });
                }
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
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`name-${item.key}`}>
            {category === "maquinaria" ? "Equipo o solución solicitada" : "Nombre del artículo"}
          </Label>
          <Input
            id={`name-${item.key}`}
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={
              category === "maquinaria"
                ? "Ej.: Selladora al vacío de doble cámara"
                : "Ej.: Guante descartable de nitrilo"
            }
          />
        </div>

        {specFields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`spec-${item.key}-${field.key}`}>{field.label}</Label>
            <Input
              id={`spec-${item.key}-${field.key}`}
              value={item.specifications?.[field.key] ?? ""}
              onChange={(event) =>
                onChange({
                  specifications: { ...item.specifications, [field.key]: event.target.value },
                })
              }
              placeholder={field.label}
            />
          </div>
        ))}

        {category === "indumentaria" ? (
          <>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select
                value={item.specifications?.motivo ?? UNSET}
                onValueChange={(value) =>
                  onChange({
                    specifications: {
                      ...item.specifications,
                      motivo: value === UNSET ? "" : value,
                    },
                  })
                }
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
              <Label htmlFor={`target-${item.key}`}>Persona destinataria o lugar de uso</Label>
              <Input
                id={`target-${item.key}`}
                value={item.specifications?.destinatario ?? ""}
                onChange={(event) =>
                  onChange({
                    specifications: { ...item.specifications, destinatario: event.target.value },
                  })
                }
                placeholder="Opcional"
              />
            </div>
          </>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`qty-${item.key}`}>Cantidad solicitada</Label>
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

        <div className="space-y-1.5">
          <Label>Unidad de pedido</Label>
          <Select value={item.unit || UNSET} onValueChange={(value) => onChange({ unit: value === UNSET ? "" : value })}>
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

        <div className="space-y-1.5">
          <Label htmlFor={`presentation-${item.key}`}>Contenido por presentación</Label>
          <Input
            id={`presentation-${item.key}`}
            value={item.package_content}
            onChange={(event) => onChange({ package_content: event.target.value })}
            placeholder="Ej.: caja de 100 guantes"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`stock-${item.key}`}>Stock disponible informado (opcional)</Label>
          <Input
            id={`stock-${item.key}`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={item.reported_stock}
            onChange={(event) => onChange({ reported_stock: event.target.value })}
            placeholder="Referencia del momento, no es inventario"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`price-${item.key}`}>Precio estimado unitario (opcional, ARS)</Label>
          <Input
            id={`price-${item.key}`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={item.unit_price_estimate}
            onChange={(event) => onChange({ unit_price_estimate: event.target.value })}
            placeholder="No es obligatorio"
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
          <Label htmlFor={`notes-${item.key}`}>Observaciones</Label>
          <Textarea
            id={`notes-${item.key}`}
            value={item.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="Detalles adicionales del artículo"
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
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ photo_path: null })}>
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
