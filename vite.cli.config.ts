import { defineConfig } from "vite";

// The CLI, for Node, with the policy and bot list bundled in. Runs after the
// library build, so it must not empty dist/.
export default defineConfig({
  build: {
    ssr: "src/cli/index.ts",
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: "cli.js" } },
  },
  ssr: { noExternal: true },
});
