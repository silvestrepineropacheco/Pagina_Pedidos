import { useMemo, useState } from "react";
import { Info, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { ToneBadge } from "@/components/badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCatalog } from "@/hooks/use-reference-data";
import { CATEGORIES, UNITS } from "@/lib/constants";
import { URL_WARNING, normalizeUrl, urlHint } from "@/lib/validation";
import type { CatalogItem, RequestCategory } from "@/lib/types";

interface FormState {
  id?: string;
  name: string;
  category: RequestCategory;
  description: string;
  variant: string;
  unit: string;
  presentation: string;
  image_url: string;
  usual_supplier: string;
  usual_url: string;
}

const emptyForm = (): FormState => ({
  name: "",
  category: "insumos",
  description: "",
  variant: "",
  unit: "unidades",
  presentation: "",
  image_url: "",
  usual_supplier: "",
  usual_url: "",
});

const CatalogPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useCatalog();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((item) =>
      [item.name, item.variant, item.presentation, item.usual_supplier]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data, search]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["catalog"] });
  };

  const openEdit = (item: CatalogItem) =>
    setForm({
      id: item.id,
      name: item.name,
      category: item.category,
      description: item.description ?? "",
      variant: item.variant ?? "",
      unit: item.unit ?? "",
      presentation: item.presentation ?? "",
      image_url: item.image_url ?? "",
      usual_supplier: item.usual_supplier ?? "",
      usual_url: item.usual_url ?? "",
    });

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || null,
        variant: form.variant.trim() || null,
        unit: form.unit.trim() || null,
        presentation: form.presentation.trim() || null,
        image_url: normalizeUrl(form.image_url),
        usual_supplier: form.usual_supplier.trim() || null,
        usual_url: normalizeUrl(form.usual_url),
        updated_at: new Date().toISOString(),
      };
      if (form.id) {
        const { error: updateError } = await supabase
          .from("catalog_items")
          .update(payload)
          .eq("id", form.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase.from("catalog_items").insert(payload);
        if (insertError) throw new Error(insertError.message);
      }
      await refresh();
      toast({ title: form.id ? "Producto actualizado" : "Producto agregado al catálogo" });
      setForm(null);
    } catch (saveError) {
      toast({
        title: "No se pudo guardar el producto",
        description: saveError instanceof Error ? saveError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CatalogItem) => {
    try {
      const { error: updateError } = await supabase
        .from("catalog_items")
        .update({ active: !item.active, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (updateError) throw new Error(updateError.message);
      await refresh();
      toast({
        title: item.active ? "Producto desactivado" : "Producto reactivado",
        description: "El historial se conserva.",
      });
    } catch (toggleError) {
      toast({
        title: "No se pudo cambiar el estado",
        description: toggleError instanceof Error ? toggleError.message : undefined,
        variant: "destructive",
      });
    }
  };

  const renderItem = (item: CatalogItem) => (
    <Card key={item.id} className="shadow-card">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.variant ? item.variant : "Sin variante"}
              {item.presentation ? ` · ${item.presentation}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {item.is_demo ? <ToneBadge tone="neutral">Demostrativo</ToneBadge> : null}
            <ToneBadge tone={item.active ? "success" : "danger"}>
              {item.active ? "Activo" : "Inactivo"}
            </ToneBadge>
          </div>
        </div>
        {item.description ? (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        ) : null}
        {item.usual_supplier ? (
          <p className="text-xs text-muted-foreground">Proveedor habitual: {item.usual_supplier}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(item)}>
            {item.active ? "Desactivar" : "Reactivar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Catálogo de productos"
        description="Está separado por categoría: cada producto aparece solo en la categoría a la que pertenece."
        actions={
          <Button onClick={() => setForm(emptyForm())}>
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-md bg-info-soft p-3 text-xs text-info-soft-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Los pedidos de <strong>insumos</strong> solo muestran productos de Insumos de producción, y
          los de <strong>indumentaria y equipamiento</strong> solo productos de esa categoría. Si un
          producto está en la sección equivocada, entrá en <strong>Editar</strong> y cambiá su
          categoría.
        </span>
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar producto"
        className="sm:max-w-sm"
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No hay productos en el catálogo"
          description="Agregá los productos que se compran habitualmente para facilitar las solicitudes."
        />
      ) : (
        <div className="space-y-6">
          {CATEGORIES.map((category) => {
            const group = filtered.filter((item) => item.category === category.value);
            return (
              <section key={category.value} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                  <h2 className="text-base font-semibold text-foreground">{category.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {group.length} {group.length === 1 ? "producto" : "productos"}
                  </span>
                </div>
                {group.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {search.trim()
                      ? "Ningún producto de esta categoría coincide con la búsqueda."
                      : "Todavía no hay productos en esta categoría."}
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">{group.map(renderItem)}</div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(form)} onOpenChange={(open) => (open ? undefined : setForm(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
            <DialogDescription>
              La categoría define en qué tipo de pedido aparece este producto.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="item_name">Nombre</Label>
                <Input
                  id="item_name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm({ ...form, category: value as RequestCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Select value={form.unit} onValueChange={(value) => setForm({ ...form, unit: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="variant">Variante, medida o talle</Label>
                <Input
                  id="variant"
                  value={form.variant}
                  onChange={(event) => setForm({ ...form, variant: event.target.value })}
                  placeholder="Ej.: 40x30x30 cm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="presentation">Presentación</Label>
                <Input
                  id="presentation"
                  value={form.presentation}
                  onChange={(event) => setForm({ ...form, presentation: event.target.value })}
                  placeholder="Ej.: fardo de 25 unidades"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier">Proveedor habitual (opcional)</Label>
                <Input
                  id="supplier"
                  value={form.usual_supplier}
                  onChange={(event) => setForm({ ...form, usual_supplier: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="usual_url">Enlace habitual (opcional)</Label>
                <Input
                  id="usual_url"
                  value={form.usual_url}
                  onChange={(event) => setForm({ ...form, usual_url: event.target.value })}
                  placeholder="Opcional: https://..."
                />
                {(() => {
                  const hint = urlHint(form.usual_url);
                  if (!hint) return null;
                  return (
                    <p
                      className={
                        hint.text === URL_WARNING
                          ? "text-xs text-warning-soft-foreground"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {hint.text}
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="image_url">Imagen (URL opcional)</Label>
                <Input
                  id="image_url"
                  value={form.image_url}
                  onChange={(event) => setForm({ ...form, image_url: event.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CatalogPage;
