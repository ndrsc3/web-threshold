import { resolve } from "node:path";
import { defineConfig } from "vite";

// Library build: emits a single ES module that registers <finka-threshold>
// and re-exports the class + types. Consumers import "@finka/threshold".
export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      name: "FinkaThreshold",
      fileName: "finka-threshold",
      formats: ["es"],
    },
  },
});
