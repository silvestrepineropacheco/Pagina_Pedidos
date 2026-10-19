import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { ResolveChangeDialog } from "@/components/requests/request-dialogs";
import { ToneBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchItemsByIds } from "@/lib/api";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { usePendingChangeRequests, useRequests } from "@/hooks/use-requests";
import { formatDateTime } from "@/lib/format";
import type { ChangeRequestRow } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  requested_qty: "Cantidad solicitada",
  specifications: "Especificación",
  description: "Descripción",
  notes: "Observaciones",
  unit: "Unidad de pedido",
  name: "Nombre del artículo",
};

const ChangeReviewPage = () => {
  const { personName } = usePeopleMaps();
  const { data: changes, isLoading, error, refetch } = usePendingChangeRequests();
  const { data: requests } = useRequests({ limit: 500 });
  const [tab, setTab] = useState<"pending" | "resolved">("pending");
  const [selected, setSelected] = useState<ChangeRequestRow | null>(null);

  const pending = useMemo(
    () => (changes ?? []).filter((change) => change.status === "pending"),
    [changes],
  );
  const resolved = useMemo(
    () => (changes ?? []).filter((change) => change.status !== "pending"),
    [changes],
  );

  const itemIds = useMemo(
    () => [...new Set((changes ?? []).map((change) => change.request_item_id))],
    [changes],
  );

  const { data: items } = useQuery({
    queryKey: ["items-for-changes", itemIds],
    enabled: itemIds.length > 0,
    queryFn: () => fetchItemsByIds(itemIds),
  });

  const itemName = (id: string) => items?.find((item) => item.id === id)?.name ?? "Artículo";
  const folio = (id: string) =>
    requests?.find((request) => request.id === id)?.folio ?? "Solicitud";

  const renderList = (list: ChangeRequestRow[], showActions: boolean) => {
    if (list.length === 0) {
      return (
        <EmptyState
          title={showActions ? "No hay cambios pendientes" : "Sin cambios resueltos"}
          description={
            showActions
              ? "Las propuestas que hagan los gerentes sobre artículos aprobados o comprados aparecen acá."
              : undefined
          }
        />
      );
    }
    return (
      <div className="space-y-3">
        {list.map((change) => (
          <Card key={change.id} className="shadow-card">
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {itemName(change.request_item_id)} · {FIELD_LABELS[change.field] ?? change.field}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {folio(change.request_id)} · pedido por {personName(change.requested_by) ?? "—"} el{" "}
                    {formatDateTime(change.created_at)}
                  </p>
                </div>
                <ToneBadge
                  tone={
                    change.status === "accepted"
                      ? "success"
                      : change.status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {change.status === "pending"
                    ? "Pendiente"
                    : change.status === "accepted"
                      ? "Aceptado"
                      : "Rechazado"}
                </ToneBadge>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Valor actual: </span>
                  {change.old_value || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Propuesto: </span>
                  {change.new_value || "—"}
                </p>
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">Motivo: </span>
                {change.reason || "—"}
              </p>

              {change.resolution_note ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Resolución: </span>
                  {change.resolution_note}
                  {change.resolved_by ? ` · ${personName(change.resolved_by)}` : ""}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/pedidos/${change.request_id}`}>Abrir solicitud</Link>
                </Button>
                {showActions ? (
                  <Button size="sm" onClick={() => setSelected(change)}>
                    Resolver
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cambios a revisar"
        description="Los artículos aprobados o comprados no se modifican solos: el gerente propone y acá se decide."
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <>
          <Tabs value={tab} onValueChange={(value) => setTab(value as "pending" | "resolved")}>
            <TabsList className="bg-muted p-1">
              <TabsTrigger value="pending">
                Pendientes {pending.length > 0 ? `(${pending.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="resolved">Resueltos</TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "pending" ? renderList(pending, true) : renderList(resolved, false)}
        </>
      )}

      <ResolveChangeDialog
        open={Boolean(selected)}
        onOpenChange={(value) => setSelected(value ? selected : null)}
        changeId={selected?.id ?? null}
        requestId={selected?.request_id ?? ""}
        itemName={selected ? itemName(selected.request_item_id) : ""}
        field={selected ? (FIELD_LABELS[selected.field] ?? selected.field) : ""}
        oldValue={selected?.old_value ?? null}
        newValue={selected?.new_value ?? null}
        reason={selected?.reason ?? null}
      />
    </div>
  );
};

export default ChangeReviewPage;
