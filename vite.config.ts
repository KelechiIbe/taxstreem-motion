import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2500,
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), lab: resolve(__dirname, "lab.html") } },
  },
  worker: { format: "es" },
});
