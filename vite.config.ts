import { resolve } from "node:path";
import { defineConfig } from "vite";

// Library build. web-threshold.js registers <web-threshold> and re-exports the
// class + types; its name and path are public (jsDelivr). policy.js has no DOM.
// The CLI builds separately: vite.cli.config.ts.
export default defineConfig({
  build: {
    lib: {
      entry: {
        "web-threshold": resolve(import.meta.dirname, "src/gate/index.ts"),
        policy: resolve(import.meta.dirname, "src/policy/index.ts"),
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
  },
});
