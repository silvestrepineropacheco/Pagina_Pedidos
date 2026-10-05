import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, KeyRound, Loader2, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ownerSetupPending } from "@/lib/api";
import { useEffect } from "react";

type Mode = "login" | "signup";

const LoginPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [setupPending, setSetupPending] = useState(false);

  useEffect(() => {
    void ownerSetupPending()
      .then(setSetupPending)
      .catch(() => setSetupPending(false));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message);
        toast({ title: "Sesión iniciada", description: "Bienvenido a Manila." });
        navigate("/", { replace: true });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: fullName.trim() },
        },
      });
      if (error) throw new Error(error.message);
      if (data.session) {
        toast({
          title: "Cuenta creada",
          description: "Tu cuenta quedó pendiente de autorización por el Propietario.",
        });
        navigate("/pendiente", { replace: true });
      } else {
        toast({
          title: "Revisá tu correo",
          description: "Confirmá tu dirección para completar el registro.",
        });
      }
    } catch (error) {
      toast({
        title: "No se pudo completar la operación",
        description: error instanceof Error ? error.message : "Intentá nuevamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <div className="flex flex-col justify-between bg-primary p-6 text-primary-foreground lg:w-[42%] lg:p-10">
        <div>
          <p className="text-lg font-semibold">Manila</p>
          <p className="text-sm text-primary-foreground/80">Pedidos y Compras</p>
        </div>
        <div className="mt-8 space-y-3 lg:mt-0">
          <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">
            Solicitudes de insumos, equipamiento y maquinaria
          </h1>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Centralizá los pedidos de cada sector, evitá compras duplicadas y seguí qué está
            pendiente, quién lo gestiona y qué se recibió.
          </p>
        </div>
        <p className="mt-8 text-xs text-primary-foreground/70 lg:mt-0">
          Acceso privado, solo para personal autorizado.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md shadow-card">
          <CardHeader>
            <CardTitle className="text-xl">
              {mode === "login" ? "Ingresar" : "Crear cuenta"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Usá tu correo y contraseña."
                : "La cuenta queda pendiente hasta que el Propietario te autorice y asigne un sector."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupPending ? (
              <div className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-xs text-warning-soft-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  La aplicación todavía no tiene Propietario configurado. Hasta que se autorice esa
                  cuenta, ninguna persona puede administrar usuarios, roles ni permisos.
                </span>
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "signup" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Nombre y apellido</Label>
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Ej.: Ana Gómez"
                    autoComplete="name"
                    required
                  />
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@empresa.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                />
              </div>

              <Button type="submit" size="xl" className="w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "login" ? (
                  <LogIn className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {mode === "login" ? "Ingresar" : "Crear cuenta"}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              <KeyRound className="h-4 w-4" />
              {mode === "login" ? "¿No tenés cuenta? Registrate" : "Ya tengo cuenta"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
