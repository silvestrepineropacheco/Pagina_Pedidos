import { Badge } from "@/components/ui/badge";
import { ITEM_STATUS, PRIORITY_MAP, REQUEST_STATUS, type Tone } from "@/lib/constants";
import type { ItemStatus, Priority, RequestStatus } from "@/lib/types";

const toneToVariant: Record<Tone, "neutral" | "info" | "success" | "warning" | "danger"> = {
  neutral: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

export const ToneBadge = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <Badge variant={toneToVariant[tone]} className="whitespace-nowrap">
    {children}
  </Badge>
);

export const StatusBadge = ({ status }: { status: RequestStatus }) => {
  const meta = REQUEST_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
};

export const ItemStatusBadge = ({ status }: { status: ItemStatus }) => {
  const meta = ITEM_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
};

export const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const meta = PRIORITY_MAP[priority] ?? { label: priority, tone: "neutral" as Tone };
  return (
    <ToneBadge tone={meta.tone}>
      {priority === "urgente" ? `Urgente` : `Prioridad ${meta.label}`}
    </ToneBadge>
  );
};
