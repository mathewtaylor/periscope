import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const WEB_PORT = Number.parseInt(process.env.WEB_PORT ?? "5173", 10);
const API_URL = process.env.API_URL ?? "http://localhost:5050";
const API_URL_WS = API_URL.replace(/^http/, "ws");

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

// Commit precedence: explicit GIT_COMMIT (Docker build-arg) → GITHUB_SHA
// (running under Actions) → local `git rev-parse` (dev). The .git directory
// is not present inside the container build context, so the build-arg path
// is what makes versioned images carry an honest commit hash.
function resolveCommit(): string {
  const explicit = process.env.GIT_COMMIT ?? process.env.GITHUB_SHA;
  if (explicit && explicit.length > 0) return explicit.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const APP_VERSION = pkg.version;
const APP_COMMIT = resolveCommit();

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
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
