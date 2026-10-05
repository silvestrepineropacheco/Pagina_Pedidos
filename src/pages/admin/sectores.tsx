import { useState } from "react";
import { Plus } from "lucide-react";
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
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSectors } from "@/hooks/use-reference-data";
import type { Sector } from "@/lib/types";

const SectorsPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useSectors();
  const [form, setForm] = useState<{ id?: string; name: string; code: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sectors"] });
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast({ title: "El nombre del sector es obligatorio", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), code: form.code.trim() || null };
      if (form.id) {
        const { error: updateError } = await supabase.from("sectors").update(payload).eq("id", form.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase.from("sectors").insert(payload);
        if (insertError) throw new Error(insertError.message);
      }
      await refresh();
      toast({ title: form.id ? "Sector actualizado" : "Sector creado" });
      setForm(null);
    } catch (saveError) {
      toast({
        title: "No se pudo guardar el sector",
        description: saveError instanceof Error ? saveError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (sector: Sector) => {
    try {
      const { error: updateError } = await supabase
        .from("sectors")
        .update({ active: !sector.active })
        .eq("id", sector.id);
      if (updateError) throw new Error(updateError.message);
      await refresh();
      toast({
        title: sector.active ? "Sector desactivado" : "Sector reactivado",
        description: "Los pedidos y el historial del sector se conservan.",
      });
    } catch (toggleError) {
      toast({
        title: "No se pudo cambiar el estado",
        description: toggleError instanceof Error ? toggleError.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sectores"
        description="Los encargados pertenecen a un sector. Desactivar un sector no borra su historial."
        actions={
          <Button onClick={() => setForm({ name: "", code: "" })}>
            <Plus className="h-4 w-4" />
            Nuevo sector
          </Button>
        }
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="Todavía no hay sectores" description="Creá los sectores de la planta." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((sector) => (
            <Card key={sector.id} className="shadow-card">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{sector.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sector.code ? `Código ${sector.code}` : "Sin código"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {sector.is_demo ? <ToneBadge tone="neutral">Demostrativo</ToneBadge> : null}
                    <ToneBadge tone={sector.active ? "success" : "danger"}>
                      {sector.active ? "Activo" : "Inactivo"}
                    </ToneBadge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ id: sector.id, name: sector.name, code: sector.code ?? "" })}
                  >
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void toggleActive(sector)}>
                    {sector.active ? "Desactivar" : "Reactivar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(form)} onOpenChange={(open) => (open ? undefined : setForm(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar sector" : "Nuevo sector"}</DialogTitle>
            <DialogDescription>Los sectores demostrativos se pueden editar o desactivar.</DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sector_name">Nombre</Label>
                <Input
                  id="sector_name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sector_code">Código (opcional)</Label>
                <Input
                  id="sector_code"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value })}
                  placeholder="Ej.: DES"
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

export default SectorsPage;
