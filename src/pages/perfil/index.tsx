import { useEffect, useState } from "react";
import { AlertTriangle, Bell, Loader2, Save } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/auth-context";
import {
  fetchNotificationPrefs,
  ownerSetupPending,
  saveNotificationPrefs,
  updateOwnProfile,
} from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { roleLabel } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ProfilePage = () => {
  const { profile, user, role, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [notifyNew, setNotifyNew] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [setupPending, setSetupPending] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
  }, [profile?.full_name]);

  useEffect(() => {
    if (!user) return;
    void fetchNotificationPrefs(user.id)
      .then((prefs) => {
        if (!prefs) return;
        setNotifyNew(prefs.notify_new_requests);
        setCategories(prefs.categories ?? []);
      })
      .catch(() => undefined);
    void ownerSetupPending()
      .then(setSetupPending)
      .catch(() => setSetupPending(false));
  }, [user]);

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      await updateOwnProfile(user.id, fullName.trim());
      await refreshProfile();
      toast({ title: "Datos actualizados" });
    } catch (error) {
      toast({
        title: "No se pudieron guardar los datos",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePrefs = async () => {
    if (!user) return;
    setSavingPrefs(true);
    try {
      await saveNotificationPrefs(user.id, {
        notify_new_requests: notifyNew,
        categories,
      });
      toast({ title: "Preferencias de notificación guardadas" });
    } catch (error) {
      toast({
        title: "No se pudieron guardar las preferencias",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingPrefs(false);
    }
  };

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) =>
    setter(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  return (
    <div className="space-y-4">
      <PageHeader title="Mi perfil" description="Tus datos, tu rol y tus preferencias de avisos." />

      {setupPending ? (
        <div className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Configuración inicial pendiente: la aplicación todavía no tiene una cuenta de Propietario.
            El acceso a usuarios, roles y permisos queda deshabilitado hasta que se autorice esa cuenta.
          </span>
        </div>
      ) : null}

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Datos de la cuenta</CardTitle>
          <CardDescription>
            El correo y el rol solo los puede modificar el Propietario.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="full_name">Nombre y apellido</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="full_name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
              <Button onClick={() => void handleSaveName()} disabled={savingName || !fullName.trim()}>
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Correo</Label>
            <Input value={profile?.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Input value={roleLabel(role)} readOnly disabled />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Avisos de nuevos pedidos por correo
          </CardTitle>
          <CardDescription>
            Podés desactivar los avisos o limitarlos a las categorías que te interesan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Recibir avisos de nuevos pedidos</p>
              <p className="text-xs text-muted-foreground">
                Se envía un solo correo por solicitud, no uno por artículo.
              </p>
            </div>
            <Switch checked={notifyNew} onCheckedChange={setNotifyNew} />
          </div>

          <div className="space-y-2">
            <Label>Categorías de interés (opcional)</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => toggle(categories, category.value, setCategories)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    categories.includes(category.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-accent",
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sin selección, recibís avisos de todas las categorías.
            </p>
          </div>

          <Button onClick={() => void handleSavePrefs()} disabled={savingPrefs}>
            {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar preferencias
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
