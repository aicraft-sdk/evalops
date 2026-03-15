import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // Removed Replit plugins: @replit/vite-plugin-cartographer and @replit/vite-plugin-runtime-error-modal
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@evalops/shared": path.resolve(__dirname, "../../libs/shared/src"),
      "@evalops/shared-db": path.resolve(__dirname, "../../libs/shared-db/src"),
      "@assets": path.resolve(__dirname, "../../attached_assets"),
    },
  },
  root: path.resolve(__dirname, "."),
  build: {
    outDir: path.resolve(__dirname, "../../dist/apps/frontend"),
    emptyOutDir: true,
  },
  server: {
    port: 4200,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

