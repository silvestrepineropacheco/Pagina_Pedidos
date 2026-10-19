import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ownerSetupPending } from "@/lib/api";
import { REGISTRO_EN_CURSO } from "@/components/route-guards";

const marcarRegistro = (activo: boolean) => {
  try {
    if (activo) sessionStorage.setItem(REGISTRO_EN_CURSO, "1");
    else sessionStorage.removeItem(REGISTRO_EN_CURSO);
  } catch {
    // Sin almacenamiento del navegador la confirmación igual se intenta mostrar.
  }
};
import { APP_VERSION } from "@/lib/constants";

type Mode = "login" | "signup";

/**
 * Los errores de inicio de sesión llegan en inglés: se traducen a un aviso
 * claro con lo que la persona puede hacer.
 */
const authErrorMessage = (message: string, mode: Mode): string => {
  if (/invalid login credentials/i.test(message)) {
    return "El correo o la contraseña no son correctos. Revisá que el correo esté bien escrito y tocá el ojo para ver la contraseña.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Todavía no confirmaste tu correo. Abrí el mensaje que te llegó al registrarte y tocá el enlace de confirmación.";
  }
  if (/user already registered|already been registered/i.test(message)) {
    return "Ya existe una cuenta con ese correo. Usá \"Ya tengo cuenta\" para ingresar.";
  }
  if (/password should be at least|weak password/i.test(message)) {
    return "La contraseña es muy corta o muy simple. Usá al menos 6 caracteres.";
  }
  if (/rate limit|too many requests|security purposes/i.test(message)) {
    return "Se hicieron demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
  }
  if (/email address .* is invalid|invalid email/i.test(message)) {
    return "El correo no es válido. Revisá cómo está escrito.";
  }
  if (/failed to fetch|network/i.test(message)) {
    return "No pudimos conectarnos. Revisá tu conexión a internet y probá de nuevo.";
  }
  return mode === "login"
    ? "No se pudo iniciar sesión. Probá de nuevo en unos minutos."
    : "No se pudo crear la cuenta. Probá de nuevo en unos minutos.";
};

const LoginPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Mostrar la contraseña sirve para revisar que se escribió bien.
  const [showPassword, setShowPassword] = useState(false);
  // Al crear la cuenta se escribe dos veces, para confirmar que quedó bien.
  const [confirmPassword, setConfirmPassword] = useState("");
  // Cuenta recién creada: se muestra la confirmación en lugar del formulario.
  const [created, setCreated] = useState<{ email: string; needsEmailConfirmation: boolean } | null>(null);
  const passwordsDiffer = mode === "signup" && confirmPassword.length > 0 && confirmPassword !== password;
  const [setupCode, setSetupCode] = useState("");
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
    if (mode === "signup" && confirmPassword !== password) {
      toast({
        title: "Las contraseñas no coinciden",
        description: "Escribí la misma contraseña en los dos campos.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message);
        toast({ title: "Sesión iniciada", description: "Bienvenido a Manila." });
        navigate("/", { replace: true });
        return;
      }

      marcarRegistro(true);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: fullName.trim(),
            ...(setupCode.trim() ? { owner_setup_code: setupCode.trim() } : {}),
          },
        },
      });
      if (error) throw new Error(error.message);
      // Si el correo ya tenía cuenta, Supabase no crea otra ni devuelve error:
      // lo reconocemos porque la respuesta llega sin identidades.
      if (data.user && (data.user.identities ?? []).length === 0) {
        throw new Error("User already registered");
      }
      // La cuenta nueva queda pendiente: no tiene nada que hacer todavía en la app,
      // así que se cierra la sesión y se muestra la confirmación.
      if (data.session) await supabase.auth.signOut();
      setCreated({ email: email.trim(), needsEmailConfirmation: !data.session });
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      marcarRegistro(false);
      console.error("[login] error técnico:", error);
      toast({
        title: mode === "login" ? "No se pudo ingresar" : "No se pudo crear la cuenta",
        description: authErrorMessage(error instanceof Error ? error.message : "", mode),
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
          <Logo onDark className="w-[220px]" />
          <p className="mt-2 text-sm text-primary-foreground/80">Pedidos y Compras</p>
          <p className="text-xs text-primary-foreground/60">Versión {APP_VERSION}</p>
        </div>
        <div className="mt-8 space-y-3 lg:mt-0">
          <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">
            Solicitudes de insumos, equipamiento y maquinaria
          </h1>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Centralizá los pedidos de insumos, equipamiento y maquinaria, evitá compras duplicadas y seguí qué está
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
              {created ? "Listo" : mode === "login" ? "Ingresar" : "Crear cuenta"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Usá tu correo y contraseña."
                : "La cuenta queda pendiente hasta que el Propietario te autorice y te asigne un rol."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupPending ? (
              <div className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-xs text-warning-soft-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  La aplicación todavía no tiene Propietario. Creá tu cuenta con el{" "}
                  <strong>código de configuración inicial</strong> para quedar como Propietario y
                  poder autorizar usuarios y asignar roles. Sin ese código, la cuenta queda
                  pendiente de autorización.
                </span>
              </div>
            ) : null}

            {created ? (
              <div className="space-y-4" role="status" aria-live="polite">
                <div className="flex items-start gap-3 rounded-lg bg-success-soft p-4 text-success-soft-foreground">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold">Cuenta creada</p>
                    <p className="text-sm">
                      La cuenta de <strong>{created.email}</strong> quedó registrada.
                    </p>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border border-border p-4 text-sm">
                  <p className="font-medium text-foreground">Falta la autorización del Propietario</p>
                  <p className="text-muted-foreground">
                    Todavía no podés usar la aplicación: el Propietario tiene que autorizar tu cuenta y asignarte
                    un rol. Avisale que ya te registraste.
                  </p>
                  {created.needsEmailConfirmation ? (
                    <p className="text-muted-foreground">
                      Además, confirmá tu correo con el enlace que te llegó a <strong>{created.email}</strong>.
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    marcarRegistro(false);
                    setCreated(null);
                    setMode("login");
                  }}
                >
                  Volver a Ingresar
                </Button>
              </div>
            ) : (
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    minLength={6}
                    required
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {mode === "signup" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="confirm_password">Repetir contraseña</Label>
                  <Input
                    id="confirm_password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Escribila de nuevo"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    aria-invalid={passwordsDiffer}
                    aria-describedby={passwordsDiffer ? "confirm_password_error" : undefined}
                    className={passwordsDiffer ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {passwordsDiffer ? (
                    <p id="confirm_password_error" role="alert" className="text-xs font-medium text-destructive">
                      Las contraseñas no coinciden. Revisalas: podés tocar el ojo para verlas.
                    </p>
                  ) : confirmPassword.length > 0 ? (
                    <p className="text-xs text-success">Las contraseñas coinciden.</p>
                  ) : null}
                </div>
              ) : null}

              {mode === "signup" && setupPending ? (
                <div className="space-y-1.5">
                  <Label htmlFor="setup_code">Código de configuración inicial (Propietario)</Label>
                  <Input
                    id="setup_code"
                    value={setupCode}
                    onChange={(event) => setSetupCode(event.target.value)}
                    placeholder="Pegá el código de un solo uso"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Es de un solo uso: se consume al crear la cuenta y luego deja de funcionar.
                  </p>
                </div>
              ) : null}

              <Button type="submit" size="xl" className="w-full" disabled={submitting || passwordsDiffer}>
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
            )}

            {created ? null : (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
              >
                <KeyRound className="h-4 w-4" />
                {mode === "login" ? "¿No tenés cuenta? Registrate" : "Ya tengo cuenta"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
