import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Evita que un error de interfaz deje la pantalla en blanco o en un ciclo de
 * recargas: muestra un mensaje claro y permite reintentar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de interfaz:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-card">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-destructive-soft text-destructive-soft-foreground">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Algo salió mal en esta pantalla</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            La información que ya guardaste no se perdió. Podés reintentar.
          </p>
          <p className="mt-2 break-words text-xs text-muted-foreground">{this.state.error.message}</p>
          <Button
            className="mt-4"
            onClick={() => {
              this.setState({ error: null });
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      </div>
    );
  }
}
