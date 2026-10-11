import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/* In production the console shares the web app's domain, mounted under this
   path by the root vercel.json. The build lands in a matching subfolder
   because Vercel hands the service the full /console/... request path. */
const PRODUCTION_BASE = "/console/";

export default defineConfig(({ command, mode }) => {
  // Every var, not just VITE_ ones: the dev hosts below never reach the
  // browser bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: command === "build" ? PRODUCTION_BASE : "/",
    build: { outDir: `dist${PRODUCTION_BASE}` },
    plugins: [react(), tailwindcss()],
    // Fixed port so Clerk's dev instance and muscle memory both know where the
    // console lives (the main app takes 3000).
    server: {
      port: 3001,
      strictPort: true,
      // Extra hosts allowed to reach the dev server (a proxy, another
      // device), comma-separated in DEV_ALLOWED_ORIGINS.
      allowedHosts: (env.DEV_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean),
    },
    resolve: {
      alias: {
        "~": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
