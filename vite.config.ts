import { resolve } from "node:path";
import { defineConfig } from "vite";

// Library build: emits a single ES module that registers <web-threshold>
// and re-exports the class + types. Consumers import "@ndrsc3/web-threshold".
export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "WebThreshold",
      fileName: "web-threshold",
      formats: ["es"],
    },
  },
});
