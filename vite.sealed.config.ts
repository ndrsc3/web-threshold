import { resolve } from "node:path";
import { defineConfig } from "vite";

// The sealed element, as one file: a shell inlines it, so it can't load chunks.
// Runs after the library build, so it must not empty dist/.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/gate/sealed-entry.ts"),
      fileName: () => "web-threshold-sealed.js",
      formats: ["es"],
    },
  },
});
