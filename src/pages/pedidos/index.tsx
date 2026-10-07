import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { RequestList } from "@/components/requests/request-list";
import { ErrorState, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app-shell";
import { useAuth } from "@/hooks/auth-context";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { can } from "@/lib/permissions";
import { useRequests } from "@/hooks/use-requests";
import { REQUEST_STATUS } from "@/lib/constants";
import type { RequestStatus } from "@/lib/types";

const TABS = [
  { value: "todos", label: "Todos" },
  { value: "draft", label: "Borradores" },
  { value: "pending_review", label: "Pendientes" },
  { value: "en_gestion", label: "En gestión" },
  { value: "por_recibir", label: "Por recibir" },
  { value: "cerrados", label: "Cerrados" },
];

const EN_GESTION: RequestStatus[] = ["evaluating", "approved_pending_purchase", "purchasing"];
const POR_RECIBIR: RequestStatus[] = ["purchased_pending_receipt", "partially_received"];
const CERRADOS: RequestStatus[] = ["completed", "rejected", "cancelled"];

const MyRequestsPage = () => {
  const { role } = useAuth();
  const { personName } = usePeopleMaps();
  const { data, isLoading, error, refetch } = useRequests({ limit: 300 });
  const [tab, setTab] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (tab === "en_gestion") list = list.filter((item) => EN_GESTION.includes(item.status));
    else if (tab === "por_recibir") list = list.filter((item) => POR_RECIBIR.includes(item.status));
    else if (tab === "cerrados") list = list.filter((item) => CERRADOS.includes(item.status));
    else if (tab !== "todos") list = list.filter((item) => item.status === tab);

    if (status !== "todos") list = list.filter((item) => item.status === status);

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          (item.folio ?? "").toLowerCase().includes(term) ||
          (personName(item.requester_id) ?? "").toLowerCase().includes(term) ||
          (personName(item.assigned_admin_id) ?? "").toLowerCase().includes(term),
      );
    }
    return list;
  }, [data, tab, status, search, personName]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pedidos"
        description={
          can.isAdmin(role)
            ? "Como administrador ves y gestionás los pedidos de todo el equipo."
            : "Ves los pedidos de todo el equipo. Solo podés editar los borradores que creaste vos."
        }
        actions={
          <Button asChild>
            <Link to="/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo pedido
            </Link>
          </Button>
        }
      />

      <div className="space-y-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-muted p-1">
            {TABS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value} className="text-xs sm:text-sm">
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por número o solicitante"
            className="sm:max-w-xs"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {Object.entries(REQUEST_STATUS).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <RequestList
          requests={filtered}
          personName={personName}
          emptyTitle="No hay pedidos con estos filtros"
        />
      )}
    </div>
  );
};

export default MyRequestsPage;
