import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/auth-context";
import { useNotifications } from "@/hooks/use-purchases";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/app-shell";

const NotificationsPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useNotifications();

  const handleRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (readError) {
      toast({
        title: "No se pudo marcar como leída",
        description: readError instanceof Error ? readError.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleReadAll = async () => {
    if (!user) return;
    try {
      await markAllNotificationsRead(user.id);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Notificaciones marcadas como leídas" });
    } catch (readError) {
      toast({
        title: "No se pudieron marcar como leídas",
        description: readError instanceof Error ? readError.message : undefined,
        variant: "destructive",
      });
    }
  };

  const unread = (data ?? []).filter((item) => !item.read_at).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notificaciones"
        description={unread > 0 ? `Tenés ${unread} sin leer.` : "Estás al día."}
        actions={
          <Button variant="outline" onClick={() => void handleReadAll()} disabled={unread === 0}>
            <CheckCheck className="h-4 w-4" />
            Marcar todas como leídas
          </Button>
        }
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No tenés notificaciones"
          description="Acá vas a ver los avisos sobre tus pedidos y las solicitudes por revisar."
          icon={<Bell className="h-5 w-5" />}
        />
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((notification) => (
            <Card
              key={notification.id}
              className={notification.read_at ? "shadow-card" : "border-primary/30 bg-primary/5 shadow-card"}
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-foreground">{notification.title}</p>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(notification.created_at)}
                  </span>
                </div>
                {notification.body ? (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{notification.body}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {notification.request_id ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/pedidos/${notification.request_id}`}>Abrir solicitud</Link>
                    </Button>
                  ) : null}
                  {!notification.read_at ? (
                    <Button size="sm" variant="ghost" onClick={() => void handleRead(notification.id)}>
                      Marcar como leída
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
