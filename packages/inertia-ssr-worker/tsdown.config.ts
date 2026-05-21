import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts" },
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
