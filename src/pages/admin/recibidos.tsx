import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/feedback";
import { ReceivedOrdersTable } from "@/components/requests/received-orders-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrdersEnriched } from "@/hooks/use-orders-enriched";
import { usePeopleMaps } from "@/hooks/use-reference-data";
import { CATEGORIES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

const ALL = "todos";

const ReceivedOrdersPage = () => {
  const { personName } = usePeopleMaps();
  const { orders, isLoading, error, refetch } = useOrdersEnriched();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [requester, setRequester] = useState(ALL);
  const [vendor, setVendor] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const received = useMemo(
    () => orders.filter((order) => order.request.status === "completed"),
    [orders],
  );

  const requesters = useMemo(
    () => [...new Set(received.map((order) => order.request.requester_id))],
    [received],
  );

  const vendors = useMemo(
    () =>
      [
        ...new Set(
          received
            .flatMap((order) => order.purchases.map((purchase) => purchase.vendor_name))
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [received],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return received
      .filter((order) => {
        if (category !== ALL && order.request.category !== category) return false;
        if (requester !== ALL && order.request.requester_id !== requester) return false;
        if (vendor !== ALL && !order.purchases.some((purchase) => purchase.vendor_name === vendor)) {
          return false;
        }
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
  }, [received, category, requester, vendor, from, to, search, personName]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pedidos recibidos"
        description="Todos los pedidos que ya llegaron, del más reciente al más antiguo, con su historial completo."
      />

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="received_search">Buscar</Label>
          <Input
            id="received_search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número de pedido, solicitante, artículo o proveedor"
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
          <Label>Solicitante</Label>
          <Select value={requester} onValueChange={setRequester}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {requesters.map((id) => (
                <SelectItem key={id} value={id}>
                  {personName(id) ?? "Sin nombre"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Proveedor</Label>
          <Select value={vendor} onValueChange={setVendor}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {vendors.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="received_from">Recibidos desde</Label>
          <Input
            id="received_from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="received_to">Recibidos hasta</Label>
          <Input
            id="received_to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "pedido recibido" : "pedidos recibidos"}
            {from ? ` · desde ${formatDate(from)}` : ""}
            {to ? ` · hasta ${formatDate(to)}` : ""}
          </p>
          <ReceivedOrdersTable orders={filtered} personName={personName} />
        </>
      )}
    </div>
  );
};

export default ReceivedOrdersPage;
