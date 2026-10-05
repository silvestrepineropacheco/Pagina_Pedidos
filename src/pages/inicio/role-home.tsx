import { useAuth } from "@/hooks/auth-context";
import { can } from "@/lib/permissions";
import AdminPanelPage from "@/pages/admin/panel";
import HomePage from ".";

/** Inicio según el rol: panel para administradores, home de sector para encargados. */
const RoleHome = () => {
  const { role } = useAuth();
  return can.isAdmin(role) ? <AdminPanelPage /> : <HomePage />;
};

export default RoleHome;
