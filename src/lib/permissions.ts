import type { AppRole } from "./types";

/**
 * Capacidades por rol. Sirven para mostrar u ocultar acciones en la interfaz.
 * La verdad sobre los permisos vive en la base de datos (RLS + triggers),
 * por lo que ocultar un boton nunca es la unica proteccion.
 */
export const can = {
  hasAccess: (role?: AppRole | null) => role === "owner" || role === "admin" || role === "encargado",
  isAdmin: (role?: AppRole | null) => role === "owner" || role === "admin",
  isOwner: (role?: AppRole | null) => role === "owner",
  createRequest: (role?: AppRole | null) => role === "encargado" || role === "admin" || role === "owner",
  reviewRequests: (role?: AppRole | null) => role === "owner" || role === "admin",
  reviewChanges: (role?: AppRole | null) => role === "owner" || role === "admin",
  registerPurchase: (role?: AppRole | null) => role === "owner" || role === "admin",
  registerReceipt: () => true,
  manageCatalog: (role?: AppRole | null) => role === "owner" || role === "admin",
  manageUsers: (role?: AppRole | null) => role === "owner",
  viewReports: (role?: AppRole | null) => role === "owner" || role === "admin",
};

export const roleLabel = (role?: AppRole | null) => {
  switch (role) {
    case "owner":
      return "Propietario";
    case "admin":
      return "Administrador";
    case "encargado":
      return "Encargado de sector";
    default:
      return "Pendiente de autorización";
  }
};
