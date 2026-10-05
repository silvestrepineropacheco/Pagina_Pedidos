import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/app-shell";
import { RequestList } from "@/components/requests/request-list";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { usePeopleMaps, useProfiles } from "@/hooks/use-reference-data";
import { useRequests } from "@/hooks/use-requests";
import { CATEGORIES, PRIORITIES, REQUEST_STATUS } from "@/lib/constants";
import type { RequestRow } from "@/lib/types";

const QUEUE_STATUSES: Record<string, string[]> = {
  new: ["pending_review"],
  urgent: ["pending_review", "needs_info", "evaluating", "approved_pending_purchase", "purchasing", "purchased_pending_receipt", "partially_received"],
  unassigned: ["pending_review", "needs_info", "evaluating", "approved_pending_purchase", "purchasing", "purchased_pending_receipt", "partially_received"],
  mine: ["pending_review", "needs_info", "evaluating", "approved_pending_purchase", "purchasing", "purchased_pending_receipt", "partially_received"],
  approved: ["approved_pending_purchase"],
  receipt: ["purchased_pending_receipt", "partially_received"],
};

const ALL = "todos";

const AdminRequestsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queue = searchParams.get("queue") ?? "";
  const { personName } = usePeopleMaps();
  const { data: profiles } = useProfiles();
  const { data, isLoading, error, refetch } = useRequests({ limit: 500 });

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

  const filtered = useMemo(() => {
    let list: RequestRow[] = data ?? [];

    if (queue && QUEUE_STATUSES[queue]) {
      list = list.filter((request) => QUEUE_STATUSES[queue].includes(request.status));
      if (queue === "urgent") list = list.filter((request) => request.priority === "urgente");
      if (queue === "unassigned") list = list.filter((request) => !request.assigned_admin_id);
    }

    if (category !== ALL) list = list.filter((request) => request.category === category);
    if (priority !== ALL) list = list.filter((request) => request.priority === priority);
    if (status !== ALL) list = list.filter((request) => request.status === status);
    if (adminId !== ALL) {
      list = list.filter((request) =>
        adminId === "sin_asignar" ? !request.assigned_admin_id : request.assigned_admin_id === adminId,
      );
    }
    if (from) list = list.filter((request) => (request.submitted_at ?? request.created_at) >= from);
    if (to) list = list.filter((request) => (request.submitted_at ?? request.created_at) <= `${to}T23:59:59`);

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter((request) => {
        const haystack = [
          request.folio ?? "",
          personName(request.requester_id) ?? "",
          request.equipment_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
    }

    return list;
  }, [data, queue, category, priority, status, adminId, from, to, search, personName]);

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
        title="Todos los pedidos"
        description="Buscá por número, producto o solicitante y filtrá por categoría, prioridad, estado, responsable y fechas."
        actions={
          <Button variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        }
      />

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="search">Buscar</Label>
          <Input
            id="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número, solicitante o equipo"
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
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{filtered.length} pedidos encontrados</p>
          <RequestList
            requests={filtered}
            personName={personName}
            emptyTitle="No hay pedidos con estos filtros"
          />
        </>
      )}
    </div>
  );
};

export default AdminRequestsPage;
