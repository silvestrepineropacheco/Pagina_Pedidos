/**
 * Registro de errores sueltos: permite diagnosticar cierres o pantallas en
 * blanco sin que la aplicacion deje de funcionar.
 */
let installed = false;

export const installGlobalErrorHandlers = (): void => {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    console.error("Error no controlado:", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Promesa rechazada sin manejar:", event.reason);
  });
};
