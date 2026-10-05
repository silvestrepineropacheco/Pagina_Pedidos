import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  Factory,
  FileCheck2,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Settings2,
  ShoppingCart,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/auth-context";
import { useNotifications } from "@/hooks/use-purchases";
import { APP_NAME } from "@/lib/constants";
import { roleLabel } from "@/lib/permissions";
import type { AppRole } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
}

const EVERYONE: AppRole[] = ["encargado", "admin", "owner"];
const ADMINS: AppRole[] = ["admin", "owner"];

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: Home, roles: EVERYONE },
  { to: "/nuevo", label: "Nuevo pedido", icon: Plus, roles: ["encargado"] },
  { to: "/pedidos", label: "Pedidos de mi sector", icon: ClipboardList, roles: ["encargado"] },
  { to: "/admin", label: "Panel de gestión", icon: LayoutDashboard, roles: ADMINS },
  { to: "/admin/pedidos", label: "Todos los pedidos", icon: ClipboardList, roles: ADMINS },
  { to: "/admin/revision-cambios", label: "Cambios a revisar", icon: FileCheck2, roles: ADMINS },
  { to: "/admin/pendientes-compra", label: "Compras pendientes", icon: ShoppingCart, roles: ADMINS },
  { to: "/admin/compras", label: "Compras registradas", icon: Package, roles: ADMINS },
  { to: "/admin/catalogo", label: "Catálogo", icon: Tags, roles: ADMINS },
  { to: "/admin/sectores", label: "Sectores", icon: Factory, roles: ADMINS },
  { to: "/admin/usuarios", label: "Usuarios y permisos", icon: Users, roles: ["owner"] },
  { to: "/admin/reportes", label: "Reportes", icon: BarChart3, roles: ADMINS },
  { to: "/ayuda", label: "Cómo funciona", icon: BookOpen, roles: EVERYONE },
  { to: "/notificaciones", label: "Notificaciones", icon: Bell, roles: EVERYONE },
  { to: "/perfil", label: "Mi perfil", icon: Settings2, roles: EVERYONE },
];

const useNavItems = (role: AppRole | null) =>
  NAV_ITEMS.filter((item) => (role ? item.roles.includes(role) : false));

const NavList = ({ role, onNavigate }: { role: AppRole | null; onNavigate?: () => void }) => {
  const items = useNavItems(role);
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/" || item.to === "/admin"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { profile, role, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: notifications } = useNotifications();
  const unread = (notifications ?? []).filter((item) => !item.read_at).length;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-72 shrink-0 flex-col justify-between bg-sidebar p-4 lg:flex">
        <div className="space-y-6">
          <div className="px-2 pt-2">
            <p className="text-base font-semibold text-sidebar-foreground">Manila</p>
            <p className="text-xs text-sidebar-foreground/70">Pedidos y Compras</p>
          </div>
          <NavList role={role} />
        </div>
        <div className="space-y-2 rounded-md bg-sidebar-accent/60 p-3">
          <div>
            <p className="truncate text-sm font-medium text-sidebar-accent-foreground">
              {profile?.full_name ?? profile?.email ?? "Usuario"}
            </p>
            <p className="text-xs text-sidebar-foreground/70">{roleLabel(role)}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              void signOut();
            }}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-sidebar p-4">
              <SheetTitle className="mb-4 text-sidebar-foreground">{APP_NAME}</SheetTitle>
              <NavList role={role} onNavigate={() => setMenuOpen(false)} />
              <div className="mt-6 space-y-2">
                <p className="px-1 text-xs text-sidebar-foreground/70">
                  {profile?.full_name ?? profile?.email} · {roleLabel(role)}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    void signOut();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold text-primary-foreground">Manila | Pedidos y Compras</p>
          </div>

          <NavLink to="/notificaciones" aria-label="Notificaciones" className="relative">
            <Button variant="secondary" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-[11px] font-semibold text-warning-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </NavLink>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:py-6">{children}</main>
      </div>
    </div>
  );
};

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) => (
  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
  </div>
);
