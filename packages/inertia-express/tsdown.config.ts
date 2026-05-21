import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "core/index": "src/core/index.ts",
    "express/index": "src/express/index.ts",
  },
  format: "esm",
  platform: "node",
  target: "node24",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
});
