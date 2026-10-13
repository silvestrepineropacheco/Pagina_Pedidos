import { useAuth } from "@/hooks/auth-context";
import { can } from "@/lib/permissions";
import HomePage from ".";
import PortadaPage from "./portada";

/** Inicio según el rol: portada con las áreas para administradores, inicio de pedidos para encargados. */
const RoleHome = () => {
  const { role } = useAuth();
  return can.isAdmin(role) ? <PortadaPage /> : <HomePage />;
};

export default RoleHome;
