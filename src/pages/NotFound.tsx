import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: se intentó abrir una ruta que no existe:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background">
      <div className="bg-primary px-6 py-5">
        <Logo onDark className="w-[150px]" />
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary">
          <Compass className="h-6 w-6" />
        </div>
        <p className="mt-6 text-sm font-medium text-muted-foreground">Error 404</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          Esta página no existe
        </h1>
        <p className="mt-3 text-muted-foreground">
          Puede que el enlace esté mal escrito o que la página se haya movido. La dirección que
          abriste fue <span className="break-all font-medium text-foreground">{location.pathname}</span>.
        </p>
        <div className="mt-8">
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
