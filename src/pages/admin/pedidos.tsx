import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/feedback";
import { ReceivedOrdersTable } from "@/components/requests/received-orders-table";
import { RequestList } from "@/components/requests/request-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/auth-context";
import { useOrdersEnriched } from "@/hooks/use-orders-enriched";
import { usePeopleMaps, useProfiles } from "@/hooks/use-reference-data";
import { useRequests } from "@/hooks/use-requests";
import { CATEGORIES, PRIORITIES, REQUEST_STATUS } from "@/lib/constants";
import type { RequestRow, RequestStatus } from "@/lib/types";

const ALL = "todos";

const TABS: { value: string; label: string; statuses: RequestStatus[] | null }[] = [
  { value: "revision", label: "Pendientes de revisión", statuses: ["pending_review", "needs_info", "evaluating"] },
  { value: "compra", label: "Pendientes de compra", statuses: ["approved_pending_purchase", "purchasing"] },
  {
    value: "recepcion",
    label: "Compras realizadas / esperando recepción",
    statuses: ["purchased_pending_receipt", "partially_received"],
  },
  { value: "recibidos", label: "Recibidos", statuses: ["completed"] },
  { value: "rechazados", label: "Rechazados o cancelados", statuses: ["rejected", "cancelled"] },
  { value: "todos", label: "Todos los pedidos", statuses: null },
];

const QUEUE_TO_TAB: Record<string, string> = {
  new: "revision",
  approved: "compra",
  receipt: "recepcion",
};

const AdminRequestsPage = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queue = searchParams.get("queue") ?? "";
  const { personName } = usePeopleMaps();
  const { data: profiles } = useProfiles();
  const { data, isLoading, error, refetch } = useRequests({ limit: 500 });
  const enriched = useOrdersEnriched();

  const [tab, setTab] = useState(() => QUEUE_TO_TAB[queue] ?? "todos");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [adminId, setAdminId] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const admins = (profiles ?? []).filter(
    (profile) => (profile.role === "admin" || profile.role === "owner") && profile.active,
  );

  const currentTab = TABS.find((entry) => entry.value === tab) ?? TABS[TABS.length - 1];

  const baseFilters = (request: RequestRow) => {
    if (category !== ALL && request.category !== category) return false;
    if (priority !== ALL && request.priority !== priority) return false;
    if (status !== ALL && request.status !== status) return false;
    if (adminId !== ALL) {
      if (adminId === "sin_asignar" ? Boolean(request.assigned_admin_id) : request.assigned_admin_id !== adminId) {
        return false;
      }
    }
    if (from && (request.submitted_at ?? request.created_at) < from) return false;
    if (to && (request.submitted_at ?? request.created_at) > `${to}T23:59:59`) return false;
    if (queue === "urgent" && request.priority !== "urgente") return false;
    if (queue === "unassigned" && request.assigned_admin_id) return false;
    if (queue === "mine" && request.assigned_admin_id !== user?.id) return false;

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      const haystack = [
        request.folio ?? "",
        personName(request.requester_id) ?? "",
        request.equipment_name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  };

  const grouped = useMemo(() => {
    const list = data ?? [];
    const counts: Record<string, number> = {};
    for (const entry of TABS) {
      counts[entry.value] = entry.statuses
        ? list.filter((request) => entry.statuses?.includes(request.status) && baseFilters(request)).length
        : list.filter(baseFilters).length;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, category, priority, status, adminId, from, to, search, queue, user?.id, personName]);

  const filtered = useMemo(() => {
    const list = data ?? [];
    const scoped = currentTab.statuses
      ? list.filter((request) => currentTab.statuses?.includes(request.status))
      : list;
    return scoped.filter(baseFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, currentTab, category, priority, status, adminId, from, to, search, queue, user?.id, personName]);

  const receivedFiltered = useMemo(() => {
    if (tab !== "recibidos") return [];
    const term = search.trim().toLowerCase();
    return enriched.orders
      .filter((order) => order.request.status === "completed")
      .filter((order) => {
        if (category !== ALL && order.request.category !== category) return false;
        if (from && (order.receiptDate ?? "") < from) return false;
        if (to && (order.receiptDate ?? "") > to) return false;
        if (term) {
          const haystack = [
            order.request.folio ?? "",
            personName(order.request.requester_id) ?? "",
            order.vendors,
            ...order.items.map((item) => item.name),
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.receiptDate ?? "").localeCompare(a.receiptDate ?? ""));
  }, [tab, enriched.orders, search, category, from, to, personName]);

  const clearFilters = () => {
    setSearchParams({});
    setSearch("");
    setCategory(ALL);
    setPriority(ALL);
    setStatus(ALL);
    setAdminId(ALL);
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pedidos"
        description="Los pedidos de todo el equipo, organizados por momento del circuito: revisión, compra, recepción y recibidos."
        actions={
          <Button variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          if (queue) setSearchParams({});
        }}
      >
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-muted p-1">
          {TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value} className="text-xs sm:text-sm">
              {entry.label}
              {tab === "todos" || grouped[entry.value] > 0 ? ` (${grouped[entry.value] ?? 0})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="search">Buscar</Label>
          <Input
            id="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número, solicitante, artículo o proveedor"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {CATEGORIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Prioridad</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {PRIORITIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {Object.entries(REQUEST_STATUS).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Responsable</Label>
          <Select value={adminId} onValueChange={setAdminId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="sin_asignar">Sin asignar</SelectItem>
              {admins.map((admin) => (
                <SelectItem key={admin.id} value={admin.id}>
                  {admin.full_name ?? admin.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      </div>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : tab === "recibidos" ? (
        enriched.isLoading ? (
          <LoadingState />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {receivedFiltered.length}{" "}
              {receivedFiltered.length === 1 ? "pedido recibido" : "pedidos recibidos"}
            </p>
            <ReceivedOrdersTable orders={receivedFiltered} personName={personName} />
          </>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{filtered.length} pedidos</p>
          <RequestList
            requests={filtered}
            personName={personName}
            emptyTitle={`No hay pedidos en “${currentTab.label}”`}
            emptyDescription="Probá con otra pestaña o quitá los filtros."
          />
        </>
      )}
    </div>
  );
};

export default AdminRequestsPage;
