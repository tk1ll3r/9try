import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadLanguage } from "./kernel/i18n";
import "./kernel/theme";
import "./styles.css";

// The words of the chosen language are there before any screen is loaded. The screens come later, in their own files.
await loadLanguage();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
