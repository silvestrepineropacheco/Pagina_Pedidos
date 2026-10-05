import { useEffect, useState } from "react";
import { AlertTriangle, Clock, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/auth-context";
import { ownerSetupPending } from "@/lib/api";
import { roleLabel } from "@/lib/permissions";

const PendingPage = () => {
  const { profile, role, refreshProfile, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [setupPending, setSetupPending] = useState(false);

  useEffect(() => {
    void ownerSetupPending()
      .then(setSetupPending)
      .catch(() => setSetupPending(false));
  }, []);

  useEffect(() => {
    if (profile && profile.role !== "pending" && profile.active) {
      window.location.replace("/");
    }
  }, [profile]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg shadow-card">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-warning-soft text-warning-soft-foreground">
            <Clock className="h-5 w-5" />
          </div>
          <CardTitle>Cuenta pendiente de autorización</CardTitle>
          <CardDescription>
            Tu cuenta ya existe, pero todavía no tiene permisos asignados. El Propietario debe
            definir tu rol y tu sector antes de que puedas usar la aplicación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setupPending ? (
            <div className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-xs text-warning-soft-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Configuración inicial pendiente: la aplicación todavía no tiene una cuenta de
                Propietario autorizada. Si esta cuenta debe ser la del Propietario, volvé a la
                pantalla de ingreso, creá la cuenta con el código de configuración inicial y quedará
                habilitada como Propietaria.
              </span>
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
            <p className="text-muted-foreground">Cuenta</p>
            <p className="font-medium text-foreground">{profile?.email ?? "Sin correo registrado"}</p>
            <p className="mt-2 text-muted-foreground">Estado</p>
            <p className="font-medium text-foreground">{roleLabel(role)}</p>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-info-soft p-3 text-xs text-info-soft-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Ninguna cuenta se autoriza sola. El rol de Administrador o Encargado lo asigna el
              Propietario desde la gestión de usuarios.
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" onClick={handleCheck} disabled={checking} className="sm:flex-1">
              <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Verificar nuevamente
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="sm:flex-1"
              onClick={() => {
                void signOut();
              }}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingPage;
