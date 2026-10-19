import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/auth-context";
import { can } from "@/lib/permissions";
import HomePage from ".";
import PortadaPage from "./portada";

/** Inicio según el rol: portada con las áreas para administradores, compras para Finanzas, inicio de pedidos para gerentes. */
const RoleHome = () => {
  const { role } = useAuth();
  // Finanzas entra directo a lo que le toca: las compras pendientes.
  if (role === "finanzas") return <Navigate to="/admin/pendientes-compra" replace />;
  return can.isAdmin(role) ? <PortadaPage /> : <HomePage />;
};

export default RoleHome;
