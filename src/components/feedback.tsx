import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Mientras cargan los datos se muestra la forma de lo que va a aparecer
 * (renglones grises), en lugar de un círculo girando.
 */
export const LoadingState = ({ label = "Cargando..." }: { label?: string }) => (
  <div role="status" aria-live="polite" className="space-y-3 py-4">
    <span className="sr-only">{label}</span>
    <p className="text-sm text-muted-foreground" aria-hidden>
      {label}
    </p>
    {[0, 1, 2].map((fila) => (
      <div key={fila} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="hidden h-6 w-20 animate-pulse rounded bg-muted sm:block" />
      </div>
    ))}
  </div>
);

export const ErrorState = ({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) => (
  <Card className={cn("border-destructive/30 bg-destructive-soft", className)}>
    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-destructive-soft-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-sm">{message || "Ocurrió un error al cargar la información."}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="bg-card">
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      ) : null}
    </CardContent>
  </Card>
);

export const EmptyState = ({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center">
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
      {icon ?? <Inbox className="h-5 w-5" />}
    </div>
    <div className="space-y-1">
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {action}
  </div>
);
