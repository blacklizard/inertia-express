import inertia from "@inertiajs/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// SSR is built separately and rendered by @blacklizard/inertia-ssr-worker.
// Disable the plugin's built-in SSR so it doesn't wrap our entry with
// @inertiajs/vue3/server's createServer.
export default defineConfig({
  plugins: [inertia({ ssr: false }), vue()],
  build: {
    manifest: true,
    rollupOptions: {
      input: "client/main.ts",
    },
  },
});
