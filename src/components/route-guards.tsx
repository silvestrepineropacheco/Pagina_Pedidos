import { Navigate, useLocation } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { LoadingState } from "@/components/feedback";
import { useAuth } from "@/hooks/auth-context";
import { can } from "@/lib/permissions";

const FullPageLoading = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <LoadingState label="Cargando la aplicación..." />
  </div>
);

export const AccessRoute = ({
  children,
  requireRole,
}: {
  children: React.ReactNode;
  requireRole?: "admin" | "owner";
}) => {
  const { user, profile, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const withoutAccess = !profile || profile.role === "pending" || !profile.active;
  if (withoutAccess) return <Navigate to="/pendiente" replace />;

  if (requireRole === "admin" && !can.isAdmin(role)) return <Navigate to="/" replace />;
  if (requireRole === "owner" && !can.isOwner(role)) return <Navigate to="/" replace />;

  return <AppShell>{children}</AppShell>;
};

export const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <FullPageLoading />;
  if (user && profile && profile.role !== "pending" && profile.active) {
    return <Navigate to="/" replace />;
  }
  if (user && (!profile || profile.role === "pending" || !profile.active)) {
    return <Navigate to="/pendiente" replace />;
  }
  return <>{children}</>;
};
