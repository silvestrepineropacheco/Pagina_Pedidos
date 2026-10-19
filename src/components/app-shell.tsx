import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  Home,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  Plus,
  Settings2,
  ShoppingCart,
  Tags,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/auth-context";
import { useNotifications } from "@/hooks/use-purchases";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { roleLabel } from "@/lib/permissions";
import type { AppRole } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
}

/** Un grupo del menú: se abre y se cierra, y adentro tiene sus opciones. */
interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

const EVERYONE: AppRole[] = ["encargado", "admin", "owner", "finanzas"];
const ADMINS: AppRole[] = ["admin", "owner"];
// Quienes trabajan con compras: administradores, Propietario y Finanzas.
const COMPRAS: AppRole[] = ["admin", "owner", "finanzas"];
// La parte de ventas es solo para el Propietario.
const OWNER: AppRole[] = ["owner"];

const NAV_ENTRIES: NavEntry[] = [
  { to: "/", label: "Inicio", icon: Home, roles: EVERYONE },
  {
    id: "pedidos-compras",
    label: "Pedidos y Compras",
    icon: ShoppingCart,
    items: [
      { to: "/nuevo", label: "Nuevo pedido", icon: Plus, roles: ["encargado"] },
      { to: "/pedidos", label: "Pedidos", icon: ClipboardList, roles: ["encargado"] },
      { to: "/admin", label: "Panel de gestión", icon: LayoutDashboard, roles: ADMINS },
      { to: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, roles: COMPRAS },
      { to: "/admin/recibidos", label: "Recibidos y finalizados", icon: PackageCheck, roles: COMPRAS },
      { to: "/admin/revision-cambios", label: "Cambios a revisar", icon: FileCheck2, roles: ADMINS },
      { to: "/admin/pendientes-compra", label: "Compras pendientes", icon: ShoppingCart, roles: COMPRAS },
      { to: "/admin/compras", label: "Compras registradas", icon: Package, roles: COMPRAS },
      { to: "/admin/catalogo", label: "Catálogo", icon: Tags, roles: ADMINS },
      { to: "/admin/reportes", label: "Reportes", icon: BarChart3, roles: ADMINS },
    ],
  },
  {
    id: "ventas",
    label: "Ventas",
    icon: TrendingUp,
    items: [{ to: "/admin/reportes-ventas", label: "Reporte de ventas", icon: LineChart, roles: OWNER }],
  },
  { to: "/admin/usuarios", label: "Usuarios y permisos", icon: Users, roles: OWNER },
  { to: "/ayuda", label: "Cómo funciona", icon: BookOpen, roles: EVERYONE },
  { to: "/notificaciones", label: "Notificaciones", icon: Bell, roles: EVERYONE },
  { to: "/perfil", label: "Mi perfil", icon: Settings2, roles: EVERYONE },
];

const isGroup = (entry: NavEntry): entry is NavGroup => "items" in entry;

/** Opciones que puede ver el rol; los grupos sin ninguna opción visible no se muestran. */
const entriesFor = (role: AppRole | null): NavEntry[] => {
  if (!role) return [];
  const result: NavEntry[] = [];
  for (const entry of NAV_ENTRIES) {
    if (isGroup(entry)) {
      const items = entry.items.filter((item) => item.roles.includes(role));
      if (items.length > 0) result.push({ ...entry, items });
    } else if (entry.roles.includes(role)) {
      result.push(entry);
    }
  }
  return result;
};

// "/" y "/admin" son pantallas en sí mismas, no el comienzo de otras rutas.
const isExact = (to: string) => to === "/" || to === "/admin";

const matchesPath = (item: NavItem, pathname: string) =>
  pathname === item.to || (!isExact(item.to) && pathname.startsWith(`${item.to}/`));

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-sidebar-primary text-sidebar-primary-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );

const NavItemLink = ({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) => (
  <NavLink to={item.to} end={isExact(item.to)} onClick={onNavigate} className={linkClass}>
    <item.icon className="h-4 w-4 shrink-0" />
    <span className="truncate">{item.label}</span>
  </NavLink>
);

const NavList = ({ role, onNavigate }: { role: AppRole | null; onNavigate?: () => void }) => {
  const { pathname } = useLocation();
  const entries = useMemo(() => entriesFor(role), [role]);
  const activeGroupId = useMemo(
    () => entries.filter(isGroup).find((group) => group.items.some((item) => matchesPath(item, pathname)))?.id,
    [entries, pathname],
  );
  const [openGroups, setOpenGroups] = useState<string[]>(activeGroupId ? [activeGroupId] : []);

  // El grupo de la pantalla actual siempre queda abierto.
  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((current) => (current.includes(activeGroupId) ? current : [...current, activeGroupId]));
    }
  }, [activeGroupId]);

  const toggle = (id: string) =>
    setOpenGroups((current) => (current.includes(id) ? current.filter((open) => open !== id) : [...current, id]));

  return (
    <nav className="flex flex-col gap-1">
      {entries.map((entry) => {
        if (!isGroup(entry)) return <NavItemLink key={entry.to} item={entry} onNavigate={onNavigate} />;
        const open = openGroups.includes(entry.id);
        return (
          <div key={entry.id}>
            <button
              type="button"
              onClick={() => toggle(entry.id)}
              aria-expanded={open}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                entry.id === activeGroupId && !open && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <entry.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{entry.label}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
              <div className="ml-5 mt-1 flex flex-col gap-1 border-l border-sidebar-border pl-2">
                {entry.items.map((item) => (
                  <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
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
      <aside className="hidden w-72 shrink-0 flex-col justify-between bg-sidebar p-4 lg:flex print:!hidden">
        <div className="space-y-6">
          <div className="px-2 pt-2">
            <Logo onDark className="w-[170px]" />
            <p className="mt-1.5 text-xs text-sidebar-foreground/70">Pedidos y Compras</p>
            <p className="text-[11px] text-sidebar-foreground/50">Versión {APP_VERSION}</p>
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-primary px-4 py-3 lg:hidden print:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-sidebar p-4">
              <SheetTitle className="sr-only">{APP_NAME}</SheetTitle>
              <Logo onDark className="mb-4 w-[170px]" />
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

          <div className="flex min-w-0 flex-1 justify-center">
            <Logo onDark className="w-[132px]" />
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
