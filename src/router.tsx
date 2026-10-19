import { AccessRoute, PublicOnlyRoute } from "./components/route-guards";
import AdminPanelPage from "./pages/admin/panel";
import AdminRequestsPage from "./pages/admin/pedidos";
import HelpPage from "./pages/ayuda";
import CatalogPage from "./pages/admin/catalogo";
import PurchaseDetailPage from "./pages/admin/compras/detalle";
import PurchasesPage from "./pages/admin/compras";
import NewPurchasePage from "./pages/admin/compras/nueva";
import PurchasePendingPage from "./pages/admin/pendientes-compra";
import ReceivedOrdersPage from "./pages/admin/recibidos";
import ReportsPage from "./pages/admin/reportes";
import SalesReportsPage from "./pages/admin/reportes-ventas";
import ChangeReviewPage from "./pages/admin/revision-cambios";
import UsersPage from "./pages/admin/usuarios";
import RoleHome from "./pages/inicio/role-home";
import LoginPage from "./pages/login";
import NewRequestPage from "./pages/nuevo";
import RequestFormPage from "./pages/nuevo/form";
import NotificationsPage from "./pages/notificaciones";
import NotFound from "./pages/NotFound";
import PendingPage from "./pages/pendiente";
import RequestDetailPage from "./pages/pedidos/detalle";
import MyRequestsPage from "./pages/pedidos";
import ProfilePage from "./pages/perfil";

export const routers = [
  {
    path: "/login",
    name: "login",
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  {
    path: "/pendiente",
    name: "pendiente-autorizacion",
    element: <PendingPage />,
  },
  {
    path: "/",
    name: "home",
    element: (
      <AccessRoute>
        <RoleHome />
      </AccessRoute>
    ),
  },
  {
    path: "/nuevo",
    name: "nuevo-pedido",
    element: (
      <AccessRoute>
        <NewRequestPage />
      </AccessRoute>
    ),
  },
  {
    path: "/nuevo/:categoria",
    name: "nuevo-pedido-form",
    element: (
      <AccessRoute>
        <RequestFormPage />
      </AccessRoute>
    ),
  },
  {
    path: "/pedidos",
    name: "pedidos",
    element: (
      <AccessRoute>
        <MyRequestsPage />
      </AccessRoute>
    ),
  },
  {
    path: "/pedidos/:id",
    name: "pedido-detalle",
    element: (
      <AccessRoute>
        <RequestDetailPage />
      </AccessRoute>
    ),
  },
  {
    path: "/notificaciones",
    name: "notificaciones",
    element: (
      <AccessRoute>
        <NotificationsPage />
      </AccessRoute>
    ),
  },
  {
    path: "/perfil",
    name: "perfil",
    element: (
      <AccessRoute>
        <ProfilePage />
      </AccessRoute>
    ),
  },
  {
    path: "/ayuda",
    name: "ayuda",
    element: (
      <AccessRoute>
        <HelpPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin",
    name: "admin-panel",
    element: (
      <AccessRoute requireRole="admin">
        <AdminPanelPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/pedidos",
    name: "admin-pedidos",
    element: (
      <AccessRoute requireRole="pedidos">
        <AdminRequestsPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/revision-cambios",
    name: "admin-revision-cambios",
    element: (
      <AccessRoute requireRole="admin">
        <ChangeReviewPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/recibidos",
    name: "admin-pedidos-recibidos",
    element: (
      <AccessRoute requireRole="pedidos">
        <ReceivedOrdersPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/pendientes-compra",
    name: "admin-pendientes-compra",
    element: (
      <AccessRoute requireRole="compras">
        <PurchasePendingPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/compras",
    name: "admin-compras",
    element: (
      <AccessRoute requireRole="compras">
        <PurchasesPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/compras/nueva",
    name: "admin-compra-nueva",
    element: (
      <AccessRoute requireRole="compras">
        <NewPurchasePage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/compras/:id",
    name: "admin-compra-detalle",
    element: (
      <AccessRoute requireRole="compras">
        <PurchaseDetailPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/catalogo",
    name: "admin-catalogo",
    element: (
      <AccessRoute requireRole="admin">
        <CatalogPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/usuarios",
    name: "admin-usuarios",
    element: (
      <AccessRoute requireRole="owner">
        <UsersPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/reportes",
    name: "admin-reportes",
    element: (
      <AccessRoute requireRole="admin">
        <ReportsPage />
      </AccessRoute>
    ),
  },
  {
    path: "/admin/reportes-ventas",
    name: "admin-reportes-ventas",
    element: (
      <AccessRoute requireRole="owner">
        <SalesReportsPage />
      </AccessRoute>
    ),
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
