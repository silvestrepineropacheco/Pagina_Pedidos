import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2, Plus, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useAuth } from "@/hooks/auth-context";
import { useCatalog } from "@/hooks/use-reference-data";
import { useRequestBundle } from "@/hooks/use-requests";
import {
  createDraftRequest,
  deleteRequestItem,
  insertRequestItems,
  sendRequestEmails,
  submitRequest,
  updateRequest,
  updateRequestItem,
} from "@/lib/api";
import { CATEGORIES, MACHINERY_TYPES, UNITS, categoryLabel, labelOf } from "@/lib/constants";
import { formatQty } from "@/lib/format";
import { createIdempotencyKey } from "@/lib/idempotency";
import type { Priority, RequestCategory } from "@/lib/types";
import { ItemEditor } from "./item-editor";
import {
  createEmptyItem,
  filledSizes,
  readSpecificationText,
  sizeRowsFromSpecifications,
  type DraftItem,
} from "./draft-item";
import {
  emptyFormState,
  itemPayload,
  requestPatchFromState,
  type ItemPayload,
  type MachineryType,
  type RequestFormState,
  validateForm,
} from "./draft-state";

const CATEGORY_VALUES: RequestCategory[] = ["insumos", "indumentaria", "maquinaria"];

const RequestFormPage = () => {
  const { categoria } = useParams();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("borrador");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: bundle } = useRequestBundle(draftId ?? undefined);
  const { data: catalog } = useCatalog();

  const category = (CATEGORY_VALUES.includes(categoria as RequestCategory)
    ? categoria
    : "insumos") as RequestCategory;

  const [idempotencyKey] = useState(createIdempotencyKey);
  const [requestId, setRequestId] = useState<string | null>(draftId);
  const [state, setState] = useState<RequestFormState>(emptyFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bundle || !draftId) return;
    if (loadedRef.current === draftId) return;
    loadedRef.current = draftId;

    const { request, items } = bundle;
    const firstItem = items[0];

    setState((previous) => ({
      ...previous,
      neededBy: request.needed_by ?? "",
      priority: request.priority,
      urgencyReason: request.urgency_reason ?? "",
      notes: request.notes ?? "",
      machineryType: request.machinery_type ?? "nueva",
      equipmentName: request.equipment_name ?? "",
      problem: request.problem ?? "",
      expectedBenefit: request.expected_benefit ?? "",
      currentEquipment: request.current_equipment ?? "",
      technicalSpecs: request.technical_specs ?? "",
      estimatedPrice: request.estimated_price != null ? String(request.estimated_price) : "",
      machineryQty: firstItem ? String(firstItem.requested_qty) : "1",
      machineryUnit: firstItem?.unit ?? "unidades",
      items:
        category === "maquinaria" || items.length === 0
          ? [createEmptyItem()]
          : items.map((item) => ({
              key: item.id,
              id: item.id,
              catalog_item_id: item.catalog_item_id,
              name: item.name,
              requested_qty: String(item.requested_qty),
              unit: item.unit ?? "unidades",
              sizes: sizeRowsFromSpecifications(item.specifications),
              motivo: readSpecificationText(item.specifications, "motivo"),
              destinatario: readSpecificationText(item.specifications, "destinatario"),
              suggested_url: item.suggested_url ?? "",
              notes: item.notes ?? "",
              photo_path: item.photo_path,
            })),
    }));
  }, [bundle, draftId, category]);

  const uploadFolder = requestId ? `requests/${requestId}` : `drafts/${user?.id ?? "anonimo"}`;

  const updateItem = (index: number, patch: Partial<DraftItem>) =>
    setState((previous) => ({
      ...previous,
      items: previous.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));

  const persist = async (silent = false): Promise<string | null> => {
    if (!user) return null;
    const validation = validateForm(state, category);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      if (!silent) {
        toast({
          title: "Revisá el formulario",
          description: "Hay campos que necesitan corrección antes de continuar.",
          variant: "destructive",
        });
      }
      return null;
    }

    setSaving(true);
    try {
      const patch = requestPatchFromState(state, category);
      let id = requestId;

      if (!id) {
        const created = await createDraftRequest({
          ...patch,
          idempotency_key: idempotencyKey,
          requester_id: user.id,
          category,
        });
        id = created.id;
        setRequestId(id);
      } else {
        await updateRequest(id, patch);
      }

      const activeItems =
        category === "maquinaria"
          ? [
              {
                ...createEmptyItem(),
                name: state.equipmentName.trim(),
                requested_qty: state.machineryQty,
                unit: state.machineryUnit,
              },
            ]
          : state.items.filter((item) => item.name.trim().length > 0);

      const existingIds = new Set(activeItems.map((item) => item.id).filter(Boolean) as string[]);
      const toDelete = [
        ...removedItemIds,
        ...(bundle?.items ?? []).map((item) => item.id).filter((itemId) => !existingIds.has(itemId)),
      ];

      for (const itemId of new Set(toDelete)) {
        try {
          await deleteRequestItem(itemId);
        } catch {
          // El articulo puede tener compras asociadas: se conserva.
        }
      }

      const toInsert: (ItemPayload & { request_id: string })[] = [];
      for (let index = 0; index < activeItems.length; index += 1) {
        const item = activeItems[index];
        const payload = itemPayload(item, index, category);
        if (item.id) {
          await updateRequestItem(item.id, payload);
        } else {
          toInsert.push({ ...payload, request_id: id });
        }
      }
      if (toInsert.length > 0) {
        await insertRequestItems(toInsert);
      }

      await queryClient.invalidateQueries({ queryKey: ["requests"] });
      await queryClient.invalidateQueries({ queryKey: ["request-bundle", id] });
      setRemovedItemIds([]);
      return id;
    } catch (error) {
      toast({
        title: "No se pudo guardar",
        description: error instanceof Error ? error.message : "Intentá nuevamente.",
        variant: "destructive",
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    const id = await persist();
    if (!id) return;
    toast({ title: "Borrador guardado", description: "Podés seguir editándolo antes de enviarlo." });
    if (!draftId) navigate(`/nuevo/${category}?borrador=${id}`, { replace: true });
  };

  const handleConfirmSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      const id = await persist(true);
      if (!id) {
        setSummaryOpen(false);
        return;
      }
      await submitRequest(id);
      setSummaryOpen(false);

      try {
        const result = await sendRequestEmails(id);
        if (result.status === "pending_config") {
          toast({
            title: "Solicitud enviada",
            description:
              "Los avisos por correo quedaron pendientes de configuración. Los administradores ya la ven dentro de la aplicación.",
          });
        }
      } catch {
        toast({
          title: "Solicitud enviada",
          description:
            "No se pudieron procesar los avisos por correo. La solicitud quedó registrada y se puede reintentar el envío.",
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["requests"] });
      toast({ title: "Solicitud enviada", description: "Los administradores ya pueden revisarla." });
      navigate(`/pedidos/${id}`);
    } catch (error) {
      toast({
        title: "No se pudo enviar",
        description: error instanceof Error ? error.message : "Intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const validationPreview = validateForm(state, category);
  const hasErrors = Object.keys(validationPreview).length > 0;
  const isMachinery = category === "maquinaria";

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {draftId ? "Editar borrador" : "Nueva solicitud"}
          </h1>
          <p className="text-sm text-muted-foreground">{categoryLabel(category)}</p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Solicitante</Label>
            <Input value={user?.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha para la que se necesita</Label>
            <Input
              id="needed_by"
              type="date"
              value={state.neededBy}
              onChange={(event) => setState((s) => ({ ...s, neededBy: event.target.value }))}
              aria-invalid={Boolean(errors.neededBy)}
            />
            {errors.neededBy ? <p className="text-xs text-destructive">{errors.neededBy}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Prioridad</Label>
            <Select
              value={state.priority}
              onValueChange={(value) => setState((s) => ({ ...s, priority: value as Priority }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {state.priority === "urgente" ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="urgency">Justificación de la urgencia</Label>
              <Textarea
                id="urgency"
                value={state.urgencyReason}
                onChange={(event) => setState((s) => ({ ...s, urgencyReason: event.target.value }))}
                placeholder="Explicá por qué es urgente"
                aria-invalid={Boolean(errors.urgencyReason)}
              />
              {errors.urgencyReason ? (
                <p className="text-xs text-destructive">{errors.urgencyReason}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">Observaciones generales</Label>
            <Textarea
              id="notes"
              value={state.notes}
              onChange={(event) => setState((s) => ({ ...s, notes: event.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </CardContent>
      </Card>

      {isMachinery ? (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Maquinaria o mejora</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="equipment_name">Título de la solicitud</Label>
              <Input
                id="equipment_name"
                value={state.equipmentName}
                onChange={(event) => setState((s) => ({ ...s, equipmentName: event.target.value }))}
                placeholder="Ej.: Reemplazo de selladora al vacío"
              />
              {errors.equipmentName ? (
                <p className="text-xs text-destructive">{errors.equipmentName}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={state.machineryType}
                onValueChange={(value) =>
                  setState((s) => ({ ...s, machineryType: value as MachineryType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MACHINERY_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="machinery_qty">Cantidad</Label>
              <Input
                id="machinery_qty"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={state.machineryQty}
                onChange={(event) => setState((s) => ({ ...s, machineryQty: event.target.value }))}
              />
              {errors.machineryQty ? (
                <p className="text-xs text-destructive">{errors.machineryQty}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Unidad</Label>
              <Select
                value={state.machineryUnit}
                onValueChange={(value) => setState((s) => ({ ...s, machineryUnit: value }))}
              >
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
              <Label htmlFor="estimated_price">Precio estimado (opcional, ARS)</Label>
              <Input
                id="estimated_price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={state.estimatedPrice}
                onChange={(event) => setState((s) => ({ ...s, estimatedPrice: event.target.value }))}
                placeholder="No es obligatorio"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="problem">Problema o necesidad actual</Label>
              <Textarea
                id="problem"
                value={state.problem}
                onChange={(event) => setState((s) => ({ ...s, problem: event.target.value }))}
              />
              {errors.problem ? <p className="text-xs text-destructive">{errors.problem}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="benefit">Beneficio esperado</Label>
              <Textarea
                id="benefit"
                value={state.expectedBenefit}
                onChange={(event) => setState((s) => ({ ...s, expectedBenefit: event.target.value }))}
                placeholder="Ahorro de tiempo, mayor capacidad, menos desperdicio, seguridad..."
              />
              {errors.expectedBenefit ? (
                <p className="text-xs text-destructive">{errors.expectedBenefit}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="current_equipment">Equipo actual y estado (si corresponde)</Label>
              <Textarea
                id="current_equipment"
                value={state.currentEquipment}
                onChange={(event) => setState((s) => ({ ...s, currentEquipment: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="technical_specs">Especificaciones necesarias</Label>
              <Textarea
                id="technical_specs"
                value={state.technicalSpecs}
                onChange={(event) => setState((s) => ({ ...s, technicalSpecs: event.target.value }))}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {errors.items ? (
            <div className="rounded-md bg-destructive-soft p-3 text-sm text-destructive-soft-foreground">
              {errors.items}
            </div>
          ) : null}

          {state.items.map((item, index) => {
            const itemError =
              errors[`item-${index}-name`] ??
              errors[`item-${index}-sizes`] ??
              errors[`item-${index}-url`];
            return (
              <div key={item.key} className="space-y-2">
                <ItemEditor
                  index={index}
                  item={item}
                  variant={category === "indumentaria" ? "indumentaria" : "insumos"}
                  catalog={(catalog ?? []).filter((entry) => entry.category === category)}
                  folder={uploadFolder}
                  onChange={(patch) => updateItem(index, patch)}
                  onRemove={() => {
                    if (item.id) setRemovedItemIds((ids) => [...ids, item.id as string]);
                    setState((previous) => ({
                      ...previous,
                      items:
                        previous.items.length === 1
                          ? [createEmptyItem()]
                          : previous.items.filter((_, itemIndex) => itemIndex !== index),
                    }));
                  }}
                  canRemove={state.items.length > 1}
                />
                {itemError ? <p className="text-xs text-destructive">{itemError}</p> : null}
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              setState((previous) => ({ ...previous, items: [...previous.items, createEmptyItem()] }))
            }
          >
            <Plus className="h-4 w-4" />
            Agregar otro artículo
          </Button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur lg:static lg:rounded-lg lg:border lg:p-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" onClick={handleSaveDraft} disabled={saving || sending}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar borrador
          </Button>
          <Button
            size="lg"
            onClick={() => setSummaryOpen(true)}
            disabled={saving || sending || hasErrors}
          >
            <Send className="h-4 w-4" />
            Revisar y enviar
          </Button>
        </div>
      </div>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resumen antes de enviar</DialogTitle>
            <DialogDescription>
              Revisá la información. Después del envío, los cambios sobre artículos aprobados o
              comprados se registran como solicitud de cambio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Categoría: </span>
                {categoryLabel(category)}
              </p>
              <p>
                <span className="text-muted-foreground">Fecha necesaria: </span>
                {state.neededBy || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Prioridad: </span>
                {labelOf(
                  [
                    { value: "normal", label: "Normal" },
                    { value: "alta", label: "Alta" },
                    { value: "urgente", label: "Urgente" },
                  ],
                  state.priority,
                )}
              </p>
            </div>

            {state.priority === "urgente" ? (
              <p className="rounded-md bg-destructive-soft p-2 text-destructive-soft-foreground">
                Urgencia: {state.urgencyReason}
              </p>
            ) : null}

            {isMachinery ? (
              <div className="rounded-md border border-border p-3">
                <p className="font-medium">{state.equipmentName}</p>
                <p className="text-muted-foreground">
                  {labelOf(MACHINERY_TYPES, state.machineryType)} · {formatQty(Number(state.machineryQty))}{" "}
                  {state.machineryUnit}
                </p>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{state.problem}</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {state.items
                  .filter((item) => item.name.trim().length > 0)
                  .map((item, index) => {
                    const talles = filledSizes(item.sizes);
                    const total = talles.reduce((sum, entry) => sum + entry.cantidad, 0);
                    return (
                      <li key={item.key} className="rounded-md border border-border p-3">
                        <p className="font-medium">
                          {index + 1}. {item.name}
                        </p>
                        <p className="text-muted-foreground">
                          {formatQty(talles.length > 0 ? total : Number(item.requested_qty))}{" "}
                          {item.unit}
                        </p>
                        {talles.length > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {talles
                              .map((entry) => `${entry.talle}: ${formatQty(entry.cantidad)}`)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            )}

            {state.notes ? (
              <p className="text-muted-foreground">Observaciones: {state.notes}</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSummaryOpen(false)} disabled={sending}>
              Seguir editando
            </Button>
            <Button onClick={handleConfirmSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Confirmar envío
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RequestFormPage;
