import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categoryLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { RequestRow } from "@/lib/types";

interface RequestListProps {
  requests: RequestRow[];
  sectorName: (id?: string | null) => string | null;
  personName: (id?: string | null) => string | null;
  showSector?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

const Responsible = ({ name }: { name: string | null }) =>
  name ? (
    <span className="text-sm text-foreground">{name}</span>
  ) : (
    <span className="text-xs text-muted-foreground">Sin responsable</span>
  );

export const RequestList = ({
  requests,
  sectorName,
  personName,
  showSector = false,
  emptyTitle = "No hay pedidos para mostrar",
  emptyDescription = "Cuando existan solicitudes con estos criterios las vas a ver acá.",
}: RequestListProps) => {
  if (requests.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Categoría</TableHead>
              {showSector ? <TableHead>Sector</TableHead> : null}
              <TableHead>Prioridad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.folio ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(request.submitted_at ?? request.created_at)}
                </TableCell>
                <TableCell className="text-sm">{categoryLabel(request.category)}</TableCell>
                {showSector ? (
                  <TableCell className="text-sm">{sectorName(request.sector_id) ?? "—"}</TableCell>
                ) : null}
                <TableCell>
                  <PriorityBadge priority={request.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell>
                  <Responsible name={personName(request.assigned_admin_id)} />
                </TableCell>
                <TableCell>
                  <Link
                    to={`/pedidos/${request.id}`}
                    aria-label={`Abrir ${request.folio ?? "pedido"}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-accent"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {requests.map((request) => (
          <Link
            key={request.id}
            to={`/pedidos/${request.id}`}
            className="block rounded-lg border border-border bg-card p-3 shadow-card transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{request.folio ?? "Sin número"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(request.submitted_at ?? request.created_at)}
                </p>
              </div>
              <StatusBadge status={request.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PriorityBadge priority={request.priority} />
              <span className="text-xs text-muted-foreground">{categoryLabel(request.category)}</span>
              {showSector ? (
                <span className="text-xs text-muted-foreground">
                  · {sectorName(request.sector_id) ?? "Sin sector"}
                </span>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Responsable: {personName(request.assigned_admin_id) ?? "sin asignar"}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
};
