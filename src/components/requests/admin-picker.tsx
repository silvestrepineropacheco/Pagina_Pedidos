import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssignableAdmins } from "@/hooks/use-reference-data";

/** Selector del administrador responsable de un pedido. */
export const AdminPicker = ({
  id,
  label,
  help,
  value,
  onChange,
  excludeId,
}: {
  id: string;
  label: string;
  help?: string;
  value: string;
  onChange: (adminId: string) => void;
  excludeId?: string | null;
}) => {
  const { data: admins, isLoading } = useAssignableAdmins();
  const options = (admins ?? []).filter((admin) => admin.id !== excludeId);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={isLoading || options.length === 0}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue
            placeholder={
              isLoading
                ? "Cargando administradores..."
                : options.length === 0
                  ? "No hay otro administrador disponible"
                  : "Elegí un administrador"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((admin) => (
            <SelectItem key={admin.id} value={admin.id}>
              {admin.full_name ?? "Sin nombre"}
              {admin.role === "owner" ? " (Propietario)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
};
