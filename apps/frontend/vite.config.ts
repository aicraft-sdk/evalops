import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@evalops/shared": path.resolve(__dirname, "../../libs/shared/src"),
      "@evalops/shared-db": path.resolve(__dirname, "../../libs/shared-db/src"),
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
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
});

