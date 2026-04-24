import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

const WEB_PORT = Number.parseInt(process.env.WEB_PORT ?? "5173", 10);
const API_URL = process.env.API_URL ?? "http://localhost:5050";
const API_URL_WS = API_URL.replace(/^http/, "ws");

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: WEB_PORT,
    strictPort: false,
    proxy: {
      "/api": API_URL,
      "/ws": { target: API_URL_WS, ws: true },
      "/hook": API_URL,
      "/health": API_URL,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
