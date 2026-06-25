import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const host = process.env.TAURI_DEV_HOST;

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: {
    // Exposed to crashReport.ts / updater.ts so we don't have to hardcode.
    "window.__AGENTRIX_DESKTOP_VERSION__": JSON.stringify(pkg.version),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    fs: {
      allow: [".."],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari14",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    // Lift main-bundle warning ceiling and split heavy 3D / animation / vendor
    // libs into their own async chunks so the main entry stays lean.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          // 3D / VRM stack — only loaded when Pet 3D renderer mounts
          if (id.includes("three") || id.includes("@pixiv/three-vrm") || id.includes("@react-three") || id.includes("gsap")) {
            return "vendor-three";
          }
          // Rive runtime — only needed for Rive pet renderer
          if (id.includes("@rive-app") || id.includes("rive-react")) {
            return "vendor-rive";
          }
          // Markdown / syntax highlighting — only for chat bubbles with code
          if (id.includes("react-markdown") || id.includes("remark-") || id.includes("rehype-") || id.includes("highlight.js") || id.includes("shiki") || id.includes("prismjs")) {
            return "vendor-markdown";
          }
          // Live2D / cubism — only when avatar enabled
          if (id.includes("pixi-live2d") || id.includes("pixi.js") || id.includes("cubism") || id.includes("live2dcubismcore")) {
            return "vendor-live2d";
          }
          // Picovoice wake-word native bundle
          if (id.includes("@picovoice/") || id.includes("porcupine")) {
            return "vendor-wakeword";
          }
          if (id.includes("react-dom") || id.includes("scheduler")) {
            return "vendor-react";
          }
          if (id.includes("zustand") || id.includes("immer")) {
            return "vendor-state";
          }
        },
      },
    },
  },
});
