import { useState } from "react";
import { Check, Copy, KeyRound, Plus, ShieldCheck, UserX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { ToneBadge } from "@/components/badges";
import { ErrorState, LoadingState } from "@/components/feedback";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { useProfiles } from "@/hooks/use-reference-data";
import { authorizeProfile, invokeManageUsers, setProfileActive } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { roleLabel } from "@/lib/permissions";
import type { AppRole, Profile } from "@/lib/types";

interface InviteForm {
  email: string;
  full_name: string;
  role: AppRole;
}

const UsersPage = () => {
  const queryClient = useQueryClient();
  const { data: profiles, isLoading, error, refetch } = useProfiles();

  const [invite, setInvite] = useState<InviteForm | null>(null);
  const [authorize, setAuthorize] = useState<{ profile: Profile; role: AppRole } | null>(null);
  const [temporary, setTemporary] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
  };

  const handleInvite = async () => {
    if (!invite) return;
    setBusy(true);
    try {
      const result = await invokeManageUsers({
        action: "invite",
        email: invite.email.trim().toLowerCase(),
        full_name: invite.full_name.trim(),
        role: invite.role,
        sector_id: null,
      });
      await refresh();
      if (result.temporary_password) {
        setTemporary({ email: result.email ?? invite.email, password: result.temporary_password });
      } else {
        toast({ title: "Cuenta creada" });
      }
      setInvite(null);
    } catch (inviteError) {
      const message = inviteError instanceof Error ? inviteError.message : "";
      const unavailable = /service role|pendiente de configuración/i.test(message);
      toast({
        title: unavailable
          ? "Crear cuentas desde el panel no está disponible"
          : "No se pudo crear la cuenta",
        description: unavailable
          ? "Pedile a la persona que se registre desde el link de la aplicación y, cuando aparezca en “Cuentas pendientes”, autorizala acá con su rol."
          : message || undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAuthorize = async () => {
    if (!authorize) return;
    setBusy(true);
    try {
      // Actualizacion directa: la base valida en el servidor que seas el Propietario.
      await authorizeProfile(authorize.profile.id, authorize.role);
      await refresh();
      toast({
        title: "Cuenta autorizada",
        description: `${authorize.profile.email} ya puede ingresar con su rol.`,
      });
      setAuthorize(null);
    } catch (authorizeError) {
      toast({
        title: "No se pudo autorizar la cuenta",
        description: friendlyError(
          authorizeError,
          "No pudimos autorizar la cuenta. Intentá nuevamente o contactá al proveedor del sistema.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleActive = async (profile: Profile) => {
    setBusy(true);
    try {
      await setProfileActive(profile.id, !profile.active);
      await refresh();
      toast({ title: profile.active ? "Cuenta desactivada" : "Cuenta reactivada" });
    } catch (activeError) {
      toast({
        title: "No se pudo cambiar el estado",
        description: activeError instanceof Error ? activeError.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const pending = (profiles ?? []).filter((profile) => profile.role === "pending" || !profile.active);
  const active = (profiles ?? []).filter((profile) => profile.role !== "pending" && profile.active);

  const renderRow = (profile: Profile) => (
    <TableRow key={profile.id}>
      <TableCell className="font-medium">{profile.full_name ?? "—"}</TableCell>
      <TableCell className="text-sm">{profile.email}</TableCell>
      <TableCell>{roleLabel(profile.role)}</TableCell>
      <TableCell>
        <ToneBadge tone={profile.active && profile.role !== "pending" ? "success" : "warning"}>
          {profile.active && profile.role !== "pending" ? "Habilitada" : "Sin acceso"}
        </ToneBadge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {profile.role === "pending" || !profile.active ? (
            <Button
              size="sm"
              onClick={() =>
                setAuthorize({
                  profile,
                  role: "encargado",
                })
              }
            >
              <ShieldCheck className="h-4 w-4" />
              Autorizar
            </Button>
          ) : profile.role === "owner" ? (
            <span className="text-xs text-muted-foreground">Propietario</span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void handleActive(profile)} disabled={busy}>
              <UserX className="h-4 w-4" />
              Desactivar
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios, roles y permisos"
        description="Solo el Propietario puede autorizar cuentas y asignar su rol. Nadie obtiene permisos por registrarse."
        actions={
          <Button onClick={() => setInvite({ email: "", full_name: "", role: "encargado" })}>
            <Plus className="h-4 w-4" />
            Crear cuenta
          </Button>
        }
      />

      <div className="rounded-md bg-info-soft p-3 text-xs text-info-soft-foreground">
        <p className="font-medium">Dos formas de dar acceso</p>
        <p className="mt-1">
          1) La persona se registra con el link de la aplicación y queda en “Cuentas pendientes”:
          autorizala desde acá eligiendo su rol. 2) O creá la cuenta directamente con
          “Crear cuenta” y pasale la contraseña temporal junto con el link.
        </p>
      </div>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <>
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">
                Cuentas pendientes de autorización {pending.length > 0 ? `(${pending.length})` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cuentas esperando autorización.</p>
              ) : (
                <div className="overflow-hidden rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Correo</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Acceso</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>{pending.map(renderRow)}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">Cuentas habilitadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Acceso</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>{active.map(renderRow)}</TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(invite)} onOpenChange={(open) => (open ? undefined : setInvite(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear cuenta</DialogTitle>
            <DialogDescription>
              La cuenta se crea ya autorizada y te devuelve una contraseña temporal para entregar en
              mano. Si la creación desde el panel no está disponible, usá el otro camino: que la
              persona se registre y autorizala desde “Cuentas pendientes”.
            </DialogDescription>
          </DialogHeader>
          {invite ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite_email">Correo</Label>
                <Input
                  id="invite_email"
                  type="email"
                  value={invite.email}
                  onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite_name">Nombre y apellido</Label>
                <Input
                  id="invite_name"
                  value={invite.full_name}
                  onChange={(event) => setInvite({ ...invite, full_name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select
                  value={invite.role}
                  onValueChange={(value) => setInvite({ ...invite, role: value as AppRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="encargado">Encargado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInvite(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void handleInvite()} disabled={busy}>
              Crear cuenta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(authorize)} onOpenChange={(open) => (open ? undefined : setAuthorize(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Autorizar cuenta</DialogTitle>
            <DialogDescription>{authorize?.profile.email}</DialogDescription>
          </DialogHeader>
          {authorize ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select
                  value={authorize.role}
                  onValueChange={(value) => setAuthorize({ ...authorize, role: value as AppRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="encargado">Encargado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAuthorize(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void handleAuthorize()} disabled={busy}>
              <Check className="h-4 w-4" />
              Autorizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(temporary)} onOpenChange={(open) => (open ? undefined : setTemporary(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Contraseña temporal
            </DialogTitle>
            <DialogDescription>
              Entregá esta contraseña a {temporary?.email} para que ingrese. Debería cambiarla después.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted p-3">
            <code className="break-all text-sm">{temporary?.password}</code>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (temporary) {
                  void navigator.clipboard.writeText(temporary.password);
                  toast({ title: "Contraseña copiada" });
                }
              }}
            >
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
            <Button onClick={() => setTemporary(null)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
