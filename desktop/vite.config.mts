import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  base: "./",
  plugins: [react(), svgr()],
  resolve: {
    alias: [
      "common",
      "element",
      "excalidraw",
      "math",
      "utils",
      "fractional-indexing",
      "laser-pointer",
    ].flatMap((name) => {
      const root = path.resolve(
        __dirname,
        "../packages",
        name,
        name === "excalidraw" ? "." : "src",
      );
      return [
        {
          find: new RegExp(`^@excalidraw/${name}$`),
          replacement: path.join(
            root,
            name === "excalidraw" ? "index.tsx" : "index.ts",
          ),
        },
        {
          find: new RegExp(`^@excalidraw/${name}/(.*)`),
          replacement: `${root}/$1`,
        },
      ];
    }),
  },
  build: { outDir: "dist", assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
  clearScreen: false,
});
