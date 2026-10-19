import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { ownerSetupPending } from "@/lib/api";
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
      if (data.session) {
        toast({
          title: "Cuenta creada",
          description: "Estamos preparando tu acceso.",
        });
        // Las guardas de ruta deciden el destino cuando el perfil ya cargó.
        navigate("/", { replace: true });
      } else {
        toast({
          title: "Revisá tu correo",
          description: "Confirmá tu dirección para completar el registro.",
        });
      }
    } catch (error) {
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
              {mode === "login" ? "Ingresar" : "Crear cuenta"}
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
