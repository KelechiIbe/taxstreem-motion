import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/app.css";

// No StrictMode: the preview canvas is handed to the renderer worker once, which can't happen twice.
createRoot(document.getElementById("root")!).render(<App />);
