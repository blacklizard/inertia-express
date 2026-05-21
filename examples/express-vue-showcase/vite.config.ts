import inertia from "@inertiajs/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// The Express server embeds this config via Vite middleware mode — see
// server/index.ts. `ssr: false` keeps the @inertiajs/vite plugin from wrapping
// the entry with its own SSR server; SSR is driven through vite.ssrLoadModule.
export default defineConfig({
  plugins: [inertia({ ssr: false }), vue()],
  appType: "custom",
});
