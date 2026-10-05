import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const LoadingState = ({ label = "Cargando..." }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" />
    <span className="text-sm">{label}</span>
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
