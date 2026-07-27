import { defineConfig } from "vitest/config";
import { resolve } from "path";
import dts from "vite-plugin-dts";
import { analyzer } from "vite-bundle-analyzer";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
    analyzer(),
  ],
  build: {
    outDir: "dist",
    sourcemap: "inline",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "blank-no-sugar",
      fileName: "index",
      formats: ["es", "cjs"],
    },
  },
  test: {
    // Tells Vitest to simulate a browser global environment
    environment: "jsdom", // or 'happy-dom'
    typecheck: {
      // Set to true to automatically include type checking
      enabled: true,
      // Ensure your file patterns match your testing schema
      include: ["**/tests/*.test-d.ts", "**/*.spec-d.ts"],
      // Set the compiler type if needed ('tsc' or 'vue-tsc')
      checker: "tsc",
    },
  },
});
