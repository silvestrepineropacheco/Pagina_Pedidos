import { createRoot } from "react-dom/client";
import "./i18n/config";
import App from "./App.tsx";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

createRoot(container).render(<App />);
